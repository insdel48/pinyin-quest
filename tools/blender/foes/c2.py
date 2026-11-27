"""第二章 沙沙绿野林：绒绒（毛毛虫）、呱噗（青蛙）、咔咔（松鼠）、木咚咚（树桩）"""
import math

from kit import ball, block, brow, cyl, empty, eyes, half_ball, limb, mat, mouth, noodle, ring, smile, tube

WHITE = "#ffffff"


def rongrong():
    """五颗糖果色毛绒球串成的胖毛毛虫，大黑框圆眼镜，穿白袜子的小短手，尾巴尖是彩色鸡毛掸子"""
    root = empty("Foe")
    cols = ["#ff7eb6", "#ffd23f", "#4fb6ff", "#a971ff", "#ff9a3c"]
    seg = [(-0.85, -0.1, 1.8, 0.72), (-0.3, 0.05, 1.0, 0.6), (0.38, 0.15, 0.62, 0.58), (1.02, 0.25, 0.6, 0.54), (1.6, 0.35, 0.75, 0.48)]
    for i, (x, y, z, r) in enumerate(seg):
        ball(f"seg{i}", (x, y, z), (r, r * 0.95, r), mat(f"fuzz{i}", cols[i]), root)
    hx, hy, hz = seg[0][:3]
    eyes(root, hx, hy - 0.62, hz + 0.08, 0.24, 0.14, look=(-0.3, 0))
    black = mat("black", "#14121a")
    for sx in (-1, 1):  # 大黑框圆眼镜
        ring(f"glass{sx}", (hx + sx * 0.24, hy - 0.72, hz + 0.08), 0.2, 0.04, black, root, rot=(math.pi / 2, 0, 0))
        tube(f"ant{sx}", (hx + sx * 0.25, hy, hz + 0.6), (hx + sx * 0.5, hy, hz + 1.15), 0.03, 0.025, black, root)
        ball(f"antTip{sx}", (hx + sx * 0.52, hy, hz + 1.18), (0.1, 0.1, 0.1), mat("fuzz3", cols[3]), root)
    tube("bridge", (hx - 0.05, hy - 0.73, hz + 0.1), (hx + 0.05, hy - 0.73, hz + 0.1), 0.03, 0.03, black, root)
    smile("smile", (hx, hy - 0.68, hz - 0.28), 0.17, root)
    sock = mat("sock", WHITE)
    for i in (1, 2, 3):  # 六只小短手（每节两只），穿白袜子
        x, y, z, r = seg[i]
        for sy in (-1, 1):
            sw = empty(f"Sway{i}{sy}", (x, y + sy * r * 0.5, z - r * 0.6), root)
            limb(f"leg{i}{sy}", (x, y + sy * r * 0.45, z - r * 0.6), (x - 0.05, y + sy * r * 0.6 - 0.1, 0.15), 0.07, mat(f"fuzz{i}", cols[i]), sw)
            ball(f"sock{i}{sy}", (x - 0.06, y + sy * r * 0.6 - 0.12, 0.1), (0.12, 0.15, 0.1), sock, sw)
    # 尾巴尖：彩色鸡毛掸子
    sw = empty("SwayTail", (1.7, 0.4, 1.1), root)
    tube("dusterStick", (1.7, 0.4, 1.1), (2.0, 0.45, 1.9), 0.05, 0.04, mat("wood", "#c98a4b"), sw)
    for k in range(7):
        a = -0.9 + k * 0.3
        tube(f"feather{k}", (2.0, 0.45, 1.85), (2.0 + math.sin(a) * 0.55, 0.45, 1.85 + math.cos(a) * 0.55), 0.1, 0.02, mat(f"fuzz{k % 5}", cols[k % 5]), sw)


