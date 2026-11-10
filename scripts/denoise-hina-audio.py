#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import shutil

import noisereduce as nr
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfiltfilt


def filtered(
    waveform: np.ndarray,
    sample_rate: int,
    highpass_hz: float,
    lowpass_hz: float,
) -> np.ndarray:
    nyquist = sample_rate / 2
    if highpass_hz > 0:
        sos = butter(
            2,
            highpass_hz / nyquist,
            btype="highpass",
            output="sos",
        )
        waveform = sosfiltfilt(sos, waveform)
    if lowpass_hz > 0 and lowpass_hz < nyquist:
        sos = butter(
            4,
            lowpass_hz / nyquist,
            btype="lowpass",
            output="sos",
        )
        waveform = sosfiltfilt(sos, waveform)
    return waveform.astype(np.float32)


def process_file(
    source: Path,
    destination: Path,
    strength: float,
    highpass_hz: float,
    lowpass_hz: float,
    target_peak_db: float,
) -> None:
    waveform, sample_rate = sf.read(source, dtype="float32", always_2d=True)
    mono = waveform.mean(axis=1)
    mono = mono - float(np.mean(mono))
    mono = filtered(mono, sample_rate, highpass_hz, lowpass_hz)
    if strength > 0:
        mono = nr.reduce_noise(
            y=mono,
            sr=sample_rate,
            stationary=True,
            prop_decrease=strength,
            n_fft=2048,
            win_length=2048,
            hop_length=512,
            n_jobs=1,
            use_tqdm=False,
        ).astype(np.float32)
    target_peak = 10 ** (target_peak_db / 20.0)
    peak = float(np.max(np.abs(mono))) if mono.size else 0.0
    if peak > target_peak:
        mono *= target_peak / peak
    destination.parent.mkdir(parents=True, exist_ok=True)
    sf.write(destination, mono, sample_rate, subtype="PCM_16")


def basic_metrics(path: Path) -> dict[str, float]:
    waveform, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    mono = waveform.mean(axis=1)
    return {
        "duration_seconds": round(len(mono) / sample_rate, 4),
        "peak": round(float(np.max(np.abs(mono))), 6) if mono.size else 0.0,
        "clipped_fraction": (
            round(float(np.mean(np.abs(mono) >= 0.999)), 8) if mono.size else 0.0
        ),
        "silence_fraction": (
            round(float(np.mean(np.abs(mono) < 1e-4)), 6) if mono.size else 0.0
        ),
        "rms_mean": (
            round(float(np.sqrt(np.mean(np.square(mono)))), 6) if mono.size else 0.0
        ),
    }


def update_summary(output_root: Path) -> None:
    summary_path = output_root / "summary.json"
    if not summary_path.exists():
        return
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    for item in summary.get("items", []):
        path = output_root / item["file"]
        if path.exists():
            item.update(basic_metrics(path))
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    rows = summary.get("items", [])
    if rows:
        with (output_root / "summary.csv").open(
            "w",
            encoding="utf-8",
            newline="",
        ) as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--input-dir", type=Path)
    source_group.add_argument("--input-file", type=Path)
    output_group = parser.add_mutually_exclusive_group(required=True)
    output_group.add_argument("--output-dir", type=Path)
    output_group.add_argument("--output-file", type=Path)
    parser.add_argument("--strength", type=float, default=0.55)
    parser.add_argument("--highpass-hz", type=float, default=55.0)
    parser.add_argument("--lowpass-hz", type=float, default=14_000.0)
    parser.add_argument("--target-peak-db", type=float, default=-1.0)
    args = parser.parse_args()
    if not 0 <= args.strength <= 1:
        raise ValueError("--strength must be between 0 and 1")

    if args.input_file is not None:
        source = args.input_file.expanduser().resolve()
        destination = args.output_file.expanduser().resolve()
        process_file(
            source,
            destination,
            strength=args.strength,
            highpass_hz=args.highpass_hz,
            lowpass_hz=args.lowpass_hz,
            target_peak_db=args.target_peak_db,
        )
        print(f"Denoised {source} -> {destination}")
        return

    source_root = args.input_dir.expanduser().resolve()
    output_root = args.output_dir.expanduser().resolve()
    files = sorted(
        list(source_root.rglob("*.wav")) + list(source_root.rglob("*.ogg"))
    )
    if not files:
        raise RuntimeError(f"No WAV files found under {source_root}")
    for index, source in enumerate(files, start=1):
        relative = source.relative_to(source_root)
        destination = (output_root / relative).with_suffix(".wav")
        process_file(
            source,
            destination,
            strength=args.strength,
            highpass_hz=args.highpass_hz,
            lowpass_hz=args.lowpass_hz,
            target_peak_db=args.target_peak_db,
        )
        print(f"[{index}/{len(files)}] {relative}")
    for filename in ("summary.json", "summary.csv"):
        source = source_root / filename
        if source.exists():
            shutil.copy2(source, output_root / filename)
    update_summary(output_root)
    print(f"Denoised {len(files)} files into {output_root}")


if __name__ == "__main__":
    main()
