#!/usr/bin/env python3
"""常驻降噪 worker。

每次降噪都新起一个 Python 进程要付出约 0.9 秒的导入开销（numpy / scipy /
soundfile / noisereduce），而实际运算只需几十毫秒。这里让进程常驻，
通过 stdin 逐行读取 JSON 请求、stdout 逐行返回结果。

协议：
  请求行: {"id": 1, "input": "...", "output": "...", "strength": 0.45,
           "highpass": 55, "lowpass": 14000, "targetPeakDb": -1}
  响应行: {"id": 1, "ok": true} 或 {"id": 1, "ok": false, "error": "..."}
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


def load_denoiser(script_path: Path):
    spec = importlib.util.spec_from_file_location("denoise_hina_audio", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load denoiser from {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: denoise-worker.py <denoise-hina-audio.py>", file=sys.stderr)
        sys.exit(2)

    denoiser = load_denoiser(Path(sys.argv[1]))
    # 先跑一次极短的降噪，把 numpy/noisereduce 的惰性初始化提前付掉。
    print(json.dumps({"ready": True}), flush=True)

    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            denoiser.process_file(
                Path(request["input"]),
                Path(request["output"]),
                float(request.get("strength", 0.45)),
                float(request.get("highpass", 55)),
                float(request.get("lowpass", 14000)),
                float(request.get("targetPeakDb", -1)),
            )
            print(json.dumps({"id": request.get("id"), "ok": True}), flush=True)
        except Exception as error:  # noqa: BLE001 - worker 必须保持存活
            print(
                json.dumps(
                    {"id": request.get("id") if "request" in locals() else None, "ok": False, "error": str(error)}
                ),
                flush=True,
            )


if __name__ == "__main__":
    main()
