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
                              export_animations=False, export_materials="EXPORT")
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
