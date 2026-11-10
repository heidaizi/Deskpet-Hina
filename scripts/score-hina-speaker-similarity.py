#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import librosa
import numpy as np
import torch
from transformers import WavLMForXVector, Wav2Vec2FeatureExtractor

DATASET_ROOT = Path("~/.local/share/deskpet-tts/data/hina-multiform/dataset").expanduser()
MODEL_ID = "microsoft/wavlm-base-plus-sv"


def load_audio(path: Path) -> np.ndarray:
    waveform, sample_rate = librosa.load(path, sr=16_000, mono=True)
    return waveform.astype(np.float32)


def embedding(
    model: WavLMForXVector,
    feature_extractor: Wav2Vec2FeatureExtractor,
    waveform: np.ndarray,
) -> np.ndarray:
    inputs = feature_extractor(
        waveform,
        sampling_rate=16_000,
        return_tensors="pt",
        padding=True,
    )
    with torch.inference_mode():
        output = model(**inputs).embeddings
    vector = output.detach().cpu().numpy()[0]
    return vector / max(float(np.linalg.norm(vector)), 1e-9)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evaluation-dir", type=Path, nargs="+", required=True)
    args = parser.parse_args()

    model = WavLMForXVector.from_pretrained(MODEL_ID)
    feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(MODEL_ID)
    model.eval()

    reports = []
    for raw_directory in args.evaluation_dir:
        evaluation_dir = raw_directory.expanduser().resolve()
        summary = json.loads((evaluation_dir / "summary.json").read_text(encoding="utf-8"))
        rows = []
        for item in summary["items"]:
            if not item.get("reference_file"):
                continue
            generated = evaluation_dir / item["file"]
            reference = DATASET_ROOT / item["reference_file"]
            generated_embedding = embedding(
                model, feature_extractor, load_audio(generated)
            )
            reference_embedding = embedding(
                model, feature_extractor, load_audio(reference)
            )
            similarity = float(np.dot(generated_embedding, reference_embedding))
            rows.append(
                {
                    "emotion": item["emotion"],
                    "sample_id": item["sample_id"],
                    "similarity": round(similarity, 5),
                }
            )

        values = [row["similarity"] for row in rows]
        report = {
            "schemaVersion": 1,
            "model": MODEL_ID,
            "checkpoint_label": summary.get("label"),
            "average_similarity": round(float(np.mean(values)), 5) if values else None,
            "minimum_similarity": round(float(np.min(values)), 5) if values else None,
            "items": rows,
        }
        output = evaluation_dir / "speaker-similarity.json"
        output.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        reports.append(report)
    print(json.dumps(reports, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
