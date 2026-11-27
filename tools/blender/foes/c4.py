"""第四章 嘀嘟欢乐园：噗哧（气球）、噼啪（爆米花桶）、晃晃（礼物盒弹簧玩偶）、嘭啪大师（魔术礼帽）"""
import math

import bpy

from kit import _finish, ball, brow, cyl, empty, eyes, half_ball, limb, mat, mouth, noodle, ring, slab, smile, soft_box, star_pts, tube

WHITE = "#ffffff"


def striped_cup(name, loc, r1, r2, h, m1, m2, parent, n=16):
    """竖条纹纸桶：侧面一条红一条白"""
    bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r1, radius2=r2, depth=h, location=loc)
    o = bpy.context.active_object
    o.data.materials.append(m1)
    o.data.materials.append(m2)
    k = 0
    for p in o.data.polygons:
        if len(p.vertices) == 4:
            p.material_index = k % 2
            k += 1
            p.use_smooth = True
    return _finish(o, name, None, parent, 0, smooth=False)


def puchi():
    """苹果绿和亮粉拼接的圆肚皮气球，头顶两只长长的兔子气球耳朵，肚脐是没系紧的气球吹嘴，飘在半空"""
    root = empty("Foe")
    pink, green = mat("balloonPink", "#ff6fb0"), mat("balloonGreen", "#8ee04a")
    half_ball("bodyL", (0, 0, 1.75), (1.0, 0.95, 1.05), pink, root, rot=(0, math.pi / 2, 0))
    half_ball("bodyR", (0, 0, 1.75), (1.0, 0.95, 1.05), green, root, rot=(0, -math.pi / 2, 0))
    ball("d_shine", (-0.45, -0.82, 2.3), (0.14, 0.05, 0.24), mat("white", WHITE), root, subdiv=0)
    for sx, m in ((-1, green), (1, pink)):  # 扭出来的兔子耳朵
        sw = empty(f"Sway{sx}", (sx * 0.3, 0, 2.7), root)
        ball(f"earKnot{sx}", (sx * 0.3, 0, 2.75), (0.15, 0.15, 0.12), m, sw)
        noodle(f"ear{sx}", [(sx * 0.3, 0, 2.8), (sx * 0.45, 0, 3.3), (sx * 0.55, 0.05, 3.8), (sx * 0.45, 0.1, 4.15)], 0.17, 0.12, m, sw)
    eyes(root, 0, -0.85, 2.0, 0.3, 0.2, look=(-0.3, 0))
    for sx in (-1, 1):
        ball(f"cheek{sx}", (sx * 0.62, -0.72, 1.62), (0.24, 0.16, 0.2), mat("cheek", "#ffb0d4"), root)
        sw = empty(f"SwayArm{sx}", (sx * 0.95, 0, 1.6), root)
        noodle(f"arm{sx}", [(sx * 0.95, 0, 1.6), (sx * 1.35, -0.1, 1.45), (sx * 1.5, -0.15, 1.8)], 0.11, 0.1, pink if sx > 0 else green, sw)
    smile("smile", (0, -0.92, 1.62), 0.16, root)
    ring("nozzle", (0, -0.82, 1.05), 0.1, 0.05, pink, root, rot=(math.pi / 2 - 0.5, 0, 0))
    tube("nozzleTip", (0, -0.75, 1.0), (0, -0.92, 0.88), 0.07, 0.05, pink, root)
    noodle("string", [(0, -0.6, 0.75), (0.15, -0.5, 0.45), (-0.1, -0.4, 0.2), (0.05, -0.35, 0.02)], 0.02, 0.02, mat("string", "#5b6473"), root)


