"""伙伴小喇叭鸟嘀嗒、声波拳头（打出去的那一拳）"""
import math

from kit import ball, block, cyl, empty, eyes, mat, ring, soft_box, tube


def didi():
    """黄色小圆鸟，嘴巴是个小喇叭，背红书包，头顶一撮呆毛。WingL/WingR 扇翅膀"""
    root = empty("Foe")
    yel, orange = mat("bird", "#ffd23f"), mat("beak", "#ff8f1f")
    ball("body", (0, 0, 0.55), (0.42, 0.4, 0.45), yel, root)
    ball("belly", (0, -0.25, 0.45), (0.28, 0.2, 0.28), mat("birdLight", "#fff1a8"), root)
    eyes(root, 0, -0.32, 0.7, 0.15, 0.1, look=(0.3, 0))
    tube("horn", (0.05, -0.36, 0.55), (0.12, -0.72, 0.55), 0.06, 0.17, orange, root, verts=20)
    ring("hornRim", (0.12, -0.72, 0.55), 0.17, 0.03, orange, root, rot=(math.pi / 2, 0, 0))
    cyl("d_hornIn", (0.12, -0.71, 0.55), 0.14, 0.01, mat("hole", "#5a1020"), root, rot=(math.pi / 2, 0, 0), bevel=0)
    for sx, name in ((-1, "WingR"), (1, "WingL")):
        w = empty(name, (sx * 0.38, 0.05, 0.6), root)
        ball(f"wing{sx}", (sx * 0.5, 0.05, 0.55), (0.1, 0.22, 0.28), mat("wing", "#ffbf1f"), w)
        tube(f"leg{sx}", (sx * 0.12, -0.05, 0.15), (sx * 0.13, -0.08, 0.0), 0.03, 0.03, orange, root)
    tube("tuft", (0, 0, 0.98), (0.08, 0.05, 1.22), 0.06, 0.015, yel, root)
    soft_box("bag", (0, 0.38, 0.5), (0.4, 0.2, 0.38), mat("bag", "#ef3b3b"), root, bevel=0.3)


def fist():
    """声波重拳：金色卡通大拳头，拳面朝 +X（朝怪物），手腕一圈蓝色手表环"""
    root = empty("Foe")
    gold, blue = mat("fist", "#ffcf33"), mat("cuff", "#2f8cff")
    soft_box("palm", (0, 0, 0), (0.8, 0.7, 0.75), gold, root, bevel=0.45)
    for k in range(4):  # 四个指节
        z = 0.24 - k * 0.16
        ball(f"knuckle{k}", (0.38, -0.05, z), (0.16, 0.3, 0.1), gold, root)
    ball("thumb", (0.15, -0.36, -0.05), (0.3, 0.12, 0.13), gold, root)
    tube("wrist", (-0.35, 0, 0), (-0.75, 0, 0), 0.3, 0.26, gold, root)
    ring("cuff", (-0.6, 0, 0), 0.3, 0.09, blue, root, rot=(0, math.pi / 2, 0))


FOES = {"didi": didi, "fist": fist}
