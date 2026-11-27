"""Shared mesh, texture baking, rigging, export and studio helpers for game assets."""
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "art-work"
TAU = 2 * math.pi
FPS = 20


def new_asset(name):
    """Build in a new scene so an open Blender project remains intact."""
    scene = bpy.data.scenes.new(name + " Asset")
    bpy.context.window.scene = scene
    scene.render.fps = FPS
    scene.unit_settings.system = "METRIC"
    return empty(name, (0, 0, 0))


def empty(name, location):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.empty_display_size = 0.035
    return obj


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def recalculate(obj):
    import bmesh

    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.to_mesh(obj.data)
    mesh.free()


def mesh_object(name, points, faces, material, uvs=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(points, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(material)
    layer = data.uv_layers.new(name="UVMap")
    for poly in data.polygons:
        poly.use_smooth = True
        for loop in poly.loop_indices:
            layer.data[loop].uv = (
                uvs[loop] if uvs is not None
                else ((points[data.loops[loop].vertex_index][0] * 0.4) % 1,
                      (points[data.loops[loop].vertex_index][2] * 0.4) % 1)
            )
    recalculate(obj)
    return obj


def surface(name, rings, material, closed=True, cap=True):
    width = len(rings[0])
    points = [tuple(vertex) for ring in rings for vertex in ring]
    faces, uvs = [], []
    segments = width if closed else width - 1
    for row in range(len(rings) - 1):
        for col in range(segments):
            nxt = (col + 1) % width
            faces.append((row * width + col, row * width + nxt,
                          (row + 1) * width + nxt, (row + 1) * width + col))
            u, v = col / segments, row / (len(rings) - 1)
            u2, v2 = (col + 1) / segments, (row + 1) / (len(rings) - 1)
            uvs.extend(((u, v), (u2, v), (u2, v2), (u, v2)))
    if closed and cap:
        for row in (0, len(rings) - 1):
            faces.append(tuple(row * width + j for j in range(width)))
            uvs.extend((.5 + .49 * math.cos(j * TAU / width),
                        .5 + .49 * math.sin(j * TAU / width)) for j in range(width))
    return mesh_object(name, points, faces, material, uvs)


def sweep(name, path, material, sides=12, normal=(1, 0, 0), ripple=None, cap=True):
    """Loft elliptical sections through (center, width, depth) tuples."""
    rings = []
    for i, (center, width, depth) in enumerate(path):
        center = Vector(center)
        tangent = Vector(path[min(i+1, len(path)-1)][0]) - Vector(path[max(i-1, 0)][0])
        tangent.normalize()
        across = Vector(normal)
        across -= across.dot(tangent) * tangent
        if across.length < .05:
            across = tangent.cross(Vector((0, 1, 0)))
        across.normalize()
        forward = tangent.cross(across)
        ring = []
        for j in range(sides):
            angle = j * TAU / sides
            variation = 1 + (ripple(i, angle) if ripple else 0)
            ring.append(center + variation * (width * math.cos(angle) * across
                                               + depth * math.sin(angle) * forward))
        rings.append(ring)
    return surface(name, rings, material, cap=cap)


def smooth_path(path, subdivisions=3):
    values = [np.array((*center, a, b), dtype=float) for center, a, b in path]
    result = []
    for i in range(len(values)-1):
        a, b = values[max(0, i-1)], values[i]
        c, d = values[i+1], values[min(i+2, len(values)-1)]
        for step in range(subdivisions):
            t = step / subdivisions
            p = .5 * (2*b + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t)
            result.append((tuple(p[:3]), max(.00025, float(p[3])), max(.00025, float(p[4]))))
    return result + [path[-1]]


def cord(name, points, radius, material, sides=6, smooth=1):
    path = smooth_path([(tuple(p), radius, radius) for p in points], smooth)
    direction = Vector(points[-1]) - Vector(points[0])
    normal = (1, 0, 0) if abs(direction.normalized().x) < .8 else (0, 1, 0)
    return sweep(name, path, material, sides=sides, normal=normal)


def sphere(name, center, radii, material, segments=24, rings=12, rotation=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = radii
    if rotation is not None:
        obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(material)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def rounded(name, location, dimensions, radius, material, rotation=None, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = dimensions
    if rotation:
        obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new("Rounded edges", "BEVEL")
    bevel.width = radius
    bevel.segments = segments
    normals = obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    normals.keep_sharp = True
    obj.data.materials.append(material)
    return obj


def merge(name, objects):
    activate(objects[0])
    for obj in objects:
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return obj


def value_noise(rng, side, cells):
    """Tileable smooth value noise for non-directional corrosion and casting pits."""
    samples = rng.uniform(-1,1,(cells,cells))
    coordinate = np.arange(side)*cells/side
    i = coordinate.astype(int)
    fraction = coordinate-i
    blend = fraction*fraction*(3-2*fraction)
    j = (i+1)%cells
    low = samples[np.ix_(i,i)]*(1-blend)+samples[np.ix_(i,j)]*blend
    high = samples[np.ix_(j,i)]*(1-blend)+samples[np.ix_(j,j)]*blend
    return low*(1-blend[:,None])+high*blend[:,None]


class TextureAtlas:
    """Bake procedural surface fields to packed base, ORM and tangent-normal images."""

    def __init__(self, name, materials, size=1024, customize=None):
        self.name = name
        self.materials = materials
        self.columns = 4
        self.rows = math.ceil(len(materials) / self.columns)
        self.rects = {}
        self.instances = {}
        tile = size // max(self.columns,self.rows)
        maps = [np.ones((tile * self.rows, size, 4), dtype=np.float32) for _ in range(3)]
        for i, (label, color, rough, metal, kind, emission) in enumerate(materials):
            x, y = (i % self.columns) * tile, (i // self.columns) * tile
            pad = 5
            self.rects[label] = ((x+pad)/size, (y+pad)/(tile*self.rows),
                                 (tile-2*pad)/size, (tile-2*pad)/(tile*self.rows))
            base, orm, normal = self.bake_tile(tile, color, rough, metal, kind, i)
            if customize:
                customize(label, base, orm, normal)
            for dest, source in zip(maps, (base, orm, normal)):
                dest[y:y+tile, x:x+tile, :3] = source
        self.images = [self.pack_image(f"{name} {label}", pixels, color_space)
                       for label, pixels, color_space in zip(("Base color", "ORM", "Normal"), maps,
                                                             ("sRGB", "Non-Color", "Non-Color"))]
        for label, _, _, _, _, emission in materials:
            self.instances[label] = self.make_material(label, emission)

    @staticmethod
    def bake_tile(tile, color, rough, metal, kind, seed):
        rng = np.random.default_rng(812 + seed)
        y, x = np.mgrid[:tile, :tile].astype(np.float32) * (TAU / tile)
        broad = (np.sin(3*x+2*np.sin(y)) + np.cos(4*y-x) + np.sin(7*x+5*y))/3
        mottled = broad + .35 * np.cos(17*x+np.sin(13*y))*np.sin(11*y+4*x)
        grain = rng.normal(0, .11, size=x.shape)
        tint = np.array(color, dtype=np.float32)[None, None, :]
        factor = 1 + .14*broad + .20*grain
        height = grain * .08
        if kind == "cloth":
            warp=np.sin(74*x+.38*np.sin(61*y))
            weft=np.sin(87*y+.36*np.sin(71*x))
            weave=warp*weft
            distress=.45*value_noise(rng,tile,11)+.25*value_noise(rng,tile,52)
            factor+=.049*weave+.20*distress+.07*mottled
            height+=.15*weave+.16*distress+.08*broad
            rough=np.clip(rough+.087*distress,0,1)
        elif kind == "hair":
            strands = np.sin(51*x + .4*np.cos(3*y)) + .5*np.sin(97*x)
            factor += .17*strands + .1*np.sin(6*y+x)
            height += .09*strands
        elif kind == "bronze":
            weathering = .48*value_noise(rng,tile,7) + .29*value_noise(rng,tile,20)
            flecks = .24*value_noise(rng,tile,47) + .13*value_noise(rng,tile,111)
            oxidation = weathering + flecks + .35*grain
            patina = np.clip((oxidation+.12)*2.1, 0, .81)
            tint = tint*(1-patina[..., None]) + np.array([.135,.300,.268])*patina[..., None]
            factor += .23*weathering + .25*flecks + .21*grain
            height += .23*weathering + .53*flecks + .31*grain
            rough = np.clip(rough + .25*patina, 0, 1)
            metal = np.clip(metal - .19*patina, 0, 1)
        elif kind == "leather":
            factor += .18*mottled + .18*grain
            height += .15*mottled + .20*grain
        elif kind == "skin":
            factor = 1 + .028*broad + .075*grain
            height *= .24
        if kind == "glow":
            factor = 1 + .08*broad
            height *= 0
        rgb = np.clip(tint * factor[..., None], 0, 1)
        orm = np.stack((np.clip(.92 + .075*mottled, .72, 1),
                        np.clip(np.broadcast_to(rough, x.shape) + .04*grain, 0, 1),
                        np.broadcast_to(metal, x.shape)), axis=-1)
        dy, dx = np.gradient(height)
        normal = np.stack((-dx, -dy, np.ones_like(dx)), axis=-1)
        normal = .5 + .5 * normal / np.linalg.norm(normal, axis=-1, keepdims=True)
        return rgb, orm, normal

    @staticmethod
    def pack_image(name, pixels, color_space, alpha=False):
        height, width = pixels.shape[:2]
        image = bpy.data.images.new(name, width, height, alpha=alpha)
        image.colorspace_settings.name = color_space
        image.pixels.foreach_set(pixels.ravel())
        image.update()
        image.pack()
        return image

    def make_material(self, label, emission):
        material = bpy.data.materials.new(label)
        material.use_nodes = True
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = nodes.get("Principled BSDF")
        base, orm, normal = [nodes.new("ShaderNodeTexImage") for _ in self.images]
        for node, image in zip((base, orm, normal), self.images):
            node.image = image
        links.new(base.outputs["Color"], shader.inputs["Base Color"])
        channels = nodes.new("ShaderNodeSeparateColor")
        links.new(orm.outputs["Color"], channels.inputs["Color"])
        links.new(channels.outputs["Green"], shader.inputs["Roughness"])
        links.new(channels.outputs["Blue"], shader.inputs["Metallic"])
        occlusion = nodes.new("ShaderNodeGroup")
        name = "glTF Material Output"
        group = bpy.data.node_groups.get(name) or bpy.data.node_groups.new(name, "ShaderNodeTree")
        if not group.interface.items_tree:
            group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        occlusion.node_tree = group
        links.new(channels.outputs["Red"], occlusion.inputs["Occlusion"])
        bump = nodes.new("ShaderNodeNormalMap")
        links.new(normal.outputs["Color"], bump.inputs["Color"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
        if emission:
            links.new(base.outputs["Color"], shader.inputs["Emission Color"])
            shader.inputs["Emission Strength"].default_value = emission
        return material

    def uv(self, objects):
        for obj in objects:
            if obj.type != "MESH":
                continue
            layer = obj.data.uv_layers.active
            for polygon in obj.data.polygons:
                material = obj.data.materials[polygon.material_index]
                if material.name not in self.rects:
                    continue
                u, v, w, h = self.rects[material.name]
                for loop in polygon.loop_indices:
                    a, b = layer.data[loop].uv
                    layer.data[loop].uv = (u + w * min(1, max(0, a)),
                                           v + h * min(1, max(0, b)))

    def __getitem__(self, name):
        return self.instances[name]


def rig_object(name, root, bones):
    rig = bpy.data.objects.new(name, bpy.data.armatures.new(name))
    bpy.context.scene.collection.objects.link(rig)
    rig.parent = root
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    for label, head, tail, parent in bones:
        bone = rig.data.edit_bones.new(label)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def simplify(obj, ratio):
    activate(obj)
    modifier = obj.modifiers.new("Game polygon budget", "DECIMATE")
    modifier.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def bone_parent(obj, rig, name):
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = name
    bone = rig.pose.bones[name]
    pivot = rig.matrix_world @ bone.bone.matrix_local @ Matrix.Translation((0, bone.bone.length, 0))
    obj.matrix_parent_inverse = pivot.inverted()
    obj.matrix_basis = matrix


def skin(obj, rig, weights):
    """Assign weights from mesh-local vertices and keep its current world transform."""
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy()
    obj.parent = rig
    obj.matrix_world = matrix
    groups = {}
    for vertex in obj.data.vertices:
        for name, weight in weights(matrix @ vertex.co).items():
            if weight > 0.0001:
                if name not in groups:
                    groups[name] = obj.vertex_groups.new(name=name)
                groups[name].add([vertex.index], weight, "REPLACE")
    modifier = obj.modifiers.new("Skeleton", "ARMATURE")
    modifier.object = rig
    return obj


def world_turn(bone, axis, degrees):
    local_axis = bone.bone.matrix_local.to_3x3().inverted() @ Vector(axis)
    bone.rotation_mode = "QUATERNION"
    from mathutils import Quaternion
    bone.rotation_quaternion = Quaternion(local_axis, math.radians(degrees))


def clip(rig, name, seconds, poses):
    """Create a Blender action with a fixed span, then keep it in a muted NLA track."""
    scene = bpy.context.scene
    frame_end = round(seconds * FPS)
    animation = rig.animation_data_create()
    action = bpy.data.actions.new(name)
    animation.action = action
    bones = sorted({bone for pose in poses.values() for bone in pose})
    for frame, pose in sorted(poses.items()):
        for bone_name in bones:
            bone = rig.pose.bones[bone_name]
            axis, angle, offset = pose.get(bone_name, ((1, 0, 0), 0, (0, 0, 0)))
            world_turn(bone, axis, angle)
            bone.location = bone.bone.matrix_local.to_3x3().inverted() @ Vector(offset)
            bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=bone_name)
            bone.keyframe_insert(data_path="location", frame=frame, group=bone_name)
    action.use_frame_range = True
    action.frame_start, action.frame_end = 0, frame_end
    slot = animation.action_slot
    animation.action = None
    track = animation.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, action)
    strip.action_slot = slot
    track.mute = True
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    scene.frame_set(0)
    return action


def export(root, path, use_rest_pose=True, apply_modifiers=True):
    path.parent.mkdir(parents=True, exist_ok=True)
    activate(root)
    for obj in root.children_recursive:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, use_active_scene=True,
        export_yup=True, export_rest_position_armature=use_rest_pose,
        export_apply=apply_modifiers, export_image_format="WEBP", export_image_quality=91,
        export_animations=True, export_animation_mode="ACTIONS",
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=15, export_draco_normal_quantization=11,
        export_draco_texcoord_quantization=13,
    )
    if not path.is_file():
        raise RuntimeError(f"Export did not create {path}")


def studio(size, root, name, angles):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 768, 768
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world = bpy.data.worlds.new(name + " Studio World")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.28,.31,.37,1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .40
    if name=="hero":
        scene.render.film_transparent=True
        world_nodes,world_links=scene.world.node_tree.nodes,scene.world.node_tree.links
        camera_light=world_nodes.new("ShaderNodeBackground")
        camera_light.inputs["Color"].default_value=(.66,.63,.67,1)
        camera_light.inputs["Strength"].default_value=.85
        mix=world_nodes.new("ShaderNodeMixShader")
        path=world_nodes.new("ShaderNodeLightPath")
        world_links.new(path.outputs["Is Camera Ray"],mix.inputs[0])
        world_links.new(world_nodes["Background"].outputs[0],mix.inputs[1])
        world_links.new(camera_light.outputs[0],mix.inputs[2])
        world_links.new(mix.outputs[0],world_nodes["World Output"].inputs["Surface"])
    stage = bpy.data.collections.new("Preview Studio")
    scene.collection.children.link(stage)
    ground = bpy.data.objects.new("Studio Ground", bpy.data.meshes.new("Studio Ground"))
    ground.data.from_pydata([(-200,-200,-.005),(200,-200,-.005),(200,200,-.005),(-200,200,-.005)], [], [(0,1,2,3)])
    stage.objects.link(ground)
    mat = bpy.data.materials.new("Studio stone")
    mat.diffuse_color = (.085,.098,.12,1)
    ground.data.materials.append(mat)
    lights = (
        ("Window key", (4,-3,4.6), 695, (1,.91,.81), 3.65),
        ("Soft fill", (1,4,3), 245, (.79,.87,1), 4.5),
        ("Neutral rim", (-4,1,5), 380, (1,.87,.74), 3.8),
    ) if name=="hero" else (
        ("Warm key", (-4,-4,5), 870, (1,.74,.49), 2.5),
        ("Cool fill", (-2,3,3.3), 490, (.60,.76,1), 4),
        ("Sunset rim", (1,4,5), 970, (1,.66,.28), 2.0),
    )
    for light_name, location, energy, color, diameter in lights:
        light = bpy.data.lights.new(light_name, "AREA")
        light.energy = energy * size**2
        light.color = color
        light.shape = "DISK"
        light.size = diameter * size
        obj = bpy.data.objects.new(light_name, light)
        stage.objects.link(obj)
        obj.location = Vector(location) * size
        obj.rotation_euler = (Vector((0,0,size*.5))-obj.location).to_track_quat("-Z","Y").to_euler()
    for label, target, horizontal, elevation, scale in angles:
        camera = bpy.data.cameras.new(label)
        camera.type = "ORTHO"
        camera.ortho_scale = scale
        obj = bpy.data.objects.new(label, camera)
        stage.objects.link(obj)
        direction = Vector((math.sin(horizontal),-math.cos(horizontal),elevation))
        obj.location = Vector(target) + direction * size * 4
        obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()
        if scene.camera is None or label == "three-quarter":
            scene.camera = obj
    source = ART / "blend" / f"{name}.blend"
    source.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    return source
