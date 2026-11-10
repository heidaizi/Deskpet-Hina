"""用 transformers Whisper 批量转写切分后的音频，输出 SBV2 的 esd.list。

用法（云端）：
    python scripts/transcribe-asmr.py <wav_dir> <out_esd.list> [--model openai/whisper-large-v3]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import soundfile as sf
import torch
import torchaudio
from transformers import WhisperForConditionalGeneration, WhisperProcessor


def load_audio(path: Path, target_sr: int = 16000) -> torch.Tensor:
    audio, sr = sf.read(str(path), dtype="float32", always_2d=False)
    tensor = torch.from_numpy(audio).unsqueeze(0)
    if sr != target_sr:
        tensor = torchaudio.functional.resample(tensor, sr, target_sr)
    return tensor.squeeze(0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("wav_dir")
    parser.add_argument("output")
    parser.add_argument("--model", default="openai/whisper-large-v3")
    parser.add_argument("--language", default="ja")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    processor = WhisperProcessor.from_pretrained(args.model)
    model = WhisperForConditionalGeneration.from_pretrained(args.model, torch_dtype=dtype)
    model = model.to(device)
    model.eval()

    files = sorted(Path(args.wav_dir).rglob("*.wav"))
    print(f"待转写 {len(files)} 个文件", flush=True)
    kept = 0
    with open(args.output, "w", encoding="utf-8") as out:
        for index, path in enumerate(files, start=1):
            audio = load_audio(path)
            inputs = processor(
                audio.numpy(), sampling_rate=16000, return_tensors="pt"
            ).input_features.to(device, dtype=dtype)
            with torch.no_grad():
                ids = model.generate(
                    inputs,
                    language=args.language,
                    task="transcribe",
                    max_new_tokens=128,
                )
            text = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
            if not text:
                continue
            rel = path.relative_to(Path(args.wav_dir))
            style = rel.parts[0] if len(rel.parts) > 1 else "soft"
            out.write(f"{rel}|hina|JP|{text}\n")
            kept += 1
            if index % 25 == 0:
                print(f"  {index}/{len(files)}", flush=True)
    print(f"完成：写入 {kept} 条到 {args.output}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
