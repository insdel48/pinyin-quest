"""Sculpt and bake cloth folds onto independent garment UV islands."""
import math

import bpy
import numpy as np

from common import TextureAtlas, activate


BAKE_MESHES=("Open drill jacket","Rolled sleeve","Rolled sleeve.001",
             "Dropped double-layer hood","Continuous cargo trousers")


def fold_relief(name,p):
    x,y,z=p
    if name.startswith("Rolled"):
        elbow=math.exp(-((z-.776)/.052)**2)
        cuff=math.exp(-((z-.711)/.031)**2)
        phase=z*247 + 30*y + 1.8*math.sin((x*34-y*18))
        return (.0033*elbow+.0027*cuff)*(math.sin(phase)+.25*math.sin(phase*2))
    if "trousers" in name:
        knee=math.exp(-((z-.325)/.074)**2)
        cuff=math.exp(-((z-.114)/.068)**2)
        phase=z*209+x*21+17*y+1.17*math.sin(x*46+y*22)
        return (.0042*knee+.0045*cuff)*(math.sin(phase)+.25*math.sin(phase*2+.55))
    phase=z*144+27*y+2.45*math.sin(x*38+y*12)
    return .0022*math.sin(phase)+.00083*math.sin(phase*2.62-.5)


def sculpt_copy(obj,collection):
    matrix=obj.matrix_world.copy()
    copy=obj.copy()
    copy.data=obj.data.copy()
    copy.name="High sculpt • "+obj.name
    collection.objects.link(copy)
    copy.parent=None
    copy.matrix_world=matrix
    copy.modifiers.clear()
    activate(copy)
    modifier=copy.modifiers.new("Dense fold sculpt","SUBSURF")
    modifier.subdivision_type="SIMPLE"
    modifier.levels=2
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    normals=[v.normal.copy() for v in copy.data.vertices]
    for v,n in zip(copy.data.vertices,normals):
        v.co+=fold_relief(obj.name,matrix@v.co)*n
    copy.data.update()
    return copy


def pack_uv(obj,index):
    original=obj.data.uv_layers.active.name
    layer=obj.data.uv_layers.new(name="FoldUV")
    obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1
    if index is None:
        for item in layer.data:
            item.uv=(.83,.78)
    else:
        activate(obj)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(68),island_margin=.023)
        bpy.ops.object.mode_set(mode="OBJECT")
        for item in obj.data.uv_layers["FoldUV"].data:
            u,v=item.uv
            item.uv=((index%3+.035+.93*u)/3,(index//3+.035+.93*v)/2)
    return original


def bake_clothes(root):
    collection=bpy.data.collections.new("High-poly cloth sculpt sources")
    scene=bpy.context.scene
    scene.collection.children.link(collection)
    scene.render.engine="CYCLES"
    scene.cycles.samples=2
    atlas=np.empty((1024,1024,4),dtype=np.float32)
    atlas[:]=(.5,.5,1,1)
    image=TextureAtlas.pack_image("Xiao Le high-to-low cloth folds",atlas,"Non-Color")
    bake_targets=[]
    switched={}
    for i,name in enumerate(BAKE_MESHES):
        obj=bpy.data.objects[name]
        bpy.context.view_layer.update()
        switched[obj]=pack_uv(obj,i)
        bake_targets.append((obj,sculpt_copy(obj,collection)))
    for obj in root.children_recursive:
        if obj.type!="MESH" or obj in switched:
            continue
        if any(m and m.name in ("jacket","Olive twill") for m in obj.data.materials):
            switched[obj]=pack_uv(obj,None)

    for material in (bpy.data.materials["jacket"],bpy.data.materials["Olive twill"]):
        nodes=material.node_tree.nodes
        links=material.node_tree.links
        original=nodes.new("ShaderNodeUVMap")
        original.uv_map="UVMap"
        fold=nodes.new("ShaderNodeUVMap")
        fold.uv_map="FoldUV"
        normal=next(n for n in nodes if n.type=="NORMAL_MAP")
        normal.uv_map="FoldUV"
        tex=normal.inputs["Color"].links[0].from_node
        tex.image=image
        for node in nodes:
            if node.type=="TEX_IMAGE":
                links.new((fold if node==tex else original).outputs["UV"],node.inputs["Vector"])
        nodes.active=tex
        tex.select=True
    for low,high in bake_targets:
        activate(low)
        high.select_set(True)
        bpy.ops.object.bake(type="NORMAL",use_selected_to_active=True,use_clear=False,
                            cage_extrusion=.008,max_ray_distance=.018,margin=5)
        high.hide_render=True
        high.hide_set(True)
    # Add fine yarn to the normal bake without losing the sculpted fold signal.
    image.pixels.foreach_get(atlas.ravel())
    y,x=np.mgrid[:1024,:1024].astype(np.float32)
    used=(x<682)|(y<512)
    atlas[:,:,0]+=np.sin(x*2.1)*np.sin(y*2.2)*.012*used
    atlas[:,:,1]+=np.cos(x*1.9)*np.cos(y*2.35)*.012*used
    image.pixels.foreach_set(np.clip(atlas,0,1).ravel())
    image.update()
    image.pack()
    collection.hide_render=True
    collection.hide_viewport=True
    for obj,original in switched.items():
        obj.data.uv_layers.active=obj.data.uv_layers[original]
