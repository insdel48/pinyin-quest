"""Blender 建模小工具：建圆润的卡通部件、上色、导出 glb、渲染预览图。

被各个角色脚本 import。运行方式（后台，不开界面）：
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/blender/kid.py
坐标：Blender 里 Z 朝上，角色面朝 -Y（导出 glTF 后变成面朝 +Z，正对游戏镜头）。
"""
import math
import pathlib
import sys

import bpy
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[2]
MATS: dict = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()


def mat(name, color, rough=0.6):
    """按名字复用材质；游戏里按材质名和颜色换成卡通材质"""
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    r, g, b = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    bsdf.inputs["Base Color"].default_value = (r ** 2.2, g ** 2.2, b ** 2.2, 1)
    bsdf.inputs["Roughness"].default_value = rough
    MATS[name] = m
    return m


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    if parent:
        o.parent = parent
    return o


def _finish(o, name, material, parent, subdiv, smooth=True):
    o.name = name
    if material:
        o.data.materials.append(material)
    if subdiv:
        mod = o.modifiers.new("sub", "SUBSURF")
        mod.levels = subdiv
        mod.render_levels = subdiv
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    if parent:
        mw = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = mw
    return o


def ball(name, loc, scale, material, parent=None, subdiv=1, seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, name, material, parent, subdiv)


def tube(name, a, b, r1, r2, material, parent=None, subdiv=1, verts=16):
    """从点 a 到点 b 的圆台（带细分会变成胶囊感）"""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bpy.ops.object.transform_apply(rotation=True)
    return _finish(o, name, material, parent, subdiv)


def limb(name, a, b, r, material, parent=None, subdiv=1, squash=1.0):
    """从 a 到 b 的圆润椭球（手臂、腿、身子），两头圆、没有棱"""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1, location=(a + b) / 2)
    o = bpy.context.active_object
    o.scale = (r, r * squash, d.length / 2 + r * 0.35)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    return _finish(o, name, material, parent, subdiv)


def set_parent(o, parent):
    """挂到父物体下，保持世界位置不变"""
    mw = o.matrix_world.copy()
    o.parent = parent
    o.matrix_world = mw


def ring(name, loc, major, minor, material, parent=None, rot=(0, 0, 0), subdiv=0):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot, major_segments=32, minor_segments=10)
    o = bpy.context.active_object
    return _finish(o, name, material, parent, subdiv)


