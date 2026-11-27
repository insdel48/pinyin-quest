"""小主角：大头卡通小男孩（按真实孩子的特征做的卡通形象，不含照片）。

黑色短刺头、笑着吐舌头；白 T 恤（薄荷绿领口、胸前绿色小图案）；浅蓝松紧牛仔裤（裤脚收口、腿上黄色笑脸）；
白运动鞋；左手腕蓝手表；右手拿大毛笔。游戏里按节点名做动作：Kid / Body / Head / ArmR / ArmL / Brush / VSign。
  Blender -b --factory-startup --python tools/blender/kid.py [-- --preview]
"""
import math
import random
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from kit import args, ball, block, empty, export, join, limb, mat, preview, reset, ring, set_parent, tube  # noqa: E402

reset()
random.seed(7)
C = {k: mat(k, v) for k, v in {
    "skin": "#ffd9bd", "hair": "#1f1d22", "shirt": "#f6f4ee", "collar": "#6fd0c2", "patch": "#7cc35a",
    "jeans": "#9cc4ec", "jeansDark": "#7eaad8", "shoe": "#fbfbf8", "sole": "#9aa0a8", "white": "#ffffff",
    "black": "#14121a", "mouth": "#4a1520", "tongue": "#ff7f8e", "blush": "#ff9a9a", "yellow": "#ffd23f",
    "wood": "#8a5a36", "brushRed": "#d8412f", "ink": "#1a1830", "watch": "#3f8ee8", "watchFace": "#cfeaff",
}.items()}

kid = empty("Kid")
body = empty("Body", parent=kid)

# 腿和鞋
for s in (-1, 1):
    x = 0.17 * s
    limb(f"leg{s}", (x * 0.9, 0, 0.9), (x, -0.02, 0.3), 0.165, C["jeans"], body)
    ball(f"cuff{s}", (x, -0.02, 0.25), (0.15, 0.15, 0.06), C["jeansDark"], body)
    ball(f"shoe{s}", (x, -0.1, 0.11), (0.17, 0.27, 0.12), C["shoe"], body)
    block(f"sole{s}", (x, -0.1, 0.025), (0.33, 0.54, 0.06), C["sole"], body, subdiv=1)
    ball(f"lace{s}", (x, -0.2, 0.2), (0.08, 0.06, 0.03), C["collar"], body)
ball("smiley", (0.21, -0.17, 0.62), (0.055, 0.012, 0.055), C["yellow"], body)
ball("hips", (0, 0, 0.9), (0.31, 0.25, 0.17), C["jeans"], body)

# 上衣
ball("shirt", (0, 0, 1.27), (0.36, 0.3, 0.37), C["shirt"], body, subdiv=2)
for s in (-1, 1):
    ball(f"sleeve{s}", (0.33 * s, 0, 1.45), (0.18, 0.17, 0.16), C["shirt"], body)
ball("collar", (0, 0, 1.6), (0.17, 0.15, 0.04), C["collar"], body)
ball("chestPatch", (0.1, -0.29, 1.36), (0.07, 0.02, 0.045), C["patch"], body)

# 头
head = empty("Head", (0, 0, 1.6), body)
limb("neck", (0, 0, 1.58), (0, 0, 1.72), 0.11, C["skin"], head)
ball("head", (0, 0, 2.13), (0.57, 0.53, 0.55), C["skin"], head, subdiv=2, seg=32)
for s in (-1, 1):
    ball(f"ear{s}", (0.56 * s, 0.02, 2.08), (0.07, 0.06, 0.12), C["skin"], head)

# 头发：一顶头盔似的发套（前额露脸、后脑盖低）+ 一簇簇往上翘的刺
cap = ball("hairCap", (0, 0.02, 2.16), (0.6, 0.57, 0.58), C["hair"], None, subdiv=0, seg=32)
bm = bmesh.new()
bm.from_mesh(cap.data)
cut = [v for v in bm.verts if v.co.z < (2.17 + max(0, -v.co.y) * 0.3 - max(0, v.co.y) * 0.4)]
bmesh.ops.delete(bm, geom=cut, context="VERTS")
bm.to_mesh(cap.data)
bm.free()
sol = cap.modifiers.new("thick", "SOLIDIFY")
sol.thickness = 0.04
sub = cap.modifiers.new("sub", "SUBSURF")
sub.levels = sub.render_levels = 2
tufts = [cap]
up = Vector((0, 0, 1))
N = 70
for i in range(N):  # 满头又密又短的刺：黄金角均匀铺在上半个头
    a = i * 2.39996 + random.uniform(-0.2, 0.2)
    tilt = math.acos(1 - (i + 0.5) / N * 0.95)
    d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
    if d.y < -0.45 and d.z < 0.75:
        continue  # 额前不放刺，露出脸
    base = Vector((0, 0.02, 2.16)) + Vector((d.x * 0.6, d.y * 0.57, d.z * 0.58))
    out = (d + up * 0.5).normalized()
    length = random.uniform(0.12, 0.22)
    tufts.append(tube(f"tuft{i}", base - out * 0.05, base + out * length, 0.12, 0.015, C["hair"], None, subdiv=1, verts=7))
