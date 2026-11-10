#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys

import librosa
import numpy as np
import soundfile as sf

sys.path.insert(
    0,
    str(Path("~/.local/share/deskpet-tts/Irodori-TTS").expanduser()),
)

from irodori_tts.inference_runtime import (
    InferenceRuntime,
    RuntimeKey,
    SamplingRequest,
    save_wav,
)

MODEL_CHECKPOINT = Path(
    "~/.local/share/deskpet-tts/models/Irodori-TTS-v4.1-Small/model.safetensors"
).expanduser()
CODEC_WEIGHTS = Path(
    "~/.local/share/deskpet-tts/models/Semantic-DACVAE-Japanese-32dim/weights.pth"
).expanduser()


def deterministic_seed(emotion: str) -> int:
    digest = hashlib.sha256(emotion.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") & 0x7FFFFFFF


def evaluation_seed(item: dict, repeat: int = 0) -> int:
    if "seed" in item:
        return (int(item["seed"]) + repeat) & 0x7FFFFFFF
    stable_key = str(item.get("sample_id") or item["emotion"])
    if repeat:
        stable_key = f"{stable_key}:repeat:{repeat}"
    return deterministic_seed(stable_key)


def audio_metrics(path: Path) -> dict[str, float]:
    waveform, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    mono = waveform.mean(axis=1)
    duration = len(mono) / sample_rate
    peak = float(np.max(np.abs(mono))) if mono.size else 0.0
    clipped_fraction = (
        float(np.mean(np.abs(mono) >= 0.999)) if mono.size else 0.0
    )
    silence_fraction = float(np.mean(np.abs(mono) < 1e-4)) if mono.size else 0.0
    rms = librosa.feature.rms(y=mono, frame_length=1024, hop_length=256)[0]
    centroid = librosa.feature.spectral_centroid(
        y=mono, sr=sample_rate, hop_length=256
    )[0]
    f0 = librosa.yin(
        mono,
        fmin=70,
        fmax=500,
        sr=sample_rate,
        frame_length=2048,
        hop_length=256,
    )
    voiced = f0[np.isfinite(f0) & (f0 >= 70) & (f0 <= 500)]
    onsets = librosa.onset.onset_detect(
        y=mono, sr=sample_rate, hop_length=256, backtrack=False
    )
    return {
        "duration_seconds": round(duration, 4),
        "peak": round(peak, 6),
        "clipped_fraction": round(clipped_fraction, 8),
        "silence_fraction": round(silence_fraction, 6),
        "rms_mean": round(float(np.mean(rms)), 6),
        "rms_std": round(float(np.std(rms)), 6),
        "f0_mean_hz": round(float(np.mean(voiced)), 3) if voiced.size else 0.0,
        "f0_std_hz": round(float(np.std(voiced)), 3) if voiced.size else 0.0,
        "spectral_centroid_mean": round(float(np.mean(centroid)), 3),
        "onset_count": int(len(onsets)),
        "onsets_per_second": round(float(len(onsets) / max(duration, 0.001)), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--lora-adapter", type=Path)
    parser.add_argument(
        "--spec",
        type=Path,
        default=Path("content/hina-emotion-eval.json"),
    )
    parser.add_argument("--validation-manifest", type=Path)
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--cfg-scale-caption", type=float, default=3.0)
    parser.add_argument("--cfg-scale-speaker", type=float, default=5.0)
    parser.add_argument("--speaker-kv-scale", type=float, default=1.2)
    args = parser.parse_args()
    if args.repeats < 1:
        raise ValueError("--repeats must be at least 1")

    if args.validation_manifest:
        validation = [
            json.loads(line)
            for line in args.validation_manifest.expanduser()
            .read_text(encoding="utf-8")
            .splitlines()
            if line.strip()
        ]
        by_emotion = {}
        for row in validation:
            by_emotion.setdefault(row["emotion"], row)
        items = [by_emotion[emotion] for emotion in sorted(by_emotion)]
    else:
        spec = json.loads(args.spec.read_text(encoding="utf-8"))
        items = spec["items"]
    items = [
        {**item, "repeat": repeat}
        for repeat in range(args.repeats)
        for item in items
    ]
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    runtime = InferenceRuntime.from_key(
        RuntimeKey(
            checkpoint=str(MODEL_CHECKPOINT),
            model_device="mps",
            codec_repo=str(CODEC_WEIGHTS),
            model_precision="fp32",
            codec_device="mps",
            codec_precision="fp32",
        )
    )

    rows = []
    concatenated = []
    sample_rate = None
    for index, item in enumerate(items, start=1):
        emotion = str(item["emotion"])
        print(f"[{index}/{len(items)}] {emotion}: {item['text']}", flush=True)
        result = runtime.synthesize(
            SamplingRequest(
                text=item["text"],
                caption=item["caption"],
                ref_embed=str(args.checkpoint.expanduser().resolve()),
                duration_scale=float(
                    item.get("duration_scale", item.get("durationScale", 1.0))
                ),
                num_steps=32,
                cfg_scale_text=3.0,
                cfg_scale_caption=args.cfg_scale_caption,
                cfg_scale_speaker=args.cfg_scale_speaker,
                cfg_guidance_mode="independent",
                speaker_kv_scale=args.speaker_kv_scale,
                speaker_kv_min_t=0.9,
                seed=evaluation_seed(item, int(item["repeat"])),
                t_schedule_mode="sway",
                sway_coeff=-1.0,
                trim_tail=True,
                lora_adapter=(
                    None
                    if args.lora_adapter is None
                    else str(args.lora_adapter.expanduser().resolve())
                ),
            )
        )
        sample_rate = result.sample_rate
        output_path = output_dir / (
            f"{index:02d}-r{int(item['repeat']) + 1}-{emotion}.wav"
        )
        save_wav(output_path, result.audio, result.sample_rate)
        metrics = audio_metrics(output_path)
        rows.append(
            {
                "emotion": emotion,
                "repeat": int(item["repeat"]),
                "text": item["text"],
                "caption": item["caption"],
                "duration_scale": float(
                    item.get("duration_scale", item.get("durationScale", 1.0))
                ),
                "seed": result.used_seed,
                "file": output_path.name,
                "sample_id": item.get("sample_id"),
                "reference_file": item.get("file_name"),
                **metrics,
            }
        )
        waveform, sr = sf.read(output_path, dtype="float32", always_2d=True)
        if sr != sample_rate:
            raise RuntimeError(f"Unexpected sample rate for {output_path}: {sr}")
        concatenated.append(waveform.mean(axis=1))
        concatenated.append(np.zeros(int(sample_rate * 0.35), dtype=np.float32))

    if sample_rate is None:
        raise RuntimeError("No evaluation audio was generated.")
    combined = np.concatenate(concatenated)
    sf.write(output_dir / "emotion-eval-all.wav", combined, sample_rate)

    summary = {
        "schemaVersion": 2,
        "label": args.label,
        "checkpoint": str(args.checkpoint.expanduser().resolve()),
        "loraAdapter": (
            None
            if args.lora_adapter is None
            else str(args.lora_adapter.expanduser().resolve())
        ),
        "seedPolicy": "item.seed, else SHA-256(sample_id or emotion); checkpoint label excluded",
        "repeats": args.repeats,
        "sampling": {
            "cfgScaleText": 3.0,
            "cfgScaleCaption": args.cfg_scale_caption,
            "cfgScaleSpeaker": args.cfg_scale_speaker,
            "speakerKvScale": args.speaker_kv_scale,
            "speakerKvMinT": 0.9,
        },
        "items": rows,
        "aggregate": {
            "duration_seconds": round(
                sum(float(row["duration_seconds"]) for row in rows), 4
            ),
            "f0_mean_hz": round(
                float(np.mean([row["f0_mean_hz"] for row in rows])), 3
            ),
            "f0_std_across_emotions": round(
                float(np.std([row["f0_mean_hz"] for row in rows])), 3
            ),
            "rms_std_across_emotions": round(
                float(np.std([row["rms_mean"] for row in rows])), 6
            ),
        },
    }
    (output_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    metric_keys = [
        "emotion",
        "duration_seconds",
        "peak",
        "clipped_fraction",
        "silence_fraction",
        "rms_mean",
        "rms_std",
        "f0_mean_hz",
        "f0_std_hz",
        "spectral_centroid_mean",
        "onset_count",
        "onsets_per_second",
    ]
    with (output_dir / "summary.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=metric_keys)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row[key] for key in metric_keys})
    print(f"Evaluation output: {output_dir}")


if __name__ == "__main__":
    main()
