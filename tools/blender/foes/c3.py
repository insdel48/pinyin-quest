"""第三章 哗啦甜心滩：夹夹（螃蟹）、冰溜溜（冰淇淋）、嘎嘎（海鸥）、哗啦王（大章鱼）"""
import math

from kit import ball, block, brow, cyl, empty, eyes, half_ball, limb, mat, mouth, noodle, ring, smile, soft_box, tube

WHITE = "#ffffff"


def jiajia():
    """亮橙红圆盘大螃蟹，倒扣黄色小水桶当头盔，两只大钳子举着蓝色、粉色塑料沙滩铲，嘴里冒泡泡"""
    root = empty("Foe")
    shell, light = mat("shell", "#ff5a2e"), mat("shellLight", "#ffa070")
    ball("body", (0, 0, 1.05), (1.15, 0.8, 0.62), shell, root)
    ball("belly", (0, -0.5, 0.85), (0.8, 0.35, 0.35), light, root)
    eyes(root, 0, -0.72, 1.25, 0.32, 0.18, look=(-0.3, 0))
    smile("smile", (0, -0.76, 0.92), 0.2, root)
    bubble = mat("bubble", "#dff7ff")
    for k, (x, z, r) in enumerate([(0.3, 0.95, 0.1), (0.45, 1.15, 0.14), (0.62, 1.42, 0.12)]):
        ball(f"d_bubble{k}", (x, -0.85, z), (r, r, r), bubble, root)
    # 倒扣的黄水桶
    yel = mat("bucket", "#ffd23f")
    tube("bucket", (0.05, 0.05, 1.45), (0.1, 0.05, 2.15), 0.58, 0.44, yel, root, verts=24)
    ring("bucketRim", (0.05, 0.05, 1.47), 0.58, 0.05, yel, root)
    ring("handle", (0.08, 0.05, 1.75), 0.6, 0.03, mat("handle", "#ff9a3c"), root, rot=(math.pi / 2, 0, 0.1))
    for sx in (-1, 1):
        for k in range(3):  # 小细腿
            y = -0.3 + k * 0.3
            noodle(f"leg{sx}{k}", [(sx * 0.9, y, 0.85), (sx * 1.35, y, 0.7), (sx * 1.45, y - 0.05, 0.05)], 0.07, 0.04, shell, root)
        sw = empty(f"Sway{sx}", (sx * 1.0, -0.2, 1.15), root)
        noodle(f"arm{sx}", [(sx * 1.0, -0.2, 1.15), (sx * 1.45, -0.3, 1.4), (sx * 1.55, -0.35, 1.8)], 0.1, 0.09, shell, sw)
        ball(f"claw{sx}", (sx * 1.6, -0.35, 2.05), (0.32, 0.26, 0.36), shell, sw)
        tube(f"pincer{sx}", (sx * 1.5, -0.35, 2.3), (sx * 1.38, -0.35, 2.7), 0.12, 0.03, shell, sw)
        tube(f"pincer2{sx}", (sx * 1.72, -0.35, 2.3), (sx * 1.85, -0.35, 2.65), 0.1, 0.03, shell, sw)
        col = "#3f8cff" if sx < 0 else "#ff6fb0"
        tube(f"shovelStick{sx}", (sx * 1.6, -0.55, 1.85), (sx * 1.62, -0.6, 2.5), 0.06, 0.06, mat(f"shovel{sx}", col), sw)
        soft_box(f"shovel{sx}", (sx * 1.63, -0.62, 2.72), (0.4, 0.08, 0.46), mat(f"shovel{sx}", col), sw, bevel=0.3)


def bingliuliu():
    """倒过来的多球甜筒：脆皮筒尖帽子，草莓、芒果、薄荷三个冰淇淋球叠成雪人，踩冰棍棒滑雪板"""
    root = empty("Foe")
    wood = mat("stick", "#e8b77a")
    for sx in (-1, 1):
        block(f"ski{sx}", (sx * 0.32, -0.1, 0.05), (0.2, 1.3, 0.07), wood, root, subdiv=1)
    scoops = [("pink", "#ff8fb8", 0.85, 0.75), ("mango", "#ffc83d", 1.95, 0.62), ("mint", "#7fe0b8", 2.85, 0.55)]
    for name, col, z, r in scoops:
        m = mat(name, col)
        ball(name, (0, 0, z), (r, r * 0.95, r), m, root)
        ring(f"drip{name}", (0, 0, z - r * 0.55), r * 0.85, r * 0.16, m, root)
    eyes(root, 0, -0.48, 2.92, 0.2, 0.13, look=(-0.3, 0))
    mouth("mouth", (0, -0.5, 2.62), 0.16, 0.12, root, depth=0.06)
    for k, (x, z) in enumerate([(-0.3, 1.0), (0.25, 0.7), (0.1, 2.15), (-0.25, 1.85)]):  # 彩色糖粒
        block(f"d_sprinkle{k}", (x, -0.68 if z < 1.5 else -0.56, z), (0.12, 0.03, 0.04), mat(f"spr{k}", ["#4fb6ff", "#ff5a5a", "#a971ff", "#ffffff"][k]), root, subdiv=0, rot=(0, 0.6 * k, 0))
    cone = mat("cone", "#d99a4e")
    tube("cone", (0, 0, 3.2), (0.18, 0, 4.25), 0.5, 0.03, cone, root, verts=24)
    for k in range(3):
        ring(f"d_wafer{k}", (0.04 + k * 0.045, 0, 3.4 + k * 0.25), 0.43 - k * 0.11, 0.025, mat("coneLine", "#a8682a"), root)
    for sx in (-1, 1):
        sw = empty(f"Sway{sx}", (sx * 0.55, 0, 2.0), root)
        tube(f"arm{sx}", (sx * 0.55, 0, 2.0), (sx * 1.0, -0.15, 1.6), 0.05, 0.05, wood, sw)
        ball(f"hand{sx}", (sx * 1.02, -0.15, 1.58), (0.12, 0.12, 0.12), mat("mango", "#ffc83d"), sw)