def pipa():
    """红白竖条纹大纸桶，红运动鞋短腿，桶口一大堆蓬松爆米花当头发，巧克力豆眼睛，红樱桃鼻子"""
    root = empty("Foe")
    red, white = mat("cupRed", "#ef3b3b"), mat("cupWhite", "#ffffff")
    striped_cup("cup", (0, 0, 1.45), 0.75, 0.98, 1.7, red, white, root)
    ring("rim", (0, 0, 2.3), 0.98, 0.07, white, root)
    corn = [mat("corn", "#fff3c4"), mat("corn2", "#ffe08a")]
    k = 0
    for ring_r, z, n in ((0.8, 2.4, 9), (0.55, 2.7, 7), (0.25, 2.98, 4), (0.0, 3.15, 1)):
        for i in range(n):
            a = i / n * math.tau + ring_r
            r = 0.3 + 0.06 * ((i * 7) % 3)
            ball(f"pop{k}", (math.sin(a) * ring_r, -math.cos(a) * ring_r, z), (r, r * 0.9, r * 0.85), corn[k % 2], root)
            k += 1
    eyes(root, 0, -0.86, 1.85, 0.27, 0.17, look=(-0.3, 0), white="#ffffff")
    ball("cherry", (0, -0.95, 1.55), (0.15, 0.13, 0.15), mat("cherry", "#d8102f"), root)
    tube("stem", (0, -0.98, 1.68), (0.08, -0.98, 1.85), 0.02, 0.015, mat("stem", "#3f8f2f"), root)
    mouth("mouth", (0, -0.9, 1.25), 0.28, 0.18, root, depth=0.08)
    for sx in (-1, 1):
        sw = empty(f"Sway{sx}", (sx * 0.85, 0, 1.5), root)
        limb(f"arm{sx}", (sx * 0.85, 0, 1.55), (sx * 1.15, -0.25, 1.2), 0.08, mat("skin", "#ffd2b0"), sw)
        ball(f"hand{sx}", (sx * 1.15, -0.3, 1.15), (0.14, 0.14, 0.14), white, sw)
        limb(f"leg{sx}", (sx * 0.35, 0, 0.62), (sx * 0.38, -0.05, 0.25), 0.08, mat("legs", "#3d3550"), root)
        ball(f"shoe{sx}", (sx * 0.38, -0.15, 0.13), (0.2, 0.3, 0.13), mat("shoe", "#ef3b3b"), root)
        ball(f"sole{sx}", (sx * 0.38, -0.15, 0.04), (0.21, 0.31, 0.05), white, root)


def huanghuang():
    """蓝黄波点方礼物盒里的弹簧玩偶：彩虹弹簧腰，红黄双角铃铛帽，红鼻头，粉腮红，戴白手套的大手拍巴掌"""
    root = empty("Foe")
    blue, dot = mat("box", "#3d7bf2"), mat("dot", "#ffd23f")
    soft_box("box", (0, 0, 0.62), (1.45, 1.45, 1.2), blue, root, bevel=0.12)
    for k, (x, z) in enumerate([(-0.4, 0.95), (0.35, 0.4), (0.38, 0.98), (-0.35, 0.35), (0, 0.68)]):
        ball(f"d_dot{k}", (x, -0.73, z), (0.12, 0.02, 0.12), dot, root, subdiv=0)
    soft_box("lid", (0, 0.85, 1.6), (1.5, 0.12, 1.0), blue, root, bevel=0.15, rot=(0.25, 0, 0))
    for i, col in enumerate(["#ef3b3b", "#ff9a3c", "#ffd23f", "#5cc04a", "#3f8cff", "#a971ff"]):
        ring(f"spring{i}", (0, 0, 1.3 + i * 0.15), 0.38, 0.08, mat(f"sp{i}", col), root)
    ball("head", (0, 0, 2.65), (0.62, 0.58, 0.6), mat("face", "#fff1e6"), root)
    eyes(root, 0, -0.5, 2.78, 0.22, 0.14, look=(-0.3, 0))
    ball("nose", (0, -0.62, 2.55), (0.14, 0.12, 0.13), mat("nose", "#ef3b3b"), root)
    for sx in (-1, 1):
        ball(f"d_blush{sx}", (sx * 0.35, -0.5, 2.45), (0.11, 0.03, 0.07), mat("blush", "#ff8fb8"), root, subdiv=0)
    mouth("mouth", (0, -0.52, 2.3), 0.22, 0.14, root, depth=0.06)
    ring("collar", (0, 0, 2.15), 0.42, 0.1, mat("collar", "#ffd23f"), root)
    # 双角铃铛帽
    for sx, col in ((-1, "#ef3b3b"), (1, "#ffd23f")):
        noodle(f"horn{sx}", [(sx * 0.15, 0, 3.05), (sx * 0.55, 0, 3.45), (sx * 0.95, -0.05, 3.4), (sx * 1.1, -0.05, 3.05)], 0.26, 0.06, mat(f"hat{sx}", col), root)
        ball(f"bell{sx}", (sx * 1.12, -0.05, 2.92), (0.13, 0.13, 0.13), mat("bell", "#ffc533"), root)
    half_ball("hatBase", (0, 0, 2.98), (0.55, 0.5, 0.25), mat("hat-1", "#ef3b3b"), root, keep="upper")
    for sx in (-1, 1):  # 白手套大手
        sw = empty(f"Sway{sx}", (sx * 0.4, 0, 1.95), root)
        noodle(f"arm{sx}", [(sx * 0.35, 0, 1.95), (sx * 0.8, -0.2, 1.85), (sx * 0.95, -0.4, 2.15)], 0.07, 0.06, mat("sleeve", "#a971ff"), sw)
        ball(f"glove{sx}", (sx * 0.95, -0.45, 2.3), (0.26, 0.2, 0.28), mat("glove", WHITE), sw)
        ball(f"thumb{sx}", (sx * 0.75, -0.48, 2.35), (0.09, 0.08, 0.12), mat("glove", WHITE), sw)


