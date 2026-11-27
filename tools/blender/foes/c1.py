"""第一章 叮当早安街：呼呼（枕头）、黏黏（果酱罐）、嘭嘭（吐司）、当当王（双铃闹钟）"""
import math

from kit import ball, block, brow, cyl, empty, eyes, half_ball, limb, mat, mouth, noodle, smile, soft_box, tube


def huhu():
    """胖方形浅蓝条纹大枕头，四角黄毛球，半眯睡眼打哈欠，鼻涕泡，歪戴蓝白圆点睡帽"""
    root = empty("Foe")
    blue, stripe, yel = mat("pillow", "#a8d8ff"), mat("stripe", "#5fa8f0"), mat("pom", "#ffd23f")
    soft_box("body", (0, 0, 1.3), (2.0, 0.95, 1.65), blue, root, bevel=0.32)
    for z in (0.72, 0.9, 1.98):  # 横条纹，避开脸
        block(f"d_stripe{z}", (0, -0.475, z), (1.5, 0.03, 0.09), stripe, root, subdiv=1)
    for sx in (-1, 1):
        for z in (0.55, 2.05):
            ball(f"pom{sx}{z}", (sx * 0.98, 0, z), (0.19, 0.19, 0.19), yel, root)
        sw = empty(f"Sway{sx}", (sx * 0.95, 0, 1.25), root)
        limb(f"arm{sx}", (sx * 0.95, -0.05, 1.25), (sx * 1.3, -0.15, 0.95), 0.13, blue, sw)
        ball(f"hand{sx}", (sx * 1.35, -0.18, 0.88), (0.16, 0.16, 0.16), blue, sw)
        limb(f"leg{sx}", (sx * 0.45, 0, 0.55), (sx * 0.5, -0.05, 0.16), 0.14, blue, root)
        ball(f"foot{sx}", (sx * 0.5, -0.12, 0.1), (0.2, 0.26, 0.1), stripe, root)
    # 半眯的困眼：眼睛上半盖一片“眼皮”
    eyes(root, 0, -0.45, 1.68, 0.4, 0.17, look=(-0.2, -0.4))
    for sx in (-1, 1):
        half_ball(f"lid{sx}", (sx * 0.4, -0.47, 1.7), (0.2, 0.12, 0.2), blue, root, keep="upper")
    mouth("yawn", (0.05, -0.46, 1.15), 0.3, 0.36, root, tongue=True, depth=0.12)
    ball("nose", (0, -0.5, 1.45), (0.07, 0.05, 0.06), stripe, root)
    ball("d_bubble", (0.16, -0.6, 1.36), (0.17, 0.12, 0.17), mat("bubble", "#dff7ff"), root)
    # 歪戴的睡帽
    ball("capBrim", (-0.15, 0, 2.15), (0.75, 0.55, 0.14), mat("white", "#ffffff"), root)
    cap = mat("cap", "#3b6fe0")
    noodle("cap", [(-0.15, 0, 2.15), (0.0, 0, 2.6), (0.45, 0, 2.85), (0.9, -0.05, 2.65)], 0.62, 0.05, cap, root)
    for i, (x, z) in enumerate([(-0.3, 2.4), (0.05, 2.55), (0.25, 2.33), (0.45, 2.75), (-0.1, 2.75)]):
        ball(f"d_dot{i}", (x, -0.5 + abs(x) * 0.2, z), (0.07, 0.03, 0.07), mat("white", "#ffffff"), root, subdiv=0)
    ball("capPom", (0.95, -0.05, 2.55), (0.17, 0.17, 0.17), mat("white", "#ffffff"), root)


