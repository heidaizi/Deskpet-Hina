#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf


def metrics(path: Path) -> dict[str, float]:
    waveform, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    mono = waveform.mean(axis=1)
    mono = mono - float(np.mean(mono))
    duration = len(mono) / sample_rate
    frame_length = 1024
    hop_length = 256
    frames = librosa.util.frame(
        mono,
        frame_length=frame_length,
        hop_length=hop_length,
    )
    rms = np.sqrt(np.mean(np.square(frames), axis=0))
    frame_db = 20.0 * np.log10(np.maximum(rms, 1e-8))
    noise_floor_db = float(np.quantile(frame_db, 0.10))
    speech_level_db = float(np.quantile(frame_db, 0.90))
    snr_proxy_db = speech_level_db - noise_floor_db

    spectrum = np.abs(
        librosa.stft(
            mono,
            n_fft=1024,
            hop_length=hop_length,
            window="hann",
        )
    )
    power = np.square(spectrum)
    freqs = librosa.fft_frequencies(sr=sample_rate, n_fft=1024)
    audible = power[freqs <= min(12_000, sample_rate / 2)]
    flatness = librosa.feature.spectral_flatness(S=power, n_fft=1024)[0]
    high_band = power[(freqs >= 7_500) & (freqs <= min(12_000, sample_rate / 2))]
    high_frequency_ratio = float(
        np.sum(high_band) / max(float(np.sum(audible)), 1e-12)
    )
    peak = float(np.max(np.abs(mono))) if mono.size else 0.0
    clipping = float(np.mean(np.abs(mono) >= 0.999)) if mono.size else 0.0

    return {
        "duration_seconds": round(duration, 4),
        "frame_noise_floor_dbfs": round(noise_floor_db, 3),
        "frame_speech_level_dbfs": round(speech_level_db, 3),
        "snr_proxy_db": round(snr_proxy_db, 3),
        "spectral_flatness_median": round(float(np.median(flatness)), 6),
        "high_frequency_ratio": round(high_frequency_ratio, 6),
        "peak": round(peak, 6),
        "clipping_fraction": round(clipping, 8),
    }


def csv_cell(value: object) -> str:
    return f'"{str(value).replace(chr(34), chr(34) * 2)}"'


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio-dir", type=Path, nargs="+", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    entries = []
    for raw_directory in args.audio_dir:
        directory = raw_directory.expanduser().resolve()
        for path in sorted(
            list(directory.rglob("*.wav")) + list(directory.rglob("*.ogg"))
        ):
            if "emotion-eval-all" in path.name or path.name.startswith("ab-"):
                continue
            result = metrics(path)
            entries.append(
                {
                    "group": directory.name,
                    "file": str(path),
                    "relative_file": str(path.relative_to(directory)),
                    **result,
                }
            )

    summary = {}
    for group in sorted({row["group"] for row in entries}):
        rows = [row for row in entries if row["group"] == group]
        summary[group] = {
            key: {
                "p50": round(float(np.median([row[key] for row in rows])), 6),
                "p90": round(float(np.quantile([row[key] for row in rows], 0.90)), 6),
                "p99": round(float(np.quantile([row[key] for row in rows], 0.99)), 6),
                "max": round(float(np.max([row[key] for row in rows])), 6),
            }
            for key in (
                "frame_noise_floor_dbfs",
                "snr_proxy_db",
                "spectral_flatness_median",
                "high_frequency_ratio",
                "clipping_fraction",
            )
        }
        summary[group]["files"] = len(rows)

    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "schemaVersion": 1,
        "note": (
            "Noise diagnostics only. High flatness/high-frequency ratios are "
            "screening signals, not proof that a clip is noisy."
        ),
        "summary": summary,
        "entries": entries,
    }
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    csv_path = output.with_suffix(".csv")
    columns = list(entries[0])
    csv_path.write_text(
        "\n".join(
            [
                ",".join(columns),
                *[
                    ",".join(csv_cell(row[column]) for column in columns)
                    for row in entries
                ],
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Report: {output}")
    print(f"CSV: {csv_path}")


if __name__ == "__main__":
    main()
