#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import librosa
import numpy as np
import torch
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from transformers import WavLMForXVector, Wav2Vec2FeatureExtractor

MODEL_ID = "microsoft/wavlm-base-plus-sv"
DATASET_ROOT = Path(
    "~/.local/share/deskpet-tts/data/hina-multiform/dataset"
).expanduser()
PRIVATE_ROOT = Path(
    "assets/characters/hina-swimsuit/private/audio/training/multiform"
)
REVIEWED_CATALOG = PRIVATE_ROOT / "hina-multiform-training-v2.json"
CACHE_PATH = PRIVATE_ROOT / "emotion-wavlm-embeddings.json"
EMOTION_FAMILIES = {
    "neutral": "calm",
    "soft": "calm",
    "happy": "positive",
    "playful": "positive",
    "embarrassed": "positive",
    "annoyed": "negative",
    "stern": "negative",
    "sad": "sad_tired",
    "tired": "sad_tired",
    "surprised": "surprised",
    "suspicious": "negative",
    "warning": "negative",
    "reluctant": "positive",
    "deadpan": "calm",
    "calm": "calm",
}


def read_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def masked_stats(values: torch.Tensor, mask: torch.Tensor) -> np.ndarray:
    weights = mask.unsqueeze(-1).to(values.dtype)
    count = weights.sum(dim=1).clamp_min(1.0)
    mean = (values * weights).sum(dim=1) / count
    variance = (((values - mean[:, None]) ** 2) * weights).sum(dim=1) / count
    return torch.cat([mean, torch.sqrt(variance.clamp_min(0))], dim=1)[0].numpy()


def embedding(
    model: WavLMForXVector,
    feature_extractor: Wav2Vec2FeatureExtractor,
    path: Path,
) -> list[float]:
    waveform, _ = librosa.load(path, sr=16_000, mono=True)
    inputs = feature_extractor(
        waveform.astype(np.float32),
        sampling_rate=16_000,
        return_tensors="pt",
        padding=True,
    )
    with torch.inference_mode():
        output = model(**inputs, output_hidden_states=True)
    hidden = output.hidden_states
    mask = model.wavlm._get_feature_vector_attention_mask(
        hidden[0].shape[1],
        inputs["attention_mask"],
    )
    combined = np.concatenate(
        [
            masked_stats(hidden[6], mask),
            masked_stats(hidden[-1], mask),
        ]
    )
    norm = float(np.linalg.norm(combined))
    return (combined / max(norm, 1e-9)).tolist()


def load_cache() -> dict[str, list[float]]:
    if not CACHE_PATH.exists():
        return {}
    return json.loads(CACHE_PATH.read_text(encoding="utf-8"))


def save_cache(cache: dict[str, list[float]]) -> None:
    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def get_embedding(
    path: Path,
    model: WavLMForXVector,
    feature_extractor: Wav2Vec2FeatureExtractor,
    cache: dict[str, list[float]],
) -> list[float]:
    key = str(path.expanduser().resolve())
    if key not in cache:
        cache[key] = embedding(model, feature_extractor, path)
        save_cache(cache)
    return cache[key]


def metrics(truth: list[str], predicted: list[str]) -> dict:
    return {
        "samples": len(truth),
        "accuracy": round(float(accuracy_score(truth, predicted)), 5),
        "balanced_accuracy": round(
            float(balanced_accuracy_score(truth, predicted)), 5
        ),
        "macro_f1": round(
            float(f1_score(truth, predicted, average="macro", zero_division=0)),
            5,
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evaluation-dir", type=Path, nargs="+", required=True)
    args = parser.parse_args()

    reviewed = json.loads(REVIEWED_CATALOG.read_text(encoding="utf-8"))
    reviewed_labels = {
        entry["id"]: entry["emotion"] for entry in reviewed["entries"]
    }
    train_rows = read_jsonl(DATASET_ROOT / "metadata.jsonl")
    validation_rows = read_jsonl(DATASET_ROOT / "metadata-validation.jsonl")

    model = WavLMForXVector.from_pretrained(MODEL_ID)
    feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(MODEL_ID)
    model.eval()
    cache = load_cache()

    def feature(row: dict) -> list[float]:
        return get_embedding(
            DATASET_ROOT / row["file_name"],
            model,
            feature_extractor,
            cache,
        )

    train_x = np.asarray([feature(row) for row in train_rows])
    train_y = np.asarray(
        [reviewed_labels.get(row["sample_id"], row["emotion"]) for row in train_rows]
    )
    validation_x = np.asarray([feature(row) for row in validation_rows])
    validation_y = np.asarray(
        [
            reviewed_labels.get(row["sample_id"], row["emotion"])
            for row in validation_rows
        ]
    )
    model_10 = make_pipeline(
        StandardScaler(),
        SVC(C=1.0, class_weight="balanced", random_state=20261024),
    )
    model_10.fit(train_x, train_y)
    predicted_10 = model_10.predict(validation_x)
    family_train = np.asarray([EMOTION_FAMILIES[value] for value in train_y])
    family_validation = np.asarray(
        [EMOTION_FAMILIES[value] for value in validation_y]
    )
    model_family = make_pipeline(
        StandardScaler(),
        SVC(C=1.0, class_weight="balanced", random_state=20261024),
    )
    model_family.fit(train_x, family_train)
    predicted_family = model_family.predict(validation_x)

    reports = []
    for raw_directory in args.evaluation_dir:
        directory = raw_directory.expanduser().resolve()
        summary = json.loads(
            (directory / "summary.json").read_text(encoding="utf-8")
        )
        x = np.asarray(
            [
                get_embedding(
                    directory / item["file"],
                    model,
                    feature_extractor,
                    cache,
                )
                for item in summary["items"]
            ]
        )
        intended = [item["emotion"] for item in summary["items"]]
        predicted = model_10.predict(x).tolist()
        predicted_families = model_family.predict(x).tolist()
        report = {
            "schemaVersion": 1,
            "label": summary["label"],
            "model": MODEL_ID,
            "training_samples": len(train_rows),
            "validation_10way": metrics(
                validation_y.tolist(),
                predicted_10.tolist(),
            ),
            "validation_family": metrics(
                family_validation.tolist(),
                predicted_family.tolist(),
            ),
            "generated_10way": metrics(intended, predicted),
            "generated_family": metrics(
                [EMOTION_FAMILIES[value] for value in intended],
                predicted_families,
            ),
            "items": [
                {
                    "file": item["file"],
                    "intended": item["emotion"],
                    "predicted": prediction,
                    "predicted_family": predicted_family,
                }
                for item, prediction, predicted_family in zip(
                    summary["items"],
                    predicted,
                    predicted_families,
                    strict=True,
                )
            ],
        }
        output = directory / "emotion-wavlm-classification.json"
        output.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        reports.append(
            {
                "label": report["label"],
                "generated_10way": report["generated_10way"],
                "generated_family": report["generated_family"],
                "validation_10way": report["validation_10way"],
                "validation_family": report["validation_family"],
                "output": str(output),
            }
        )
    print(json.dumps(reports, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
