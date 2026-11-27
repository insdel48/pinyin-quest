"""第五章 轰隆回声山：闷闷（乌云）、咚哐（军鼓卫兵）、呜哇（萨克斯小喇叭）、咕噜大王（终极大怪）"""
import math

from kit import ball, block, brow, cyl, empty, eyes, half_ball, limb, mat, mouth, noodle, ring, slab, smile, star_pts, tube

WHITE = "#ffffff"
BOLT = [(-0.1, 0.32), (0.12, 0.32), (0.02, 0.06), (0.16, 0.06), (-0.1, -0.34), (-0.02, -0.04), (-0.16, -0.04)]


def menmen():
    """灰扑扑胖乎乎的圆乌云，头顶闪电形黄发卡，浓眉耷拉，揉着圆鼻子，拎一把迷你黄色小水壶"""
    root = empty("Foe")
    grey, grey2 = mat("cloud", "#9ea7ba"), mat("cloudLight", "#b9c1d1")
    ball("core", (0, 0, 2.0), (1.05, 0.85, 0.85), grey, root)
    for k, (x, y, z, r) in enumerate([(-0.95, 0.05, 1.75, 0.6), (0.95, 0.05, 1.75, 0.6), (-0.5, 0.1, 2.65, 0.6), (0.45, 0.1, 2.7, 0.62),
                                      (0, 0.2, 2.95, 0.5), (-0.55, -0.05, 1.35, 0.5), (0.55, -0.05, 1.35, 0.5), (0, 0.0, 1.25, 0.5)]):
        ball(f"puff{k}", (x, y, z), (r, r * 0.9, r * 0.9), grey2 if k % 3 == 0 else grey, root)
    eyes(root, 0, -0.78, 2.15, 0.3, 0.16, look=(-0.2, -0.5))
    for sx in (-1, 1):  # 耷拉的浓眉
        brow(f"brow{sx}", (sx * 0.15, -0.86, 2.48), (sx * 0.5, -0.82, 2.36), root, r=0.07)
    ball("nose", (0, -0.9, 1.92), (0.13, 0.1, 0.12), mat("nose", "#d9a0b0"), root)
    smile("frown", (0, -0.84, 1.62), 0.14, root, frown=True)
    slab("clip", BOLT, 0.08, (0.35, -0.3, 3.35), mat("bolt", "#ffd23f"), root, rot=(math.pi / 2, 0, -0.3))
    for sx in (-1, 1):
        sw = empty(f"Sway{sx}", (sx * 1.1, -0.3, 1.8), root)
        ball(f"hand{sx}", (sx * 1.35, -0.45, 1.6), (0.25, 0.22, 0.22), grey2, sw)
    # 迷你小水壶（拎在朝主角那只手）
    can = mat("can", "#ffd23f")
    cyl("can", (-1.45, -0.55, 1.2), 0.22, 0.32, can, root, bevel=0.04)
    tube("spout", (-1.6, -0.55, 1.2), (-1.95, -0.55, 1.45), 0.06, 0.04, can, root)
    ring("canHandle", (-1.4, -0.5, 1.45), 0.14, 0.03, can, root, rot=(math.pi / 2, 0, 0))