def nianian():
    """圆滚滚玻璃果酱罐：紫红草莓酱肚子，红白格子铁皮盖当帽子，两只果酱大巴掌，握木头勺"""
    root = empty("Foe")
    jam, jamD, glass = mat("jam", "#e0266e"), mat("jamHand", "#a3124f"), mat("glass", "#e6f6ff")
    ball("jar", (0, 0, 1.35), (1.0, 0.9, 0.95), jam, root)
    ball("d_shine", (-0.55, -0.72, 1.65), (0.12, 0.04, 0.32), mat("white", "#ffffff"), root, subdiv=0)
    cyl("neck", (0, 0, 2.3), 0.72, 0.3, glass, root)
    cyl("lid", (0, 0, 2.55), 0.82, 0.3, mat("lid", "#ef3b3b"), root, bevel=0.1)
    for i in range(8):  # 红白格子：盖子侧面一圈白方块
        a = i / 8 * math.tau
        block(f"d_check{i}", (math.sin(a) * 0.83, -math.cos(a) * 0.83, 2.55), (0.18, 0.04, 0.14), mat("white", "#ffffff"), root, subdiv=0, rot=(0, 0, a))
    cyl("lidTop", (0, 0, 2.75), 0.55, 0.12, mat("white", "#ffffff"), root, bevel=0.04)
    eyes(root, 0, -0.84, 1.62, 0.3, 0.17, look=(-0.3, 0))
    for sx in (-1, 1):
        brow(f"brow{sx}", (sx * 0.2, -0.9, 1.95), (sx * 0.45, -0.86, 1.88), root)
    smile("smile", (0, -0.9, 1.2), 0.22, root, thick=0.045)
    hands = {}
    for sx in (-1, 1):  # 嘴边的果酱胡子
        ball(f"stache{sx}", (sx * 0.16, -0.92, 1.3), (0.16, 0.06, 0.07), jamD, root)
        sw = hands[sx] = empty(f"Sway{sx}", (sx * 0.95, 0, 1.4), root)
        limb(f"arm{sx}", (sx * 0.9, 0, 1.4), (sx * 1.35, -0.2, 1.2), 0.12, jamD, sw)
        ball(f"hand{sx}", (sx * 1.45, -0.25, 1.15), (0.3, 0.2, 0.3), jamD, sw)
        ball(f"foot{sx}", (sx * 0.45, -0.15, 0.2), (0.22, 0.28, 0.2), jamD, root)
    # 左手（朝主角）握木头大勺
    wood = mat("wood", "#c98a4b")
    tube("spoonStick", (-1.45, -0.3, 0.9), (-1.6, -0.4, 2.3), 0.06, 0.05, wood, hands[-1])
    half_ball("spoonBowl", (-1.62, -0.4, 2.45), (0.26, 0.12, 0.32), wood, hands[-1], keep="lower", rot=(math.pi, 0, 0))


def pengpeng():
    """金黄厚吐司：焦黄蓬松面包边、黑豆眼、方黄油当舌头、银色烤面包机弹簧腿"""
    root = empty("Foe")
    crust, crumb = mat("crust", "#c9782f"), mat("crumb", "#ffe3a0")
    soft_box("crust", (0, 0.03, 1.55), (1.9, 0.5, 1.45), crust, root, bevel=0.2)
    for sx in (-1, 1):
        ball(f"lobe{sx}", (sx * 0.45, 0.03, 2.3), (0.62, 0.25, 0.42), crust, root)
    soft_box("crumb", (0, -0.22, 1.5), (1.62, 0.08, 1.25), crumb, root, bevel=0.15)
    for sx in (-1, 1):
        ball(f"crumbLobe{sx}", (sx * 0.43, -0.22, 2.25), (0.5, 0.045, 0.3), crumb, root)
    eyes(root, 0, -0.3, 1.85, 0.36, 0.2, look=(-0.3, 0))
    for sx in (-1, 1):
        brow(f"brow{sx}", (sx * 0.22, -0.34, 2.15), (sx * 0.5, -0.32, 2.2), root, r=0.05)
    mouth("mouth", (0, -0.27, 1.3), 0.3, 0.2, root, tongue=False, depth=0.06)
    block("butter", (0.05, -0.33, 1.08), (0.32, 0.08, 0.3), mat("butter", "#fff06a"), root, subdiv=1)
    metal = mat("spring", "#cfd8e3")
    for sx in (-1, 1):  # 弹簧腿：一圈圈叠起来的银环
        for i in range(5):
            bpy_ring(f"coil{sx}{i}", (sx * 0.45, 0, 0.2 + i * 0.12), 0.14, 0.04, metal, root)
        ball(f"foot{sx}", (sx * 0.45, -0.08, 0.08), (0.2, 0.26, 0.08), mat("foot", "#5b6473"), root)
        sw = empty(f"Sway{sx}", (sx * 0.95, 0, 1.5), root)
        limb(f"arm{sx}", (sx * 0.93, 0, 1.5), (sx * 1.3, -0.15, 1.15), 0.09, crust, sw)
        ball(f"hand{sx}", (sx * 1.35, -0.18, 1.1), (0.14, 0.14, 0.14), crust, sw)


