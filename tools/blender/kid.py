"""小主角小乐：大头卡通小男孩，粗黑线美式卡通风（按真实孩子的特征做的卡通形象，不含照片）。

黑色乱翘短刺头、笑着吐舌头；白 T 恤（薄荷绿领口、胸前绿色小图案）；浅蓝松紧牛仔裤（裤脚收口、腿上黄色笑脸）；
白运动鞋；左手腕天蓝色方形手表——打怪时表盘前弹出喇叭炮口（Cannon）。右手比剪刀手（VSign）。
游戏里按节点名做动作：Kid / Body / Head / ArmL（戴表、朝怪物那边）/ ArmR / Cannon / VSign。
  Blender -b --factory-startup --python tools/blender/kid.py [-- --preview]
"""
import math
import random
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from kit import args, ball, block, empty, export, eyes, half_ball, join, limb, mat, preview, reset, set_parent, tube  # noqa: E402

reset()
random.seed(7)
C = {k: mat(k, v) for k, v in {
    "skin": "#ffd2b0", "hair": "#1c1a22", "shirt": "#fbfaf5", "collar": "#3fc7a8", "patch": "#5cc04a",
    "jeans": "#8fbcf0", "jeansDark": "#6f9fe0", "shoe": "#ffffff", "sole": "#b9c0ca", "lace": "#3fc7a8",
    "yellow": "#ffd23f", "blush": "#ff8f8f", "tongue": "#ff6f86", "mouth": "#5a1020",
    "watch": "#2f8cff", "watchFace": "#bff0ff", "horn": "#ffffff", "hornRim": "#2f8cff",
}.items()}

kid = empty("Kid")
body = empty("Body", parent=kid)

# 腿和鞋
for s in (-1, 1):
    x = 0.17 * s
    limb(f"leg{s}", (x * 0.9, 0, 0.9), (x, -0.02, 0.32), 0.17, C["jeans"], body)
    ball(f"cuff{s}", (x, -0.02, 0.27), (0.155, 0.155, 0.065), C["jeansDark"], body)
    ball(f"shoe{s}", (x, -0.1, 0.12), (0.18, 0.28, 0.13), C["shoe"], body)
    block(f"sole{s}", (x, -0.1, 0.03), (0.35, 0.56, 0.07), C["sole"], body, subdiv=1)
    ball(f"d_lace{s}", (x, -0.21, 0.2), (0.085, 0.06, 0.035), C["lace"], body)
ball("d_smiley", (0.21, -0.175, 0.62), (0.06, 0.014, 0.06), C["yellow"], body)
ball("hips", (0, 0, 0.9), (0.31, 0.25, 0.17), C["jeans"], body)

# 上衣
ball("shirt", (0, 0, 1.27), (0.36, 0.3, 0.37), C["shirt"], body)
for s in (-1, 1):
    ball(f"sleeve{s}", (0.33 * s, 0, 1.45), (0.18, 0.17, 0.16), C["shirt"], body)
ball("collar", (0, 0, 1.6), (0.17, 0.15, 0.045), C["collar"], body)
ball("d_chestPatch", (0.1, -0.295, 1.36), (0.075, 0.02, 0.05), C["patch"], body)

# 头
head = empty("Head", (0, 0, 1.6), body)
limb("neck", (0, 0, 1.58), (0, 0, 1.72), 0.11, C["skin"], head)
ball("head", (0, 0, 2.13), (0.57, 0.53, 0.55), C["skin"], head, seg=32)
for s in (-1, 1):
    ball(f"ear{s}", (0.56 * s, 0.02, 2.08), (0.08, 0.06, 0.13), C["skin"], head)

# 头发：贴头皮的发套 + 一簇簇粗粗的乱翘刺（美式卡通的大块头发），额前几撮刘海
cap = ball("hairCap", (0, 0.02, 2.17), (0.6, 0.57, 0.585), C["hair"], None, subdiv=0, seg=32)
bm = bmesh.new()
bm.from_mesh(cap.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < (2.2 + max(0, -v.co.y) * 0.32 - max(0, v.co.y) * 0.45)], context="VERTS")
bm.to_mesh(cap.data)
bm.free()
sol = cap.modifiers.new("thick", "SOLIDIFY")
sol.thickness = 0.05
sub = cap.modifiers.new("sub", "SUBSURF")
sub.levels = sub.render_levels = 2
tufts = [cap]
up = Vector((0, 0, 1))
center = Vector((0, 0.02, 2.17))
spikes = []
for i in range(34):  # 头顶和后脑：黄金角铺开
    a = i * 2.39996 + random.uniform(-0.25, 0.25)
    tilt = math.acos(1 - (i + 0.5) / 34 * 0.95)
    d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
    if d.y < -0.35 and d.z < 0.8:
        continue
    spikes.append((d, (d + up * 0.45 + Vector((0, 0.35, 0))).normalized(), random.uniform(0.22, 0.36), 0.19))
