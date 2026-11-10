#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf

DATA_ROOT = Path("~/.local/share/deskpet-tts/data/hina-multiform").expanduser()
DATASET_ROOT = DATA_ROOT / "dataset"
OUTPUT_PATH = (
    Path("assets/characters/hina-swimsuit/private/audio/training/multiform")
    / "audio-quality-audit.json"
)


def read_rows(name: str) -> list[dict]:
    path = DATASET_ROOT / name
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def metrics(path: Path) -> dict[str, float | int]:
    waveform, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    mono = waveform.mean(axis=1)
    peak = float(np.max(np.abs(mono))) if mono.size else 0.0
    rms = float(np.sqrt(np.mean(np.square(mono)))) if mono.size else 0.0
    clipped = float(np.mean(np.abs(mono) >= 0.999)) if mono.size else 0.0
    silence = float(np.mean(np.abs(mono) < 1e-4)) if mono.size else 0.0
    return {
        "sample_rate": int(sample_rate),
        "channels": int(waveform.shape[1]),
        "duration_seconds": round(len(mono) / sample_rate, 4),
        "peak": round(peak, 6),
        "rms": round(rms, 6),
        "rms_dbfs": round(20 * np.log10(max(rms, 1e-9)), 3),
        "clipped_fraction": round(clipped, 8),
        "silence_fraction": round(silence, 6),
    }


def main() -> None:
    unique = {}
    for row in read_rows("metadata.jsonl") + read_rows("metadata-validation.jsonl"):
        unique[row["sample_id"]] = row

    entries = []
    problems = []
    for row in sorted(unique.values(), key=lambda item: item["sample_id"]):
        result = metrics(DATASET_ROOT / row["file_name"])
        entries.append(
            {
                "sample_id": row["sample_id"],
                "variant": row["variant"],
                "emotion": row["emotion"],
                "split": row["split"],
                **result,
            }
        )
        if result["clipped_fraction"] > 0.001:
            problems.append(f"{row['sample_id']}: clipping={result['clipped_fraction']}")
        if result["rms_dbfs"] < -40:
            problems.append(f"{row['sample_id']}: rms_dbfs={result['rms_dbfs']}")
        if result["sample_rate"] != 48_000 or result["channels"] != 1:
            problems.append(
                f"{row['sample_id']}: unexpected format "
                f"{result['channels']}ch/{result['sample_rate']}Hz"
            )

    report = {
        "schemaVersion": 1,
        "files": len(entries),
        "problems": problems,
        "entries": entries,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"files": len(entries), "problems": problems}, indent=2))
    print(f"Audio audit: {OUTPUT_PATH}")
    if problems:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