def dangdang():
    """关底：青铜双铃大圆闹钟，指针像八字胡，头顶两个金铃，发条手臂拎红色橡皮小锤"""
    root = empty("Foe")
    bronze, gold, face = mat("bronze", "#d0782a"), mat("gold", "#ffc533"), mat("dial", "#fff6dc")
    cyl("case", (0, 0, 2.2), 1.65, 1.0, bronze, root, rot=(math.pi / 2, 0, 0), bevel=0.2, verts=48)
    bpy_ring("bezel", (0, -0.5, 2.2), 1.5, 0.13, gold, root, rot=(math.pi / 2, 0, 0))
    cyl("d_dial", (0, -0.5, 2.2), 1.42, 0.06, face, root, rot=(math.pi / 2, 0, 0), bevel=0, verts=48)
    for i in range(12):  # 歪七扭八的刻度
        a = i / 12 * math.tau
        block(f"d_tick{i}", (math.sin(a) * 1.18, -0.55, 2.2 + math.cos(a) * 1.18), (0.07, 0.03, 0.22 if i % 3 == 0 else 0.12),
              mat("black", "#14121a"), root, subdiv=0, rot=(0, a + (0.3 if i % 2 else -0.2), 0))
    eyes(root, 0, -0.55, 2.65, 0.45, 0.27, look=(-0.3, 0))
    for sx in (-1, 1):
        brow(f"brow{sx}", (sx * 0.2, -0.6, 3.08), (sx * 0.72, -0.58, 3.2), root, r=0.07)
        noodle(f"hand{sx}", [(0, -0.6, 2.05), (sx * 0.4, -0.62, 1.98), (sx * 0.7, -0.62, 2.1), (sx * 0.78, -0.62, 2.3)], 0.08, 0.035, mat("black", "#14121a"), root)
    ball("pin", (0, -0.62, 2.05), (0.11, 0.06, 0.11), gold, root)
    mouth("mouth", (0, -0.56, 1.55), 0.45, 0.32, root, teeth=4, depth=0.1)
    for sx in (-1, 1):
        tube(f"bellPost{sx}", (sx * 0.55, 0, 3.6), (sx * 0.85, 0, 3.95), 0.07, 0.07, gold, root)
        half_ball(f"bell{sx}", (sx * 0.95, 0, 3.95), (0.6, 0.6, 0.55), gold, root, keep="upper", rot=(0, sx * 0.35, 0))
        ball(f"bellKnob{sx}", (sx * 1.15, 0, 4.5), (0.1, 0.1, 0.1), gold, root)
        limb(f"leg{sx}", (sx * 0.85, 0, 0.75), (sx * 1.1, 0, 0.2), 0.12, bronze, root)
        ball(f"foot{sx}", (sx * 1.12, -0.05, 0.14), (0.24, 0.24, 0.16), gold, root)
        # 发条手臂 + 红色橡皮小锤
        sw = empty(f"Sway{sx}", (sx * 1.6, 0, 2.4), root)
        noodle(f"arm{sx}", [(sx * 1.55, 0, 2.4), (sx * 2.0, -0.1, 2.5), (sx * 2.15, -0.2, 2.95)], 0.11, 0.09, gold, sw)
        ball(f"fist{sx}", (sx * 2.15, -0.2, 3.0), (0.18, 0.18, 0.18), gold, sw)
        tube(f"malletStick{sx}", (sx * 2.15, -0.2, 2.8), (sx * 1.85, -0.25, 3.65), 0.05, 0.05, mat("wood", "#c98a4b"), sw)
        cyl(f"mallet{sx}", (sx * 1.8, -0.25, 3.75), 0.2, 0.5, mat("rubber", "#ef3b3b"), sw, rot=(0, math.pi / 2 - sx * 0.35, 0), bevel=0.08)
    ball("d_shine", (-0.9, -0.62, 2.75), (0.08, 0.02, 0.22), mat("white", "#ffffff"), root, subdiv=0)


def bpy_ring(name, loc, major, minor, material, parent, rot=(0, 0, 0)):
    from kit import ring
    return ring(name, loc, major, minor, material, parent, rot=rot)


FOES = {"c1e1": huhu, "c1e2": nianian, "c1e3": pengpeng, "c1e4": dangdang}