def dongkuang():
    """小圆肚红蓝铁皮军鼓卫兵：身体是系金绳的大圆鼓，戴偏大往下滑的蓝色高筒绒球帽，两只短铁皮手各抓一根白鼓槌"""
    root = empty("Foe")
    red, blue, skin, gold = mat("drumRed", "#e53935"), mat("drumBlue", "#1f55d6"), mat("drumSkin", "#fff6e0"), mat("gold", "#ffc533")
    cyl("drum", (0, 0, 1.4), 0.95, 0.95, red, root, rot=(math.pi / 2, 0, 0), bevel=0.05, verts=40)
    cyl("skin", (0, -0.47, 1.4), 0.88, 0.04, skin, root, rot=(math.pi / 2, 0, 0), bevel=0.01, verts=40)
    for y in (-0.47, 0.47):
        ring(f"hoop{y}", (0, y, 1.4), 0.95, 0.07, blue, root, rot=(math.pi / 2, 0, 0))
    for k in range(10):  # 交叉金绳（鼓身一圈 Z 字）
        a = k / 10 * math.tau
        tube(f"rope{k}", (math.sin(a) * 0.97, -0.4, 1.4 + math.cos(a) * 0.97), (math.sin(a + 0.31) * 0.97, 0.4, 1.4 + math.cos(a + 0.31) * 0.97), 0.03, 0.03, gold, root)
    ball("head", (0, 0, 2.65), (0.48, 0.45, 0.45), mat("face", "#ffd9b8"), root)
    eyes(root, 0, -0.38, 2.6, 0.18, 0.12, look=(-0.3, 0))
    smile("smile", (0, -0.42, 2.42), 0.1, root)
    for sx in (-1, 1):
        ball(f"d_blush{sx}", (sx * 0.28, -0.38, 2.48), (0.08, 0.03, 0.05), mat("blush", "#ff8f8f"), root, subdiv=0)
    # 偏大、往下滑的高筒绒球帽
    cyl("busby", (0.05, 0, 3.25), 0.5, 0.95, blue, root, rot=(0, 0.12, 0), bevel=0.15, r2=0.44)
    block("plate", (0.03, -0.48, 3.0), (0.3, 0.04, 0.26), gold, root, subdiv=1)
    ball("pom", (0.12, 0, 3.8), (0.18, 0.18, 0.18), red, root)
    for sx in (-1, 1):
        sw = empty(f"Sway{sx}", (sx * 0.9, 0, 1.9), root)
        limb(f"arm{sx}", (sx * 0.9, 0, 1.9), (sx * 1.15, -0.4, 1.65), 0.1, blue, sw)
        ball(f"hand{sx}", (sx * 1.15, -0.45, 1.6), (0.13, 0.13, 0.13), mat("glove", WHITE), sw)
        tube(f"stick{sx}", (sx * 1.15, -0.5, 1.6), (sx * 0.65, -0.75, 2.15), 0.04, 0.035, mat("glove", WHITE), sw)
        ball(f"stickTip{sx}", (sx * 0.62, -0.77, 2.18), (0.09, 0.09, 0.09), mat("glove", WHITE), sw)
        limb(f"leg{sx}", (sx * 0.35, 0, 0.6), (sx * 0.38, -0.05, 0.2), 0.1, blue, root)
        ball(f"boot{sx}", (sx * 0.38, -0.12, 0.12), (0.18, 0.26, 0.13), mat("boot", "#14121a"), root)


def wuwa():
    """黄铜弯脖子萨克斯风加小喇叭：大喇叭口就是大圆嘴，铜管肚子上三颗彩色按键，穿带小翅膀的红皮鞋"""
    root = empty("Foe")
    brass, brassD = mat("brass", "#f5b82e"), mat("brassDark", "#d08a12")
    noodle("body", [(0, 0.1, 0.7), (0, 0.1, 1.5), (0.0, 0.05, 2.2), (0, 0, 2.6)], 0.42, 0.5, brass, root)
    noodle("bend", [(0, 0.1, 0.75), (0.25, 0.15, 0.5), (0.65, 0.2, 0.6), (0.8, 0.2, 1.1)], 0.42, 0.32, brass, root)
    tube("lowBell", (0.8, 0.2, 1.05), (0.9, 0.2, 1.55), 0.3, 0.5, brass, root, verts=28)
    cyl("d_lowBellIn", (0.9, 0.2, 1.56), 0.42, 0.02, mat("hole", "#3a1f08"), root, bevel=0)
    ball("head", (0, 0, 3.0), (0.62, 0.58, 0.6), brass, root)
    eyes(root, 0, -0.5, 3.22, 0.22, 0.15, look=(-0.3, 0))
    for sx in (-1, 1):
        brow(f"brow{sx}", (sx * 0.1, -0.56, 3.46), (sx * 0.36, -0.52, 3.5), root, r=0.04)
    # 大喇叭嘴：朝前张开
    tube("bell", (0, -0.4, 2.42), (0, -1.0, 2.32), 0.22, 0.5, brass, root, verts=32)
    ring("bellRim", (0, -1.0, 2.32), 0.5, 0.06, brassD, root, rot=(math.pi / 2, 0, 0))
    cyl("d_bellIn", (0, -0.96, 2.32), 0.45, 0.02, mat("mouth", "#5a1020"), root, rot=(math.pi / 2, 0, 0), bevel=0)
    for k, col in enumerate(["#ef3b3b", "#5cc04a", "#3f8cff"]):
        cyl(f"key{k}", (0, -0.42, 1.05 + k * 0.38), 0.13, 0.12, mat(f"key{k}", col), root, rot=(math.pi / 2, 0, 0), bevel=0.04)
    for sx in (-1, 1):
        limb(f"leg{sx}", (sx * 0.25, 0.05, 0.55), (sx * 0.3, 0, 0.2), 0.08, brassD, root)
        ball(f"shoe{sx}", (sx * 0.3, -0.12, 0.12), (0.18, 0.28, 0.12), mat("shoe", "#e53935"), root)
        sw = empty(f"Sway{sx}", (sx * 0.4, 0.15, 0.2), root)
        ball(f"wing{sx}", (sx * 0.5, 0.15, 0.3), (0.06, 0.18, 0.12), mat("wing", WHITE), sw)