def guapu():
    """蹲在荷叶上的草绿色胖青蛙，大白肚皮像西瓜，反戴荷叶鸭舌帽，两腮鼓鼓，脚蹼沾泥巴"""
    root = empty("Foe")
    green, light, belly = mat("frog", "#6fd23a"), mat("cheek", "#a8ec6a"), mat("belly", "#f6fce8")
    cyl("pad", (0, 0.1, 0.06), 1.45, 0.12, mat("pad", "#2fa34f"), root, bevel=0.04)
    ball("body", (0, 0, 1.05), (1.0, 0.85, 0.92), green, root)
    ball("belly", (0, -0.5, 0.9), (0.78, 0.4, 0.68), belly, root)
    for sx in (-1, 1):
        ball(f"bump{sx}", (sx * 0.45, -0.2, 1.85), (0.32, 0.3, 0.3), green, root)
        ball(f"cheek{sx}", (sx * 0.68, -0.48, 1.38), (0.32, 0.25, 0.25), light, root)
        ball(f"hind{sx}", (sx * 0.85, 0.05, 0.38), (0.42, 0.5, 0.28), green, root)
        ball(f"hindFoot{sx}", (sx * 0.95, -0.4, 0.17), (0.25, 0.22, 0.08), light, root)
        sw = empty(f"Sway{sx}", (sx * 0.6, -0.5, 0.8), root)
        limb(f"arm{sx}", (sx * 0.6, -0.5, 0.8), (sx * 0.55, -0.75, 0.25), 0.1, green, sw)
        ball(f"hand{sx}", (sx * 0.56, -0.82, 0.18), (0.2, 0.18, 0.08), light, sw)
        ball(f"d_mud{sx}", (sx * 0.5, -0.92, 0.21), (0.1, 0.06, 0.05), mat("mud", "#8a5a2b"), sw)
    eyes(root, 0, -0.42, 1.9, 0.45, 0.18, look=(-0.3, 0))
    smile("smile", (0, -0.78, 1.4), 0.36, root, thick=0.04)
    # 反戴的荷叶鸭舌帽（帽舌朝后）
    leaf = mat("leafCap", "#3fb85a")
    half_ball("cap", (0, 0.05, 2.0), (0.42, 0.4, 0.32), leaf, root, keep="upper")
    ball("capBill", (0, 0.5, 2.03), (0.32, 0.3, 0.05), leaf, root)


def kaka():
    """橘红色胖松鼠，超大蓬松问号尾巴，两颗白大门牙，腮帮塞满，系着装松果的树叶围裙"""
    root = empty("Foe")
    fur, light, tip = mat("fur", "#ff7a1a"), mat("furLight", "#ffd1a1"), mat("tailTip", "#ffb066")
    ball("body", (0, 0, 1.0), (0.75, 0.65, 0.85), fur, root)
    ball("belly", (0, -0.45, 0.95), (0.5, 0.25, 0.6), light, root)
    ball("head", (0, -0.05, 2.1), (0.66, 0.6, 0.58), fur, root)
    for sx in (-1, 1):
        tube(f"ear{sx}", (sx * 0.35, 0, 2.5), (sx * 0.48, 0.05, 2.98), 0.15, 0.03, fur, root)
        ball(f"cheek{sx}", (sx * 0.42, -0.45, 1.95), (0.3, 0.25, 0.25), light, root)
        sw = empty(f"Sway{sx}", (sx * 0.6, -0.2, 1.4), root)
        limb(f"arm{sx}", (sx * 0.6, -0.2, 1.4), (sx * 0.6, -0.55, 1.05), 0.1, fur, sw)
        ball(f"hand{sx}", (sx * 0.58, -0.62, 1.0), (0.13, 0.13, 0.13), fur, sw)
        ball(f"foot{sx}", (sx * 0.38, -0.3, 0.12), (0.22, 0.32, 0.12), fur, root)
    eyes(root, 0, -0.52, 2.28, 0.23, 0.15, look=(-0.3, 0))
    ball("nose", (0, -0.65, 2.05), (0.09, 0.06, 0.07), mat("noseD", "#5a2a14"), root)
    for sx in (-1, 1):
        block(f"tooth{sx}", (sx * 0.055, -0.62, 1.86), (0.1, 0.04, 0.16), mat("white", WHITE), root, subdiv=1)
    # 问号形大尾巴：一串由大到小的毛球
    pts = [(0.5, 0.45, 0.5), (0.9, 0.6, 0.9), (1.15, 0.65, 1.5), (1.15, 0.6, 2.15), (0.85, 0.55, 2.65), (0.35, 0.5, 2.8), (0.05, 0.45, 2.55)]
    tail = empty("SwayTail", pts[0], root)
    for i, p in enumerate(pts):
        r = 0.5 - i * 0.04
        ball(f"tail{i}", p, (r, r * 0.8, r), tip if i >= 5 else fur, tail)
    # 树叶围裙 + 大松果
    ball("apron", (0, -0.6, 0.8), (0.55, 0.12, 0.42), mat("leaf", "#4cbb47"), root)
    for k, (x, z) in enumerate([(-0.22, 0.78), (0.2, 0.82)]):
        ball(f"cone{k}", (x, -0.72, z), (0.13, 0.1, 0.17), mat("pinecone", "#8a4f22"), root)
    ball("coneHand", (-0.62, -0.72, 0.98), (0.17, 0.14, 0.22), mat("pinecone", "#8a4f22"), root)