def gaga():
    """白羽圆肚皮胖海鸥，橙色扁大嘴，脖子挂黄色太阳镜，头顶叠戴三顶帽子（蓝棒球帽、粉草帽、红水手帽）"""
    root = empty("Foe")
    feather, grey, orange = mat("feather", "#ffffff"), mat("wing", "#cfd9e6"), mat("beak", "#ff9a1f")
    ball("body", (0, 0, 1.2), (0.85, 0.78, 0.95), feather, root)
    ball("head", (0, -0.05, 2.25), (0.55, 0.52, 0.52), feather, root)
    eyes(root, 0, -0.45, 2.4, 0.22, 0.13, look=(-0.3, 0))
    ball("beakTop", (0, -0.72, 2.12), (0.28, 0.4, 0.09), orange, root)
    ball("beakLow", (0, -0.62, 1.98), (0.22, 0.3, 0.07), orange, root)
    for sx in (-1, 1):
        sw = empty(f"Sway{sx}", (sx * 0.75, 0, 1.6), root)
        ball(f"wing{sx}", (sx * 0.95, 0.05, 1.25), (0.22, 0.5, 0.6), grey, sw)
        tube(f"leg{sx}", (sx * 0.3, 0, 0.35), (sx * 0.32, -0.05, 0.1), 0.06, 0.06, orange, root)
        ball(f"foot{sx}", (sx * 0.32, -0.2, 0.05), (0.2, 0.3, 0.05), orange, root)
        cyl(f"shade{sx}", (sx * 0.2, -0.75, 1.65), 0.16, 0.05, mat("sunglass", "#ffd23f"), root, rot=(math.pi / 2, 0, 0), bevel=0.01)
    tube("shadeBridge", (-0.06, -0.77, 1.67), (0.06, -0.77, 1.67), 0.025, 0.025, mat("sunglass", "#ffd23f"), root)
    tube("tail", (0, 0.6, 0.9), (0, 1.0, 0.75), 0.25, 0.05, grey, root)
    # 三顶帽子叠起来
    half_ball("cap", (0, 0, 2.6), (0.45, 0.43, 0.3), mat("capBlue", "#2f6fe0"), root, keep="upper")
    ball("capBill", (-0.1, -0.45, 2.62), (0.3, 0.25, 0.04), mat("capBlue", "#2f6fe0"), root)
    cyl("strawBrim", (0.05, 0, 2.9), 0.72, 0.06, mat("straw", "#ff9ccf"), root, rot=(0.1, 0.12, 0), bevel=0.02)
    cyl("strawTop", (0.05, 0, 3.05), 0.36, 0.26, mat("straw", "#ff9ccf"), root, rot=(0.1, 0.12, 0), bevel=0.05)
    cyl("sailor", (0.12, 0, 3.32), 0.32, 0.24, mat("sailor", "#ef3b3b"), root, rot=(0, -0.2, 0), bevel=0.05)
    ring("sailorBand", (0.1, 0, 3.24), 0.33, 0.04, mat("white", WHITE), root, rot=(0, -0.2, 0))
    ball("sailorPom", (0.2, 0, 3.5), (0.08, 0.08, 0.08), mat("white", WHITE), root)


