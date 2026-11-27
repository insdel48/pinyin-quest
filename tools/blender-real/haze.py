"""Thin, soft violet haze attached to the guardian's cast seams."""
import math

import bpy
import numpy as np
from mathutils import Vector

from common import TextureAtlas, bone_parent, merge, smooth_path, surface, value_noise


def haze_material():
    side=512
    t,u=np.mgrid[0:1:complex(side),-1:1:complex(side)].astype(np.float32)
    rng=np.random.default_rng(7924)
    coarse=value_noise(rng,side,12)
    fine=value_noise(rng,side,39)
    envelope=np.clip(np.sin(math.pi*t),0,1)**.85
    turn=.19*np.sin(t*math.tau*1.56)+.27*np.sin(t*math.pi*2.7+.6)
    cloud=np.exp(-((u-turn+.10*coarse)/(.26-.09*t+.094*coarse))**2)
    wisps=.45+.37*np.sin(23*t+u*8+2.4*coarse)+.16*fine
    alpha=np.clip(cloud*envelope*wisps*.78,0,.53)
    light=(.10+.16*np.exp(-((u-turn)/.19)**2))*(1-.68*t)
    rgba=np.stack((.092+.41*light,.043+.12*light,.131+.57*light,alpha),axis=-1).astype(np.float32)
    image=TextureAtlas.pack_image("Suanni translucent vapor",rgba,"sRGB",alpha=True)
    material=bpy.data.materials.new("Violet haze")
    material.use_nodes=True
    material.surface_render_method="BLENDED"
    nodes,links=material.node_tree.nodes,material.node_tree.links
    shader=nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value=1.
    shader.inputs["Emission Strength"].default_value=.42
    tex=nodes.new("ShaderNodeTexImage")
    tex.image=image
    tex.extension="CLIP"
    links.new(tex.outputs["Color"],shader.inputs["Base Color"])
    links.new(tex.outputs["Color"],shader.inputs["Emission Color"])
    links.new(tex.outputs["Alpha"],shader.inputs["Alpha"])
    return material


def place_haze(rig):
    material=haze_material()
    for side in (-1,1):
        # Cards grow out of the assembly gaps and fold back into the outline.
        for joint,start,guide,end,width in (
            ("Chest",(-.83,.56,1.28),(-.69,.68,1.38),(-.43,.685,1.55),.112),
            ("Neck",(-.90,.50,1.64),(-.77,.62,1.82),(-.43,.664,2.05),.132),
            ("Spine",(.30,.351,1.76),(.54,.434,1.94),(.87,.45,2.075),.106),
        ):
            points=[Vector((x,side*y,z)) for x,y,z in (start,guide,end)]
            ribbon=smooth_path(list(zip(points,(width*.43,width,width*.49),(.001,)*3)),6)
            cards=[]
            for tilt in (0,.86):
                rings=[]
                for i,(point,span,_) in enumerate(ribbon):
                    tangent=(Vector(ribbon[min(i+1,len(ribbon)-1)][0])-Vector(ribbon[max(0,i-1)][0])).normalized()
                    cross=Vector((0,side,0)).cross(tangent).normalized()
                    direction=cross*math.cos(tilt)+cross.cross(tangent)*math.sin(tilt)
                    rings.append([Vector(point)+direction*j*span for j in (-1,0,1)])
                cards.append(surface("Curled seam vapor",rings,material,closed=False,cap=False))
            bone_parent(merge("Low violet vapor",cards),rig,joint)