def block(name, loc, size, material, parent=None, subdiv=2, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    return _finish(o, name, material, parent, subdiv, smooth=subdiv > 0)


def join(objs, name):
    """把几个部件合成一个物体（保留各自材质）"""
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        for m in list(o.modifiers):
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=m.name)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def export(rel):
    out = ROOT / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", export_apply=True, export_yup=True,
                              export_animations=False, export_materials="EXPORT",
                              # Draco 压缩：文件小好几倍，平板首次打开更快（游戏里用 DRACOLoader 解）
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10)
    print("导出", out, out.stat().st_size // 1024, "KB")


def preview(rel, target=(0, 0, 1.4), dist=6.5, height=2.4, angle=-20):
    """渲染一张预览图（3/4 侧面），用来检查造型"""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 900, 1100
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    world.color = (0.92, 0.9, 0.85)
    scene.world = world
    a = math.radians(angle)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    cam.location = (target[0] + math.sin(a) * dist, target[1] - math.cos(a) * dist, target[2] + height - 1.4)
    look = Vector(target) - cam.location
    cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    scene.camera = cam
    for loc, energy in (((-4, -5, 6), 900), ((5, -3, 3), 300), ((0, 5, 5), 400)):
        L = bpy.data.objects.new("L", bpy.data.lights.new("L", "AREA"))
        L.data.energy = energy
        L.data.size = 4
        L.location = loc
        L.rotation_euler = (Vector((0, 0, 1.4)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(L)
    scene.render.use_freestyle = True
    scene.render.line_thickness = 1.6
    out = ROOT / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    print("预览", out)


def args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


# ---------- 卡通脸和常用部件（粗黑线美式卡通） ----------
# 命名约定（游戏按名字处理）：
#   d_ 开头的部件不加描边（眼珠、高光、腮红、嘴里面这种小细节）
#   Eye 开头的空物体：眨眼时整组压扁
#   Sway 开头的空物体：平时轻轻摆动（手、尾巴、耳朵）
INK = "#14121a"


def half_ball(name, loc, scale, material, parent=None, keep="lower", subdiv=1, seg=24, rot=(0, 0, 0)):
    """半个椭球：keep="lower" 留下半（张开的 D 形嘴、碗），"upper" 留上半（帽子、圆顶）"""
    import bmesh
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=loc)
    o = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(o.data)
    cut = [v for v in bm.verts if (v.co.z > 0.001 if keep == "lower" else v.co.z < -0.001)]
    bmesh.ops.delete(bm, geom=cut, context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    o.scale = scale
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    return _finish(o, name, material, parent, subdiv)


def eye(name, loc, r, parent, look=(0.0, 0.0), white="#ffffff"):
    """大眼睛：白眼球（带描边）+ 黑眼珠 + 高光，挂在 Eye* 空物体下"""
    x, y, z = loc
    e = empty(name, loc, parent)
    ball(name + "W", (x, y, z), (r, r * 0.55, r * 1.15), mat("eye" + white, white), e)
    px, pz = x + look[0] * r * 0.35, z + look[1] * r * 0.35 - r * 0.08
    ball("d_" + name + "P", (px, y - r * 0.4, pz), (r * 0.55, r * 0.25, r * 0.68), mat("black", INK), e)
    ball("d_" + name + "H", (px - r * 0.18, y - r * 0.58, pz + r * 0.25), (r * 0.17, r * 0.06, r * 0.17), mat("white", "#ffffff"), e, subdiv=0)
    return e


def eyes(parent, cx, y, z, gap, r, look=(0.0, 0.0), white="#ffffff"):
    return [eye(f"Eye{i}", (cx + s * gap, y, z), r, parent, look, white) for i, s in enumerate((-1, 1))]


def brow(name, a, b, parent, r=0.045, color=INK):
    return tube(name, a, b, r, r * 0.8, mat("brow" + color, color), parent, verts=8)


def mouth(name, loc, w, h, parent, tongue=True, teeth=0, fangs=0, depth=None):
    """张开的大嘴（D 形，上平下圆），可带舌头、上排牙、小尖牙"""
    x, y, z = loc
    d = depth or w * 0.35
    half_ball(name, loc, (w, d, h), mat("mouth", "#5a1020"), parent)
    if tongue:
        ball("d_" + name + "Tongue", (x + w * 0.15, y - d * 0.55, z - h * 0.6), (w * 0.45, d * 0.4, h * 0.32), mat("tongue", "#ff6f86"), parent)
    for i in range(teeth):
        tx = x - w * 0.55 + (i + 0.5) * (w * 1.1 / teeth)
        block("d_" + name + f"Tooth{i}", (tx, y - d * 0.75, z - h * 0.1), (w * 0.9 / teeth, d * 0.2, h * 0.22), mat("white", "#ffffff"), parent, subdiv=1)
    for i, s in enumerate([(), (1,), (-1, 1)][min(fangs, 2)]):
        tube("d_" + name + f"Fang{i}", (x + s * w * 0.5, y - d * 0.8, z - 0.01), (x + s * w * 0.47, y - d * 0.85, z - h * 0.45), w * 0.1, 0.004, mat("white", "#ffffff"), parent, verts=8)


def smile(name, loc, r, parent, thick=0.035, color="#5a1020", frown=False):
    """闭嘴笑：一道往上弯的弧线；frown=True 往下撇"""
    import bmesh
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=thick, location=loc, rotation=(math.pi / 2, 0, 0), major_segments=36, minor_segments=8)
    o = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if (v.co.y < 0.02 * r / 0.13 if frown else v.co.y > -0.02 * r / 0.13)], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    return _finish(o, name, mat("mouth" + color, color), parent, 0)


def preview_sheet(rel, size=(700, 800), target=(0, 0, 1.4), dist=7.5, height=2.2, angle=-18, lens=50):
    """给怪物拍一张预览（浅色底、Freestyle 黑线，接近游戏里的样子）"""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = size
    world = bpy.data.worlds.new("w")
    world.color = (0.95, 0.93, 0.88)
    scene.world = world
    a = math.radians(angle)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    cam.location = (target[0] + math.sin(a) * dist, target[1] - math.cos(a) * dist, target[2] + height - 1.4)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    scene.camera = cam
    for loc, energy in (((-4, -5, 6), 900), ((5, -3, 3), 300), ((0, 5, 5), 400)):
        L = bpy.data.objects.new("L", bpy.data.lights.new("L", "AREA"))
        L.data.energy = energy
        L.data.size = 4
        L.location = loc
        L.rotation_euler = (Vector((0, 0, 1.4)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(L)
    scene.render.use_freestyle = True
    scene.render.line_thickness = 2.2
    out = ROOT / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)


def soft_box(name, loc, size, material, parent=None, bevel=0.25, rot=(0, 0, 0)):
    """圆角方块（枕头、吐司、礼物盒）：倒角 + 一级细分，正面还是平的，好贴五官"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    b = o.modifiers.new("bevel", "BEVEL")
    b.width = bevel * min(size)
    b.segments = 4
    return _finish(o, name, material, parent, 1)


def cyl(name, loc, r, h, material, parent=None, rot=(0, 0, 0), bevel=0.08, verts=32, r2=None):
    """圆柱（可做成上下不一样粗的桶），边缘倒圆"""
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r if r2 is None else r2, depth=h, location=loc, rotation=rot)
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(rotation=True)
    if bevel:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 3
        b.limit_method = "ANGLE"
    o = _finish(o, name, material, parent, 0)
    for p in o.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    return o


def noodle(name, pts, r0, r1, material, parent=None, res=6):
    """沿几个点弯过去的圆管（尾巴、触手、胡子、手臂），从 r0 渐细到 r1"""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 1.0
    cu.bevel_resolution = 4
    cu.resolution_u = res
    cu.use_fill_caps = True
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    n = len(pts)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
        sp.points[i].radius = r0 + (r1 - r0) * i / max(1, n - 1)
    sp.order_u = min(4, n)
    sp.use_endpoint_u = True
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.active_object
    return _finish(o, name, material, parent, 0)


def slab(name, pts2d, depth, loc, material, parent=None, rot=(math.pi / 2, 0, 0), bevel=0.02):
    """平面形状挤出厚度（星星、闪电、叶子）。pts2d 在 XY 平面，默认立起来面朝镜头"""
    import bmesh
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in pts2d]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += depth
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -depth / 2))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    if bevel:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 2
    bpy.context.view_layer.update()  # 先算出世界坐标，挂父物体时才不会跑回原点
    return _finish(o, name, material, parent, 0, smooth=False)


def star_pts(r, inner=0.45, n=5):
    return [((r if i % 2 == 0 else r * inner) * math.sin(i * math.pi / n), (r if i % 2 == 0 else r * inner) * math.cos(i * math.pi / n)) for i in range(n * 2)]