for x in (-0.36, -0.16, 0.06, 0.26, 0.42):  # 刘海：往前下方、左右乱翘
    d = Vector((x, -0.62, 0.62)).normalized()
    spikes.append((d, Vector((x * 0.9 + random.uniform(-0.15, 0.15), -0.7, -0.45)).normalized(), random.uniform(0.24, 0.32), 0.16))
for i, (d, out, length, r) in enumerate(spikes):
    base = center + Vector((d.x * 0.6, d.y * 0.57, d.z * 0.585))
    tufts.append(tube(f"tuft{i}", base - out * 0.08, base + out * length, r, 0.012, C["hair"], None, subdiv=1, verts=8))
hair = join(tufts, "hair")
set_parent(hair, head)

# 脸：大眼睛、粗眉毛、张嘴笑吐舌头、腮红
eyes(head, 0, -0.47, 2.14, 0.2, 0.12, look=(0.25, 0))
for s in (-1, 1):
    tube(f"brow{s}", (0.2 * s - 0.09 * s, -0.52, 2.33), (0.2 * s + 0.09 * s, -0.5, 2.36), 0.03, 0.026, C["hair"], head)
    ball(f"d_blush{s}", (0.34 * s, -0.44, 1.99), (0.085, 0.02, 0.05), C["blush"], head, subdiv=0)
ball("nose", (0, -0.56, 2.05), (0.045, 0.03, 0.04), C["skin"], head)
half_ball("mouth", (0, -0.49, 1.97), (0.15, 0.06, 0.12), C["mouth"], head)
ball("d_tongue", (0.04, -0.54, 1.88), (0.07, 0.035, 0.055), C["tongue"], head)

# 左手（朝怪物那边，Blender 里 +X）：戴天蓝色方手表；打怪时手表前弹出喇叭炮口
armL = empty("ArmL", (0.45, 0, 1.47), body)
limb("armL", (0.45, 0, 1.43), (0.55, -0.05, 1.05), 0.088, C["skin"], armL)
ball("handL", (0.56, -0.07, 0.96), (0.115, 0.115, 0.115), C["skin"], armL)
ball("watchBand", (0.54, -0.04, 1.1), (0.105, 0.105, 0.05), C["watch"], armL)
block("watchCase", (0.545, -0.15, 1.1), (0.19, 0.07, 0.17), C["watch"], armL, subdiv=1)
block("d_watchFace", (0.545, -0.19, 1.1), (0.13, 0.02, 0.11), C["watchFace"], armL, subdiv=1)
cannon = empty("Cannon", (0.56, -0.07, 0.96), armL)
tube("horn", (0.56, -0.07, 0.9), (0.6, -0.07, 0.5), 0.07, 0.26, C["horn"], cannon, verts=20)
bpy.ops.mesh.primitive_torus_add(major_radius=0.26, minor_radius=0.04, location=(0.6, -0.07, 0.5), major_segments=28, minor_segments=8)
rim = bpy.context.active_object
rim.name = "hornRim"
rim.data.materials.append(C["hornRim"])
set_parent(rim, cannon)

# 右手（Blender 里 -X）：剪刀手平时藏着，赢了比出来
armR = empty("ArmR", (-0.45, 0, 1.47), body)
limb("armR", (-0.45, 0, 1.43), (-0.54, -0.04, 1.05), 0.088, C["skin"], armR)
ball("handR", (-0.55, -0.06, 0.96), (0.115, 0.115, 0.115), C["skin"], armR)
vsign = empty("VSign", (-0.55, -0.06, 0.96), armR)
for s in (-1, 1):
    limb(f"finger{s}", (-0.55 + 0.035 * s, -0.06, 0.89), (-0.55 + 0.09 * s, -0.07, 0.72), 0.038, C["skin"], vsign)

if "--preview" in args():
    preview("tools/.cache/kid.png")
export("public/models/kid.glb")
