#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
import soundfile as sf


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    root = args.project_root.expanduser().resolve()
    evaluation_root = (
        root / "assets/characters/hina-swimsuit/private/audio/app-tts-eval"
    )
    groups = [
        (
            "dialogues",
            root / "content/hina-app-dialogue-eval.json",
            evaluation_root / "dialogues",
        ),
        (
            "emotions",
            root / "content/hina-app-emotion-eval.json",
            evaluation_root / "emotions",
        ),
    ]
    report = {"schemaVersion": 1, "groups": {}}
    for name, spec_path, directory in groups:
        spec = read_json(spec_path)
        summary = read_json(directory / "summary.json")
        spec_by_id = {item["sample_id"]: item for item in spec["items"]}
        rows = []
        for item in summary["items"]:
            source = spec_by_id[item["sample_id"]]
            rows.append(
                {
                    "sample_id": item["sample_id"],
                    "display_text": source.get("display_text", ""),
                    "emotion": item["emotion"],
                    "text": item["text"],
                    "file": item["file"],
                    "duration_seconds": item["duration_seconds"],
                    "peak": item["peak"],
                    "clipped_fraction": item["clipped_fraction"],
                    "silence_fraction": item["silence_fraction"],
                    "rms_mean": item["rms_mean"],
                    "f0_mean_hz": item["f0_mean_hz"],
                }
            )
        expected_count = len(spec["items"]) * int(summary.get("repeats", 1))
        if len(rows) != expected_count:
            raise RuntimeError(
                f"{name}: expected {expected_count} outputs, got {len(rows)}"
            )
        durations = [row["duration_seconds"] for row in rows]
        flags = []
        for row in rows:
            if row["duration_seconds"] < 0.5:
                flags.append(f"{row['file']}: too short")
            if row["clipped_fraction"] > 0:
                flags.append(f"{row['file']}: clipped")
            if row["silence_fraction"] > 0.60:
                flags.append(f"{row['file']}: silence={row['silence_fraction']}")
        report["groups"][name] = {
            "files": len(rows),
            "duration_seconds": round(float(np.sum(durations)), 3),
            "duration_min": round(float(np.min(durations)), 3),
            "duration_max": round(float(np.max(durations)), 3),
            "max_peak": round(float(np.max([row["peak"] for row in rows])), 6),
            "max_clipped_fraction": round(
                float(np.max([row["clipped_fraction"] for row in rows])),
                8,
            ),
            "max_silence_fraction": round(
                float(np.max([row["silence_fraction"] for row in rows])),
                6,
            ),
            "flags": flags,
            "items": rows,
        }
        write_csv(directory / f"{name}-report.csv", rows)
        selected = rows if name == "dialogues" else [
            row for row in rows if row["file"].endswith("-r1-" + row["emotion"] + ".wav")
        ]
        combine(directory / f"{name}-all.wav", directory, selected)

    output = evaluation_root / "acceptance-report.json"
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report["groups"], ensure_ascii=False, indent=2))
    print(f"Report: {output}")


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def combine(path: Path, audio_root: Path, rows: list[dict]) -> None:
    pieces = []
    sample_rate = None
    for row in rows:
        waveform, current_rate = sf.read(
            audio_root / row["file"],
            dtype="float32",
            always_2d=True,
        )
        if sample_rate is None:
            sample_rate = current_rate
        if current_rate != sample_rate:
            raise RuntimeError(f"Unexpected sample rate in {row['file']}")
        pieces.extend(
            [
                waveform.mean(axis=1),
                np.zeros(int(sample_rate * 0.3), dtype=np.float32),
            ]
        )
    if sample_rate is None:
        raise RuntimeError("No audio rows to combine")
    sf.write(path, np.concatenate(pieces), sample_rate, subtype="PCM_16")


if __name__ == "__main__":
    main()
