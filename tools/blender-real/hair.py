"""Sculpted scalp and crossed, alpha-tested strand cards for the child model."""
import math
import random

import bpy
import numpy as np
from mathutils import Vector

from common import TAU, TextureAtlas, bone_parent, merge, smooth_path, surface


def strand_material():
    rng=np.random.default_rng(8263)
    height,width=1024,512
    y,x=np.mgrid[0:1:complex(height),0:1:complex(width)].astype(np.float32)
    coverage=np.zeros(x.shape,dtype=np.float32)
    pigment=np.zeros(x.shape,dtype=np.float32)
    for strand_id in range(168):
        bundle=(strand_id%7+1)/8
        q=np.clip(bundle+rng.normal(0,.030),.09,.91)
        start=rng.uniform(-.16,.19)
        end=rng.uniform(.54,1.04)
        flow=(x-(.5+(q-.5)*(1-.45*y)+rng.uniform(-.082,.082)*y**1.65
                 +rng.uniform(-.025,.025)*np.sin(y*3.4+q*4)))
        line=np.exp(-np.square(flow/rng.uniform(.00085,.0026)))
        life=np.clip((y-start)*30,0,1)*np.clip((end-y)*18,0,1)
        strand=line*life
        coverage=1-(1-coverage)*(1-.92*strand)
        pigment=np.maximum(pigment,strand*rng.uniform(.11,.75))
    shape=np.clip(1-np.abs(x-.5)*2,0,1)
    root=np.clip((.31-y)*6,0,.80)*np.clip((shape-.26)*2.5,0,1)
    coverage=np.maximum(coverage,root)
    glaze=.019*np.exp(-np.square((y-.46+.084*np.sin(5*x))/.15))
    luminance=.014+.033*pigment+glaze*.87+.012*y+.007*shape
    rgb=np.stack((luminance*1.12,luminance*.83,luminance*.62,coverage),axis=-1).astype(np.float32)
    atlas=TextureAtlas.pack_image("Xiao Le strand coverage and pigment",rgb,"sRGB",alpha=True)
    material=bpy.data.materials.new("Hair cards")
    material.use_nodes=True
    nodes,links=material.node_tree.nodes,material.node_tree.links
    shader=nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value=.64
    shader.inputs["Specular IOR Level"].default_value=.28
    image=nodes.new("ShaderNodeTexImage")
    image.image=atlas
    image.extension="EXTEND"
    links.new(image.outputs["Color"],shader.inputs["Base Color"])
    cutoff=nodes.new("ShaderNodeMath")
    cutoff.operation="GREATER_THAN"
    cutoff.inputs[1].default_value=.38
    links.new(image.outputs["Alpha"],cutoff.inputs[0])
    links.new(cutoff.outputs[0],shader.inputs["Alpha"])
    return material


def strand_card(name,path,material,center,crossed=0):
    curve=smooth_path([(p,w,h) for p,w,h in path],4)
    rings=[]
    for i,(coord,w,h) in enumerate(curve):
        position=Vector(coord)
        tangent=(Vector(curve[min(i+1,len(curve)-1)][0])-Vector(curve[max(0,i-1)][0])).normalized()
        x,y,z=position-center
        outward=Vector((x/.079**2,y/.084**2,z/.092**2))
        outward=(outward-outward.dot(tangent)*tangent).normalized()
        cross=outward.cross(tangent).normalized()
        sideways=cross*math.cos(crossed)+outward*math.sin(crossed)
        rings.append([position+w*t*sideways + h*(1-t*t)*outward
                      for t in (-1,-.52,0,.52,1)])
    return surface(name,rings,material,closed=False,cap=False)


def haircut(rig,base):
    rng=random.Random(2402)
    mat=strand_material()
    center=Vector((0,-.030,1.114))
    def scalp(angle,phi,puff=0):
        return center+Vector(((.072+puff)*math.sin(phi)*math.sin(angle),
                              -(.080+puff)*math.sin(phi)*math.cos(angle),
                              (.090+puff)*math.cos(phi)))
    def hairline(angle):
        fringe=max(0,math.cos(angle))
        return 1.55-.24*fringe-.067*math.cos(2*angle)+.067*math.sin(3*angle-.36)
    rows=[]
    for r in range(17):
        rows.append([scalp(angle,.006+(hairline(angle)-.006-.25*max(0,math.cos(angle)))*r/16,.0010)
                     for angle in (TAU*j/54 for j in range(54))])
    bone_parent(surface("Root shadow beneath the strands",rows,base,cap=False),rig,"head")

    cards=[]
    for layer,count in enumerate((36,31,23)):
        for i in range(count):
            az=TAU*(i+layer*.37)/count+rng.uniform(-.051,.051)
            front=math.cos(az)
            if front>.49:
                continue
            endphi=hairline(az)+(.26 if layer==0 else .10 if layer==1 else -.04)
            endphi+=rng.uniform(-.099,.112)
            sweep=.27+.10*layer+.18*math.sin(az+layer)
            start=scalp(az+sweep,.26+.12*layer+rng.uniform(-.06,.07),.004+layer*.004)
            mid=scalp(az+sweep*.63,.59*endphi,.008+layer*.005)
            lower=scalp(az+.09,.88*endphi,.006+layer*.006)
            tip=scalp(az,endphi,.007+layer*.007)
            width=rng.uniform(.0091,.0141)*(1-.105*layer)
            chain=[(start,width*.67,.001),(mid,width,.0036),
                   (lower,width*.72,.0027),(tip,width*.37,.0004)]
            cards.append(strand_card("Crown and nape bundle",chain,mat,center))
            if layer==1 and i%3==0:
                cards.append(strand_card("Crossed crown bundle",chain,mat,center,.66))

    for layer,count in enumerate((28,24,16)):
        for i in range(count):
            t=(i+.4*layer)/(count-1)
            angle=-1.23+2.46*t+rng.uniform(-.041,.042)
            front=math.cos(angle)
            length=1.36+.145*math.sin(8.7*angle-.4*layer)+rng.uniform(-.11,.13)
            length-=.10*layer
            length+=.12*(1-front)
            swing=.51-.63*t + .18*math.cos(angle*2)
            root=scalp(angle+swing,.275+layer*.13,.0034+layer*.004)
            shoulder=scalp(angle+swing*.76,length*.58,.010+layer*.004)
            turn=scalp(angle+swing*.30,length*.83,.012+layer*.004)
            tip=scalp(angle,length,.010+layer*.003)
            tip.z+=rng.uniform(-.005,.005)
            width=rng.uniform(.0067,.0107)*(1-layer*.11)
            chain=[(root,width*.82,.001),(shoulder,width,.0028),
                   (turn,width*.73,.0023),(tip,width*.35,.0004)]
            cards.append(strand_card("Broken-edge fringe bundle",chain,mat,center))
    for i in range(15):
        angle=-1.55+3.80*i/14+rng.uniform(-.095,.095)
        root=scalp(angle+.26,.40,-.004)
        shoulder=scalp(angle+.16,.31,.008)
        mid=scalp(angle+.08,.39,.018)
        tip=scalp(angle,.60,.022)+Vector((rng.uniform(-.018,.016),rng.uniform(-.014,.012),.011))
        mid.z+=rng.uniform(.004,.009)
        cards.append(strand_card("Upturned wisps",[(root,.0039,.001),(shoulder,.004,.0013),
                                  (mid,.0037,.0015),(tip,.0020,.0003)],mat,center,.36 if i%2 else -.31))
    cap=merge("Cutout hair cards",cards)
    bone_parent(cap,rig,"head")
    return cap
