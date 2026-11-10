"""把游戏语音、ASMR、广播剧整理成多风格数据集（SBV2 raw/<style> 结构）。

用法（云端）：
    python build-multistyle-dataset.py <repo> <game_zip> <asmr_seg_dir> <asmr_esd> <drama_seg_dir> <drama_esd> <model_name>
"""

from __future__ import annotations

import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

ANNOYED = re.compile(r"^(Battle|ExSkill|Tactic|Formation|CommonSkill|ExWeapon)")
SOFT = re.compile(
    r"^(Cafe|Relationship|MemorialLobby|EventLobby|EventLogin|LogIn|Season|Growup)"
)
PREFIX = re.compile(r"^(CH\d+_|swimsuit_|dress_|normal_)")


def style_for(name: str) -> str:
    family = PREFIX.sub("", name)
    if ANNOYED.match(family):
        return "annoyed"
    if SOFT.match(family):
        return "soft"
    return "neutral"


def main() -> None:
    repo = Path(sys.argv[1])
    game_zip = Path(sys.argv[2])
    asmr_dir, asmr_esd = Path(sys.argv[3]), Path(sys.argv[4])
    drama_dir, drama_esd = Path(sys.argv[5]), Path(sys.argv[6])
    model = sys.argv[7]

    dest = repo / "Data" / model
    if dest.exists():
        shutil.rmtree(dest)
    (dest / "raw").mkdir(parents=True)

    lines: list[str] = []
    stats: dict[str, int] = {}

    # 1. 游戏语音（zip 内含 hina-curated/raw + esd.list）
    with zipfile.ZipFile(game_zip) as zf:
        zf.extractall(repo / "Data" / "_game_tmp")
    game_root = repo / "Data" / "_game_tmp" / "hina-curated"
    for line in (game_root / "esd.list").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        src = game_root / "raw" / parts[0]
        if not src.exists():
            continue
        style = style_for(Path(parts[0]).name)
        target = dest / "raw" / style / src.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)
        lines.append(f"{style}/{src.name}|hina|JP|" + "|".join(parts[3:]))
        stats[style] = stats.get(style, 0) + 1

    # 2. ASMR / 广播剧 → soft
    for seg_dir, esd_path, prefix in [
        (asmr_dir, asmr_esd, ""),
        (drama_dir, drama_esd, "drama_"),
    ]:
        for line in esd_path.read_text(encoding="utf-8").splitlines():
            parts = line.split("|")
            if len(parts) < 4:
                continue
            src = seg_dir / parts[0]
            if not src.exists():
                continue
            name = f"{prefix}{src.name}"
            target = dest / "raw" / "soft" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, target)
            lines.append(f"soft/{name}|hina|JP|" + "|".join(parts[3:]))
            stats["soft"] = stats.get("soft", 0) + 1

    (dest / "esd.list").write_text("\n".join(lines) + "\n", encoding="utf-8")
    shutil.rmtree(repo / "Data" / "_game_tmp", ignore_errors=True)
    print("样式分布:", json.dumps(stats, ensure_ascii=False))
    print("总数:", len(lines))


if __name__ == "__main__":
    sys.exit(main())
