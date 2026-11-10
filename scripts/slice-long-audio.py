"""把长音频按静音切分成训练用的短片段（2～12 秒）。

用法：
    python slice-long-audio.py <input.wav|mp3> <output_dir> [--min 2] [--max 12]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf


def collect_regions(y: np.ndarray, sr: int, top_db: float = 35.0) -> list[tuple[int, int]]:
    intervals = librosa.effects.split(y, top_db=top_db)
    merged: list[list[int]] = []
    for start, end in intervals:
        if merged and start - merged[-1][1] < int(0.35 * sr):
            merged[-1][1] = end
        else:
            merged.append([int(start), int(end)])
    return [(s, e) for s, e in merged]


def group_regions(
    regions: list[tuple[int, int]], sr: int, min_s: float, max_s: float, max_gap_s: float = 1.0
) -> list[tuple[int, int]]:
    """把相邻的短语音区域合并成 2～12 秒的片段。

    ASMR 里大量短句被停顿隔开，逐条保留会因为短于下限被丢弃；
    这里按"总时长不超过 max_s、间隔不超过 max_gap_s"聚合。
    """
    min_len = int(min_s * sr)
    max_len = int(max_s * sr)
    max_gap = int(max_gap_s * sr)
    grouped: list[tuple[int, int]] = []
    current_start: int | None = None
    current_end = 0
    for start, end in regions:
        if current_start is None:
            current_start, current_end = start, end
            continue
        gap = start - current_end
        if gap <= max_gap and end - current_start <= max_len:
            current_end = end
            continue
        if current_end - current_start >= min_len:
            grouped.append((current_start, current_end))
        current_start, current_end = start, end
    if current_start is not None and current_end - current_start >= min_len:
        grouped.append((current_start, current_end))
    return grouped


def split_region(
    y: np.ndarray, sr: int, start: int, end: int, min_s: float, max_s: float
) -> list[tuple[int, int]]:
    """在区域内按静音切分，保证每段不超过 max_s。"""
    min_len = int(min_s * sr)
    max_len = int(max_s * sr)
    if end - start <= max_len:
        return [(start, end)]

    # 在区域内部找低能量点作为切点
    sub = y[start:end]
    frame = int(0.05 * sr)
    energy = np.array(
        [np.mean(np.abs(sub[i : i + frame])) for i in range(0, len(sub) - frame, frame)]
    )
    pieces: list[tuple[int, int]] = []
    cursor = 0
    while cursor < len(sub) - min_len:
        remaining = len(sub) - cursor
        if remaining <= max_len:
            pieces.append((start + cursor, start + len(sub)))
            break
        # 在 max_len 前的 60% 之后找能量最低点
        window_start = cursor + int(max_len * 0.6)
        window_end = min(cursor + max_len, len(energy) * frame)
        if window_end <= window_start:
            cut = cursor + max_len
        else:
            lo = window_start // frame
            hi = max(lo + 1, window_end // frame)
            cut_frame = lo + int(np.argmin(energy[lo:hi]))
            cut = cut_frame * frame
        pieces.append((start + cursor, start + cut))
        cursor = cut
    tail = [(start + cursor, start + len(sub))]
    if tail and tail[0][1] - tail[0][0] >= min_len:
        pieces.append(tail[0])
    return pieces


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--min", type=float, default=2.0)
    parser.add_argument("--max", type=float, default=12.0)
    parser.add_argument("--top-db", type=float, default=35.0)
    parser.add_argument("--gap", type=float, default=1.0)
    args = parser.parse_args()

    y, sr = librosa.load(args.input, sr=44100, mono=True)
    print(f"读取完成：{len(y) / sr / 60:.1f} 分钟，{sr}Hz", flush=True)

    regions = collect_regions(y, sr, args.top_db)
    print(f"静音切分得到 {len(regions)} 个语音区域", flush=True)
    regions = group_regions(regions, sr, args.min, args.max, args.gap)
    print(f"合并短句后得到 {len(regions)} 段", flush=True)

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    kept = 0
    dropped = 0
    total = 0.0
    for start, end in regions:
        for seg_start, seg_end in split_region(y, sr, start, end, args.min, args.max):
            duration = (seg_end - seg_start) / sr
            if duration < args.min or duration > args.max:
                dropped += 1
                continue
            path = out_dir / f"asmr_{kept:04d}.wav"
            sf.write(path, y[seg_start:seg_end], sr, subtype="PCM_16")
            kept += 1
            total += duration
    print(f"切出 {kept} 段，丢弃 {dropped} 段，总时长 {total / 60:.1f} 分钟", flush=True)


if __name__ == "__main__":
    sys.exit(main())
