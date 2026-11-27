"""故事里的 20 个怪物 + 伙伴小鸟嘀嗒 + 声波拳头，粗黑线美式卡通风。每个导出一个 glb。

  Blender -b --factory-startup --python tools/blender/foes.py -- [c1e1 c2e3 ...] [--preview]
不写名字就全做。--preview 另存一张预览图到 tools/.cache/foes/。
约定：根节点 Foe，脚踩 Z=0，面朝 -Y；Eye* 眨眼，Sway* 轻轻摆，d_ 开头不描边（见 kit.py）。
"""
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

ALL = {}
for ch in ("c1", "c2", "c3", "c4", "c5", "extra"):
    mod = importlib.import_module(f"foes.{ch}")
    ALL.update(mod.FOES)

want = [a for a in kit.args() if not a.startswith("--")] or list(ALL)
for fid in want:
    kit.reset()
    ALL[fid]()
    if "--preview" in kit.args():
        kit.preview_sheet(f"tools/.cache/foes/{fid}.png", size=(600, 700), target=(0, 0, 1.8), dist=11, height=2.2)
    kit.export(f"public/models/foes/{fid}.glb")