hair = join(tufts, "hair")
set_parent(hair, head)

# 脸：大眼睛、粗眉毛、咧嘴笑吐舌头、腮红
for s in (-1, 1):
    x = 0.19 * s
    ball(f"eyeW{s}", (x, -0.475, 2.14), (0.105, 0.05, 0.135), C["white"], head)
    ball(f"eyeP{s}", (x - 0.01 * s, -0.515, 2.12), (0.07, 0.025, 0.09), C["black"], head)
    ball(f"eyeH{s}", (x - 0.03 * s, -0.54, 2.16), (0.024, 0.01, 0.024), C["white"], head, subdiv=0)
    tube(f"brow{s}", (x - 0.08 * s, -0.5, 2.31 + 0.015), (x + 0.08 * s, -0.5, 2.31 - 0.02), 0.025, 0.022, C["hair"], head)
    ball(f"blush{s}", (0.33 * s, -0.43, 2.0), (0.085, 0.02, 0.05), C["blush"], head, subdiv=0)
ball("nose", (0, -0.55, 2.05), (0.045, 0.03, 0.04), C["skin"], head)
# 咧嘴笑：弯弯的嘴、上排小白牙、舌头从嘴角吐出一点
# 咧嘴笑：一道往上弯的嘴（半个圆环），舌头从嘴里吐出一点
bpy.ops.mesh.primitive_torus_add(major_radius=0.13, minor_radius=0.03, location=(0, -0.5, 2.0), rotation=(math.pi / 2, 0, 0), major_segments=40, minor_segments=10)
smile = bpy.context.active_object
bm = bmesh.new(); bm.from_mesh(smile.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -0.02], context="VERTS")  # 只留下半圈
bm.to_mesh(smile.data); bm.free()
smile.name = "smile"; smile.data.materials.append(C["mouth"]); smile.scale = (1.15, 1, 0.8)
for p in smile.data.polygons: p.use_smooth = True
set_parent(smile, head)
ball("tongue", (0.035, -0.53, 1.885), (0.06, 0.03, 0.05), C["tongue"], head)

# 右手：大毛笔
armR = empty("ArmR", (0.45, 0, 1.47), body)
limb("armR", (0.45, 0, 1.43), (0.55, -0.05, 1.05), 0.085, C["skin"], armR)
ball("handR", (0.56, -0.07, 0.97), (0.11, 0.11, 0.11), C["skin"], armR)
brush = empty("Brush", (0.56, -0.07, 0.97), armR)
tube("brushStick", (0.53, -0.04, 0.62), (0.7, -0.22, 2.28), 0.05, 0.045, C["wood"], brush)
tube("brushBand", (0.69, -0.21, 2.22), (0.72, -0.24, 2.42), 0.075, 0.075, C["brushRed"], brush)
tube("brushTip", (0.72, -0.24, 2.4), (0.77, -0.29, 2.82), 0.12, 0.012, C["ink"], brush)

# 左手：蓝手表；剪刀手平时藏着，比的时候显示
armL = empty("ArmL", (-0.45, 0, 1.47), body)
limb("armL", (-0.45, 0, 1.43), (-0.54, -0.04, 1.05), 0.085, C["skin"], armL)
ball("handL", (-0.55, -0.06, 0.97), (0.11, 0.11, 0.11), C["skin"], armL)
ball("watchBand", (-0.53, -0.035, 1.1), (0.1, 0.1, 0.045), C["watch"], armL)
block("watchFace", (-0.535, -0.13, 1.1), (0.1, 0.035, 0.09), C["watchFace"], armL, subdiv=1)
vsign = empty("VSign", (-0.55, -0.06, 0.97), armL)
for s in (-1, 1):
    limb(f"finger{s}", (-0.55 + 0.03 * s, -0.06, 0.9), (-0.55 + 0.08 * s, -0.07, 0.74), 0.035, C["skin"], vsign)

if "--preview" in args():
    preview("tools/.cache/kid.png")
export("public/models/kid.glb")
