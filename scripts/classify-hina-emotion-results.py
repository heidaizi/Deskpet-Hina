#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

import librosa
import numpy as np
from sklearn.ensemble import (
    ExtraTreesClassifier,
    HistGradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.ensemble import VotingClassifier

DATASET_ROOT = Path(
    "~/.local/share/deskpet-tts/data/hina-multiform/dataset"
).expanduser()
PRIVATE_ROOT = Path(
    "assets/characters/hina-swimsuit/private/audio/training/multiform"
)
REVIEWED_CATALOG = PRIVATE_ROOT / "hina-multiform-training-v2.json"
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


def japanese_character_count(text: str) -> int:
    return len(re.sub(r"[\s。、！？!?…「」『』（）()・〜～―—\-]", "", text))


def json_number(value: float) -> float:
    return round(float(value), 6) if np.isfinite(value) else 0.0


def audio_features(path: Path, text: str) -> dict[str, float]:
    waveform, sample_rate = librosa.load(path, sr=24_000, mono=True)
    waveform, _ = librosa.effects.trim(waveform, top_db=35)
    if waveform.size < sample_rate // 5:
        raise ValueError(f"Audio is too short after trimming: {path}")

    hop_length = 256
    frame_length = 2048
    duration = len(waveform) / sample_rate
    rms = librosa.feature.rms(
        y=waveform,
        frame_length=frame_length,
        hop_length=hop_length,
    )[0]
    rms_db = 20.0 * np.log10(np.maximum(rms, 1e-7))
    f0 = librosa.yin(
        waveform,
        fmin=70,
        fmax=500,
        sr=sample_rate,
        frame_length=frame_length,
        hop_length=hop_length,
    )
    voiced = f0[np.isfinite(f0) & (f0 >= 70) & (f0 <= 500)]
    if voiced.size == 0:
        raise ValueError(f"No voiced pitch frames found: {path}")
    log_f0 = np.log(voiced)
    log_f0_delta = np.abs(np.diff(log_f0))

    centroid = librosa.feature.spectral_centroid(
        y=waveform,
        sr=sample_rate,
        hop_length=hop_length,
    )[0]
    bandwidth = librosa.feature.spectral_bandwidth(
        y=waveform,
        sr=sample_rate,
        hop_length=hop_length,
    )[0]
    rolloff = librosa.feature.spectral_rolloff(
        y=waveform,
        sr=sample_rate,
        hop_length=hop_length,
        roll_percent=0.85,
    )[0]
    flatness = librosa.feature.spectral_flatness(
        y=waveform,
        n_fft=frame_length,
        hop_length=hop_length,
    )[0]
    zcr = librosa.feature.zero_crossing_rate(
        waveform,
        frame_length=frame_length,
        hop_length=hop_length,
    )[0]
    mfcc = librosa.feature.mfcc(
        y=waveform,
        sr=sample_rate,
        n_mfcc=13,
        hop_length=hop_length,
    )
    onset_frames = librosa.onset.onset_detect(
        y=waveform,
        sr=sample_rate,
        hop_length=hop_length,
        backtrack=False,
    )
    characters = max(japanese_character_count(text), 1)

    features = {
        "log_duration": np.log(duration),
        "characters_per_second": characters / duration,
        "f0_log_median": np.median(log_f0),
        "f0_log_std": np.std(log_f0),
        "f0_log_iqr": np.quantile(log_f0, 0.75) - np.quantile(log_f0, 0.25),
        "f0_log_p10": np.quantile(log_f0, 0.10),
        "f0_log_p90": np.quantile(log_f0, 0.90),
        "f0_delta_mean": np.mean(log_f0_delta) if log_f0_delta.size else 0.0,
        "f0_delta_std": np.std(log_f0_delta) if log_f0_delta.size else 0.0,
        "rms_db_mean": np.mean(rms_db),
        "rms_db_std": np.std(rms_db),
        "rms_db_p10": np.quantile(rms_db, 0.10),
        "rms_db_p90": np.quantile(rms_db, 0.90),
        "centroid_log_mean": np.mean(np.log1p(centroid)),
        "centroid_log_std": np.std(np.log1p(centroid)),
        "bandwidth_log_mean": np.mean(np.log1p(bandwidth)),
        "rolloff_log_mean": np.mean(np.log1p(rolloff)),
        "flatness_mean": np.mean(flatness),
        "zcr_mean": np.mean(zcr),
        "zcr_std": np.std(zcr),
        "onsets_per_second": len(onset_frames) / duration,
    }
    for index, values in enumerate(mfcc, start=1):
        features[f"mfcc_{index:02d}_mean"] = np.mean(values)
        features[f"mfcc_{index:02d}_std"] = np.std(values)
    return {name: json_number(value) for name, value in features.items()}


def load_feature_cache(path: Path) -> dict[str, dict[str, float]]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def feature_for(
    path: Path,
    text: str,
    cache: dict[str, dict[str, float]],
) -> dict[str, float]:
    key = str(path.expanduser().resolve())
    if key not in cache:
        cache[key] = audio_features(path, text)
    return cache[key]


def vector(features: dict[str, float], feature_names: list[str]) -> list[float]:
    return [features[name] for name in feature_names]


def make_classifier(kind: str):
    if kind == "logistic":
        return make_pipeline(
            StandardScaler(),
            LogisticRegression(
                C=0.35,
                class_weight="balanced",
                max_iter=4_000,
                random_state=20261024,
            ),
        )
    if kind == "svc":
        return make_pipeline(
            StandardScaler(),
            SVC(
                C=1.0,
                class_weight="balanced",
                probability=True,
                random_state=20261024,
            ),
        )
    if kind == "extra_trees":
        return ExtraTreesClassifier(
            n_estimators=500,
            min_samples_leaf=2,
            class_weight="balanced",
            n_jobs=-1,
            random_state=20261024,
        )
    if kind == "hgb":
        return HistGradientBoostingClassifier(
            max_iter=300,
            learning_rate=0.05,
            max_leaf_nodes=15,
            l2_regularization=0.1,
            random_state=20261024,
        )
    return VotingClassifier(
        estimators=[
            (
                "logistic",
                make_pipeline(
                    StandardScaler(),
                    LogisticRegression(
                        C=0.35,
                        class_weight="balanced",
                        max_iter=4_000,
                        random_state=20261024,
                    ),
                ),
            ),
            (
                "svm",
                make_pipeline(
                    StandardScaler(),
                    SVC(
                        C=1.2,
                        class_weight="balanced",
                        probability=True,
                        random_state=20261024,
                    ),
                ),
            ),
            (
                "forest",
                RandomForestClassifier(
                    n_estimators=400,
                    min_samples_leaf=2,
                    class_weight="balanced_subsample",
                    n_jobs=-1,
                    random_state=20261024,
                ),
            ),
        ],
        voting="soft",
        weights=[2, 2, 1],
    )


def make_family_classifier():
    return HistGradientBoostingClassifier(
        max_iter=300,
        learning_rate=0.05,
        max_leaf_nodes=15,
        l2_regularization=0.1,
        random_state=20261024,
    )


def rank_of(values: np.ndarray, target_index: int) -> int:
    sorted_indices = np.argsort(values)[::-1]
    return int(np.where(sorted_indices == target_index)[0][0]) + 1


def summarize(rows: list[dict], labels: list[str]) -> dict:
    if not rows:
        return {
            "samples": 0,
            "accuracy": None,
            "balanced_accuracy": None,
            "macro_f1": None,
            "mean_expected_probability": None,
            "mean_margin": None,
            "mean_target_rank": None,
        }
    intended = [row["intended_emotion"] for row in rows]
    predicted = [row["predicted_emotion"] for row in rows]
    return {
        "samples": len(rows),
        "accuracy": round(float(accuracy_score(intended, predicted)), 5),
        "balanced_accuracy": round(
            float(balanced_accuracy_score(intended, predicted)), 5
        ),
        "macro_f1": round(
            float(f1_score(intended, predicted, average="macro", zero_division=0)),
            5,
        ),
        "mean_expected_probability": round(
            float(np.mean([row["intended_probability"] for row in rows])), 5
        ),
        "mean_margin": round(float(np.mean([row["margin"] for row in rows])), 5),
        "mean_target_rank": round(
            float(np.mean([row["intended_rank"] for row in rows])), 3
        ),
        "labels": labels,
    }


def acoustic_separation(
    items: list[dict],
    feature_names: list[str],
) -> dict:
    groups = {}
    for item in items:
        groups.setdefault(item["intended_emotion"], []).append(
            vector(item["features"], feature_names)
        )
    eligible = {
        emotion: np.asarray(values, dtype=float)
        for emotion, values in groups.items()
        if len(values) >= 2
    }
    if len(eligible) < 2:
        return {
            "eligible_emotions": len(eligible),
            "within_emotion_distance": None,
            "between_emotion_distance": None,
            "separation_ratio": None,
            "caveat": "Needs at least two repeats for two or more emotions.",
        }

    all_values = np.concatenate(list(eligible.values()))
    mean = all_values.mean(axis=0)
    std = all_values.std(axis=0)
    std[std < 1e-8] = 1.0
    normalized = {
        emotion: (values - mean) / std for emotion, values in eligible.items()
    }
    within = []
    for values in normalized.values():
        for left in range(len(values) - 1):
            for right in range(left + 1, len(values)):
                within.append(np.linalg.norm(values[left] - values[right]))
    centroids = {
        emotion: values.mean(axis=0) for emotion, values in normalized.items()
    }
    centroid_items = list(centroids.values())
    between = []
    for left in range(len(centroid_items) - 1):
        for right in range(left + 1, len(centroid_items)):
            between.append(
                np.linalg.norm(centroid_items[left] - centroid_items[right])
            )
    within_mean = float(np.mean(within))
    between_mean = float(np.mean(between))
    return {
        "eligible_emotions": len(eligible),
        "repeats_per_emotion": {
            emotion: len(values) for emotion, values in groups.items()
        },
        "within_emotion_distance": round(within_mean, 5),
        "between_emotion_distance": round(between_mean, 5),
        "separation_ratio": round(between_mean / max(within_mean, 1e-8), 5),
        "caveat": (
            "Acoustic screen only. Higher separation_ratio means the same-text "
            "captions form more consistent and more distinct clusters."
        ),
    }


def predict_rows(
    model,
    classes: list[str],
    items: list[dict],
    feature_names: list[str],
) -> list[dict]:
    probabilities = model.predict_proba(
        np.asarray([vector(item["features"], feature_names) for item in items])
    )
    rows = []
    for item, values in zip(items, probabilities, strict=True):
        intended = item["intended_emotion"]
        predicted_index = int(np.argmax(values))
        target_index = classes.index(intended) if intended in classes else None
        top_two = np.sort(values)[-2:]
        rows.append(
            {
                "file": item["file"],
                "intended_emotion": intended,
                "predicted_emotion": classes[predicted_index],
                "confidence": round(float(values[predicted_index]), 5),
                "intended_probability": (
                    round(float(values[target_index]), 5)
                    if target_index is not None
                    else 0.0
                ),
                "intended_rank": (
                    rank_of(values, target_index)
                    if target_index is not None
                    else len(classes) + 1
                ),
                "margin": round(
                    float(top_two[-1] - top_two[-2])
                    if top_two.size > 1
                    else top_two[-1],
                    5,
                ),
                "correct": classes[predicted_index] == intended,
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evaluation-dir", type=Path, nargs="+", required=True)
    parser.add_argument(
        "--classifier",
        choices=["logistic", "svc", "extra_trees", "hgb", "ensemble"],
        default="svc",
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=PRIVATE_ROOT / "emotion-features.json",
    )
    args = parser.parse_args()

    train_rows = read_jsonl(DATASET_ROOT / "metadata.jsonl")
    validation_rows = read_jsonl(DATASET_ROOT / "metadata-validation.jsonl")
    cache = load_feature_cache(args.cache.expanduser())
    reviewed_catalog = json.loads(REVIEWED_CATALOG.read_text(encoding="utf-8"))
    reviewed_emotions = {
        row["id"]: row["emotion"] for row in reviewed_catalog["entries"]
    }

    def dataset_item(row: dict) -> dict:
        return {
            "file": row["sample_id"],
            "intended_emotion": reviewed_emotions.get(
                row["sample_id"],
                row["emotion"],
            ),
            "features": feature_for(
                DATASET_ROOT / row["file_name"],
                row["text"],
                cache,
            ),
        }

    train_items = [dataset_item(row) for row in train_rows]
    validation_items = [dataset_item(row) for row in validation_rows]
    feature_names = list(train_items[0]["features"])
    if any(list(item["features"]) != feature_names for item in train_items):
        raise RuntimeError("Inconsistent feature schema in training rows.")

    model = make_classifier(args.classifier)
    model.fit(
        np.asarray([vector(item["features"], feature_names) for item in train_items]),
        [item["intended_emotion"] for item in train_items],
    )
    classes = list(model.classes_)
    validation_predictions = predict_rows(
        model, classes, validation_items, feature_names
    )
    validation_summary = summarize(validation_predictions, classes)
    family_model = make_family_classifier()
    family_model.fit(
        np.asarray([vector(item["features"], feature_names) for item in train_items]),
        [EMOTION_FAMILIES[item["intended_emotion"]] for item in train_items],
    )
    family_classes = list(family_model.classes_)
    family_validation_items = [
        {
            **item,
            "intended_emotion": EMOTION_FAMILIES[item["intended_emotion"]],
        }
        for item in validation_items
    ]
    family_validation_predictions = predict_rows(
        family_model,
        family_classes,
        family_validation_items,
        feature_names,
    )
    family_validation_summary = summarize(
        family_validation_predictions,
        family_classes,
    )

    reports = []
    for raw_directory in args.evaluation_dir:
        evaluation_dir = raw_directory.expanduser().resolve()
        summary = json.loads(
            (evaluation_dir / "summary.json").read_text(encoding="utf-8")
        )
        items = []
        for item in summary["items"]:
            audio_path = evaluation_dir / item["file"]
            items.append(
                {
                    "file": item["file"],
                    "intended_emotion": item["emotion"],
                    "features": feature_for(audio_path, item["text"], cache),
                }
            )
        rows = predict_rows(model, classes, items, feature_names)
        aggregate = summarize(rows, classes)
        family_items = [
            {
                **item,
                "intended_emotion": EMOTION_FAMILIES[item["intended_emotion"]],
            }
            for item in items
        ]
        family_rows = predict_rows(
            family_model,
            family_classes,
            family_items,
            feature_names,
        )
        family_aggregate = summarize(family_rows, family_classes)
        report = {
            "schemaVersion": 2,
            "caveat": (
                "Screening only: this classifier is trained on 192 short source "
                "clips and ten imbalanced labels. Use validation_screen and "
                "relative comparisons; never treat one prediction as ground truth."
            ),
            "checkpoint_label": summary.get("label"),
            "training_labels": str(REVIEWED_CATALOG.resolve()),
            "classifier": args.classifier,
            "training_samples": len(train_items),
            "validation_screen": validation_summary,
            "validation_items": validation_predictions,
            "emotion_family_map": EMOTION_FAMILIES,
            "family_validation_screen": family_validation_summary,
            "family_validation_items": family_validation_predictions,
            "generated_summary": aggregate,
            "generated_acoustic_separation": acoustic_separation(
                items, feature_names
            ),
            "generated_items": rows,
            "generated_family_summary": family_aggregate,
            "generated_family_items": family_rows,
        }
        output_path = evaluation_dir / "emotion-classification.json"
        csv_path = evaluation_dir / "emotion-classification.csv"
        output_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        with csv_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        reports.append(
            {
                "label": summary.get("label"),
                "generated": aggregate,
                "family_generated": family_aggregate,
                "family_validation": family_validation_summary,
                "separation": report["generated_acoustic_separation"],
                "validation": validation_summary,
                "output": str(output_path),
            }
        )

    args.cache.expanduser().parent.mkdir(parents=True, exist_ok=True)
    args.cache.expanduser().write_text(
        json.dumps(cache, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(reports, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