def gulu():
    """终极关底：紫蓝色大橡胶弹力球胖魔王，歪戴镶糖果的金色小皇冠，红色星星披风，圆耳朵，大白肚皮，嗓子里卡着发金光的清脆宝珠，嘴边冒彩色泡泡"""
    root = empty("Foe")
    body, belly, red, gold = mat("king", "#5a6cf0"), mat("belly", "#ffffff"), mat("cape", "#e53935"), mat("gold", "#ffc533")
    ball("cape", (0, 0.75, 1.75), (1.75, 0.55, 1.6), red, root)
    for k, (x, z) in enumerate([(-1.45, 1.4), (1.5, 1.9), (-1.2, 2.5), (1.35, 0.9)]):
        slab(f"d_capeStar{k}", star_pts(0.14), 0.04, (x, 0.2 + abs(x) * 0.1, z), mat("capeStar", "#ffd23f"), root, rot=(math.pi / 2, 0, x * 0.6))
    ball("body", (0, 0, 1.75), (1.6, 1.4, 1.55), body, root)
    ball("belly", (0, -0.95, 1.4), (1.1, 0.5, 1.0), belly, root)
    for sx in (-1, 1):
        ball(f"ear{sx}", (sx * 1.05, 0.05, 3.05), (0.36, 0.25, 0.36), body, root)
        ball(f"earIn{sx}", (sx * 1.05, -0.12, 3.05), (0.2, 0.1, 0.2), mat("earIn", "#ff9ccf"), root)
        ball(f"clasp{sx}", (sx * 1.2, -0.45, 2.75), (0.13, 0.1, 0.13), gold, root)
        sw = empty(f"Sway{sx}", (sx * 1.45, -0.2, 1.9), root)
        ball(f"arm{sx}", (sx * 1.7, -0.3, 1.6), (0.35, 0.3, 0.42), body, sw)
        ball(f"foot{sx}", (sx * 0.7, -0.45, 0.22), (0.42, 0.5, 0.25), body, root)
    eyes(root, 0, -1.2, 2.55, 0.45, 0.25, look=(-0.3, 0))
    for sx in (-1, 1):
        brow(f"brow{sx}", (sx * 0.2, -1.3, 2.95), (sx * 0.7, -1.22, 3.05), root, r=0.07)
    mouth("mouth", (0, -1.25, 2.05), 0.55, 0.42, root, tongue=False, fangs=2, depth=0.2)
    ball("d_orb", (0, -1.3, 1.85), (0.16, 0.1, 0.16), mat("glow", "#ffe14d"), root)
    for k, (x, z, r, col) in enumerate([(-0.85, 1.95, 0.16, "#ff6fb0"), (-1.05, 2.3, 0.11, "#4fb6ff"), (0.8, 1.9, 0.14, "#8ee04a"), (1.0, 2.25, 0.1, "#ffd23f")]):
        ball(f"d_bubble{k}", (x, -1.4, z), (r, r, r), mat(f"bubble{k}", col), root)
    # 歪戴的金皇冠，镶糖果
    crown = empty("Crown", (0.15, 0, 3.25), root)
    cyl("crownBand", (0.15, 0, 3.35), 0.55, 0.32, gold, crown, bevel=0.03, verts=24)
    for k in range(5):
        a = k / 5 * math.tau
        tube(f"spike{k}", (0.15 + math.sin(a) * 0.48, -math.cos(a) * 0.48, 3.48), (0.15 + math.sin(a) * 0.5, -math.cos(a) * 0.5, 3.85), 0.12, 0.02, gold, crown, verts=8)
        ball(f"d_candy{k}", (0.15 + math.sin(a) * 0.56, -math.cos(a) * 0.56, 3.35), (0.07, 0.07, 0.07), mat(f"candy{k}", ["#ef3b3b", "#4fb6ff", "#8ee04a", "#ff6fb0", "#a971ff"][k]), crown, subdiv=0)
    crown.rotation_euler = (0, 0.3, 0)


FOES = {"c5e1": menmen, "c5e2": dongkuang, "c5e3": wuwa, "c5e4": gulu}