def pengpadashi():
    """关底：舞台中央的巨型深紫丝绒高礼帽，帽檐一圈金星缎带，两只神气大黄眼睛，翘八字假胡子，帽口伸出戴白手套的魔术大手挥黑白魔术棒"""
    root = empty("Foe")
    velvet, dark, gold = mat("velvet", "#6a2fa0"), mat("velvetDark", "#45196e"), mat("gold", "#ffc533")
    cyl("crown", (0, 0, 1.45), 1.2, 2.6, velvet, root, bevel=0.15, verts=40, r2=1.12)
    cyl("brim", (0, 0, 2.82), 1.8, 0.16, dark, root, bevel=0.07, verts=48)
    cyl("d_hole", (0, 0, 2.91), 1.08, 0.03, mat("hole", "#140a24"), root, bevel=0, verts=40)
    cyl("ribbon", (0, 0, 2.45), 1.15, 0.36, gold, root, bevel=0.03, verts=40)
    for k in range(7):
        a = (k - 3) * 0.42
        slab(f"star{k}", star_pts(0.15), 0.05, (math.sin(a) * 1.19, -math.cos(a) * 1.19, 2.45), mat("starRed", "#ef3b3b"), root, rot=(math.pi / 2, 0, a))
    eyes(root, 0, -1.08, 1.75, 0.42, 0.3, look=(-0.3, 0), white="#ffe14d")
    for sx in (-1, 1):
        brow(f"brow{sx}", (sx * 0.2, -1.17, 2.2), (sx * 0.72, -1.12, 2.28), root, r=0.07)
        noodle(f"stache{sx}", [(0, -1.2, 1.25), (sx * 0.35, -1.22, 1.18), (sx * 0.62, -1.2, 1.25), (sx * 0.72, -1.15, 1.45), (sx * 0.62, -1.15, 1.55)], 0.11, 0.04, mat("black", "#14121a"), root)
    smile("smile", (0, -1.15, 0.92), 0.25, root, thick=0.05)
    # 从帽口伸出的魔术大手
    for sx in (-1, 1):
        sw = empty(f"Sway{sx}", (sx * 0.5, 0, 2.9), root)
        noodle(f"arm{sx}", [(sx * 0.5, 0, 2.6), (sx * 0.6, -0.1, 3.3), (sx * 1.05, -0.2, 3.75)], 0.17, 0.14, mat("sleeve", "#14121a"), sw)
        ring(f"cuff{sx}", (sx * 1.1, -0.2, 3.8), 0.17, 0.06, mat("glove", WHITE), sw, rot=(0, sx * 0.9, 0))
        ball(f"glove{sx}", (sx * 1.25, -0.25, 3.95), (0.3, 0.24, 0.32), mat("glove", WHITE), sw)
        ball(f"thumb{sx}", (sx * 1.05, -0.32, 4.15), (0.1, 0.09, 0.14), mat("glove", WHITE), sw)
        if sx < 0:  # 魔术棒朝主角那边
            tube("wand", (-1.2, -0.35, 3.9), (-2.1, -0.4, 4.6), 0.06, 0.06, mat("black", "#14121a"), sw)
            tube("wandTip", (-2.05, -0.4, 4.55), (-2.3, -0.42, 4.75), 0.065, 0.065, mat("glove", WHITE), sw)
            tube("wandEnd", (-1.05, -0.33, 3.78), (-1.2, -0.35, 3.9), 0.065, 0.065, mat("glove", WHITE), sw)


FOES = {"c4e1": puchi, "c4e2": pipa, "c4e3": huanghuang, "c4e4": pengpadashi}