def mudongdong():
    """关底：巨型老树桩，浅黄年轮肚脐，翠绿树冠爆炸头，绿叶大胡子，树枝手臂叉腰，树皮眉毛拧成八字"""
    root = empty("Foe")
    bark, barkD = mat("bark", "#9a5f2c"), mat("barkDark", "#6e4019")
    cyl("trunk", (0, 0, 1.6), 1.35, 2.7, bark, root, bevel=0.25, verts=40)
    for k in range(6):  # 树根
        a = k / 6 * math.tau + 0.3
        tube(f"root{k}", (math.sin(a) * 1.1, -math.cos(a) * 1.1, 0.6), (math.sin(a) * 1.75, -math.cos(a) * 1.75, 0.05), 0.32, 0.12, bark, root)
    for k in range(5):  # 树皮纹
        x = -0.9 + k * 0.45
        block(f"d_grain{k}", (x, -1.33 + abs(x) * 0.25, 2.95), (0.06, 0.03, 0.5), barkD, root, subdiv=0, rot=(0, 0.1 * (k - 2), 0))
    # 年轮肚脐
    cyl("rings", (0, -1.33, 1.15), 0.48, 0.08, mat("wood", "#ffe0a0"), root, rot=(math.pi / 2, 0, 0), bevel=0.02)
    for r in (0.32, 0.18):
        ring(f"d_ring{r}", (0, -1.38, 1.15), r, 0.025, mat("ringLine", "#c9894a"), root, rot=(math.pi / 2, 0, 0))
    # 爆炸头树冠
    greens = [mat("canopy", "#3fbf3f"), mat("canopyDark", "#2b9a35")]
    for k, (x, y, z, r) in enumerate([(0, 0, 3.4, 0.9), (-0.9, 0.1, 3.2, 0.7), (0.9, 0.1, 3.2, 0.7), (-0.5, 0.2, 4.05, 0.7), (0.55, 0.15, 4.0, 0.72),
                                      (0, 0.35, 4.4, 0.6), (-1.25, 0.3, 3.7, 0.5), (1.3, 0.3, 3.7, 0.5), (0, -0.55, 3.5, 0.55)]):
        ball(f"crown{k}", (x, y, z), (r, r, r * 0.92), greens[k % 2], root)
    eyes(root, 0, -1.3, 2.55, 0.42, 0.22, look=(-0.3, 0))
    for sx in (-1, 1):  # 拧成八字的树皮眉毛
        block(f"brow{sx}", (sx * 0.45, -1.42, 2.95), (0.5, 0.12, 0.14), barkD, root, subdiv=1, rot=(0, sx * 0.45, 0))
    mouth("mouth", (0, -1.32, 2.12), 0.3, 0.2, root, tongue=False, teeth=3, depth=0.1)
    for k, (x, z, r) in enumerate([(-0.35, 1.85, 0.25), (0, 1.75, 0.28), (0.35, 1.85, 0.25), (-0.18, 1.6, 0.22), (0.18, 1.6, 0.22)]):
        ball(f"beard{k}", (x, -1.38, z), (r, 0.15, r), greens[(k + 1) % 2], root)
    for sx in (-1, 1):  # 树枝手臂叉腰
        sw = empty(f"Sway{sx}", (sx * 1.3, 0, 2.2), root)
        noodle(f"arm{sx}", [(sx * 1.25, 0, 2.2), (sx * 2.0, -0.2, 2.15), (sx * 2.05, -0.35, 1.6), (sx * 1.45, -0.6, 1.35)], 0.2, 0.14, bark, sw)
        ball(f"hand{sx}", (sx * 1.4, -0.65, 1.33), (0.22, 0.2, 0.22), bark, sw)


FOES = {"c2e1": rongrong, "c2e2": guapu, "c2e3": kaka, "c2e4": mudongdong}