def hualawang():
    """关底：码头尽头的紫粉色大章鱼，气球大脑袋，红白条纹海盗头巾，吸盘圆嘴，八条触手举着小黄鸭泳圈、绿水枪、沙滩球、浮板"""
    root = empty("Foe")
    skin, spot = mat("octo", "#c868dc"), mat("octoSpot", "#e6a2f0")
    cyl("water", (0, 0, 0.04), 2.4, 0.08, mat("water", "#5ec8f0"), root, bevel=0.03)
    ring("foam", (0, 0, 0.1), 2.3, 0.1, mat("foam", "#ffffff"), root)
    ball("head", (0, 0.1, 2.75), (1.3, 1.2, 1.45), skin, root)
    for k, (x, z, r) in enumerate([(-0.75, 3.35, 0.16), (0.8, 3.0, 0.13), (-0.95, 2.3, 0.11), (0.6, 3.75, 0.1)]):
        ball(f"d_spot{k}", (x, -0.95 + abs(x) * 0.15, z), (r, 0.05, r), spot, root, subdiv=0)
    red, white = mat("bandana", "#ef3b3b"), mat("white", "#ffffff")
    for k, (dz, col) in enumerate([(0.62, red), (0.76, white), (0.9, red)]):
        rr = 1.3 * math.sqrt(1 - (dz / 1.45) ** 2) + 0.03
        o = ring(f"band{k}", (0, 0.1, 2.75 + dz), rr, 0.08, col, root)
        o.scale = (1, 1.2 / 1.3, 1)
    ball("knot", (1.05, 0.2, 3.55), (0.2, 0.18, 0.2), red, root)
    for k in (-1, 1):
        tube(f"tail{k}", (1.1, 0.2, 3.5), (1.5, 0.3 + k * 0.15, 3.15), 0.13, 0.05, red, root)
    eyes(root, 0, -0.98, 2.8, 0.45, 0.3, look=(-0.3, 0))
    for sx in (-1, 1):
        brow(f"brow{sx}", (sx * 0.25, -1.08, 3.25), (sx * 0.7, -1.02, 3.2), root, r=0.06)
    ring("lips", (0, -1.12, 2.1), 0.2, 0.08, mat("lips", "#a3409e"), root, rot=(math.pi / 2, 0, 0))
    ball("d_mouthIn", (0, -1.1, 2.1), (0.16, 0.05, 0.16), mat("mouth", "#5a1020"), root, subdiv=0)
    # 八条触手：四条趴在水面卷起来，四条举着玩具
    for k in range(4):
        a = (k / 4) * math.tau + 0.4
        x, y = math.sin(a), -math.cos(a) * 0.6 + 0.4
        noodle(f"leg{k}", [(x * 0.8, y, 1.4), (x * 1.6, y - 0.1, 0.5), (x * 2.2, y, 0.25), (x * 2.35, y - 0.25, 0.6), (x * 2.05, y - 0.3, 0.75)], 0.3, 0.08, skin, root)
    holds = [(-1, (-2.1, -0.4, 2.2)), (-1, (-2.3, -0.2, 3.3)), (1, (2.2, -0.3, 2.4)), (1, (2.1, 0.0, 3.6))]
    tips = []
    for k, (sx, tip) in enumerate(holds):
        sw = empty(f"Sway{k}", (sx * 0.9, -0.2, 1.7), root)
        noodle(f"arm{k}", [(sx * 0.9, -0.2, 1.7), (sx * 1.5, -0.5, 1.4), ((tip[0] + sx * 0.3), tip[1] - 0.1, (tip[2] - 0.6)), tip], 0.28, 0.1, skin, sw)
        tips.append(sw)
    # 绿水枪（朝主角）
    gun = mat("gun", "#3fcf5a")
    soft_box("gunBody", (-2.2, -0.45, 2.3), (0.7, 0.3, 0.35), gun, tips[0], bevel=0.3)
    tube("gunBarrel", (-2.5, -0.45, 2.38), (-3.0, -0.45, 2.4), 0.09, 0.07, gun, tips[0])
    ball("gunTank", (-2.05, -0.45, 2.6), (0.22, 0.2, 0.22), mat("tank", "#ffd23f"), tips[0])
    # 小黄鸭泳圈
    duck = mat("duck", "#ffd23f")
    ring("duckRing", (-2.35, -0.25, 3.55), 0.38, 0.14, duck, tips[1], rot=(math.pi / 2, 0, 0))
    ball("duckHead", (-2.35, -0.3, 4.05), (0.2, 0.2, 0.2), duck, tips[1])
    ball("duckBeak", (-2.5, -0.35, 4.02), (0.1, 0.06, 0.05), mat("beak", "#ff9a1f"), tips[1])
    # 彩色沙滩球
    ball("beachBall", (2.25, -0.35, 2.75), (0.4, 0.4, 0.4), mat("ballRed", "#ef3b3b"), tips[2])
    for k, col in enumerate(["#ffffff", "#3f8cff", "#ffd23f"]):
        ring(f"d_stripe{k}", (2.25, -0.35, 2.75), 0.4, 0.05, mat(f"ball{k}", col), tips[2], rot=(math.pi / 2, k * 1.05, 0))
    # 充气浮板
    soft_box("board", (2.15, 0.0, 4.1), (0.9, 0.18, 0.55), mat("board", "#3f8cff"), tips[3], bevel=0.4, rot=(0, -0.4, 0))
    block("d_boardStripe", (2.15, -0.1, 4.1), (0.85, 0.03, 0.12), mat("white", "#ffffff"), tips[3], subdiv=0, rot=(0, -0.4, 0))


FOES = {"c3e1": jiajia, "c3e2": bingliuliu, "c3e3": gaga, "c3e4": hualawang}
