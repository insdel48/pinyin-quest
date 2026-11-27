"""Bake the Suanni sculpt's curvature, AO, patina and engraved normal detail."""
import math

import bpy
import numpy as np

from bake import bleed, normal_from_height, rasterize, recess_and_ao
from common import TextureAtlas, activate, value_noise


def unwrap(obj):
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(64),island_margin=.023)
    bpy.ops.object.mode_set(mode="OBJECT")


def line_distance(x,y,points):
    nearest=np.full(x.shape,10,dtype=np.float32)
    for (ax,ay),(bx,by) in zip(points,points[1:]):
        dx,dy=bx-ax,by-ay
        t=np.clip(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1)
        nearest=np.minimum(nearest,np.hypot(x-ax-dx*t,y-ay-dy*t))
    return nearest


def engravings(x,y,z,nx,ny,nz):
    """Cloud and thunder geometry expressed in model space to cross UV seams."""
    side=np.clip((abs(ny)-.24)*2.8,0,1)
    vertical=np.clip((abs(nz)-.31)*3.4,0,1)
    front=np.clip((-nx-.2)*3,0,1)
    # Repeat stepped square spirals around torso and along the fronts of the legs.
    u=np.mod((x+np.sign(y)*.15*y)/.29,1)
    v=np.mod((z+.12*np.sign(y)*y)/.29,1)
    swirl=[(.08,.17),(.08,.87),(.90,.87),(.90,.14),(.24,.14),(.24,.69),
           (.72,.69),(.72,.33),(.42,.33),(.42,.52),(.57,.52)]
    cloud=line_distance(u,v,swirl)
    top=line_distance(np.mod(x/.33,1),np.mod(y/.31,1),swirl)
    chestline=[(.08,.51),(.16,.73),(.32,.81),(.45,.67),(.50,.48),(.65,.28),
               (.82,.32),(.88,.47),(.72,.51),(.69,.40)]
    chest=line_distance(np.mod((y+.20)/.30,1),np.mod(z/.34,1),chestline)
    def groove(distance):
        return np.exp(-np.square(distance/.023))
    def rim(distance):
        return np.exp(-np.square((distance-.042)/.019))
    recess=np.maximum(np.maximum(side*groove(cloud),vertical*groove(top)),front*groove(chest))
    crest=np.maximum(np.maximum(side*rim(cloud),vertical*rim(top)),front*rim(chest))
    wear_mask=np.clip(.57+.38*np.cos(x*7.1+z*6)+.35*np.sin(y*10-z*4),.10,1)
    # Repeated borders stay stronger on the broad chest and spine; feet wear them away.
    foot=np.clip((z-.13)*4.6,0,1)
    relief_zone=wear_mask*foot
    return recess*relief_zone,crest*relief_zone


def bake_piece(obj,side,style,seed):
    unwrap(obj)
    mesh=obj.data
    positions=np.array([tuple(obj.matrix_world@v.co) for v in mesh.vertices],dtype=np.float32)
    normals=np.array([tuple(obj.matrix_world.to_3x3()@v.normal) for v in mesh.vertices],dtype=np.float32)
    features=np.concatenate((positions,normals,recess_and_ao(mesh,.17 if style=="body" else .12)),axis=1)
    maps,mask=rasterize(mesh,side,features)
    x,y,z,nx,ny,nz,curvature,occlusion=maps.transpose(2,0,1)
    rng=np.random.default_rng(seed)
    coarse=value_noise(rng,side,24)
    fleck=.6*value_noise(rng,side,83)+.4*value_noise(rng,side,193)
    chips=value_noise(rng,side,279)
    relief,edge=engravings(x,y,z,nx,ny,nz)
    if style=="mane":
        relief*=.10
        edge*=.12
    if style=="head":
        cheek=np.clip((abs(y)-.15)*3.2,0,1)*np.clip((x+1.65)*4.0,0,1)
        relief*=cheek*.70
        edge*=cheek*.72
    convex=np.clip((-.012-curvature)*7.8,0,1)
    recess=np.clip((curvature+.004)*6.0+occlusion*1.65+relief*.63,0,1)
    pits=np.clip((fleck-.13)*1.18+.065*chips,0,.25)
    patina=np.clip((recess-.21)*1.39+.15*fleck+.07*coarse+pits,0,.89)*(1-convex*.89)
    wear=np.clip((convex-.20)*.76+edge*.20+np.maximum(0,nz)*.044,0,.69)*(1-patina)
    dark=np.array([.237,.219,.204]) if style!="mane" else np.array([.232,.185,.142])
    polished=np.array([.434,.362,.283]) if style!="mane" else np.array([.524,.383,.248])
    oxidized=np.array([.240,.334,.288])
    rgb=dark+wear[...,None]*(polished-dark)+patina[...,None]*(oxidized-dark)
    rgb*=1+(.10*coarse+.17*fleck+.064*chips)[...,None]
    rgb-=pits[...,None]*np.array([.065,.058,.050])
    ao=np.clip(1-.61*occlusion-.16*relief,.43,1)
    if style=="mane":
        rough=np.clip(.61+.21*patina-.22*wear+.10*fleck,.43,.84)
        metal=np.clip(.58-.27*patina+.20*wear,.31,.75)
    else:
        rough=np.clip(.67+.10*patina-.10*wear+.076*fleck,.60,.75)
        metal=np.clip(.52-.17*patina+.11*wear,.40,.60)
    height=.16*fleck+.053*chips+.14*edge-.128*relief
    normal=normal_from_height(height,3.2)
    return [bleed(np.clip(layer,0,1).astype(np.float32),mask,9)
            for layer in (rgb,np.stack((ao,rough,metal),axis=-1),normal)]


def bake_castings(objects,material):
    """Pack the body, head and both flame mantles into three shared images."""
    size=2048
    textures=[np.ones((size,size,4),dtype=np.float32) for _ in range(3)]
    tiles=((0,0,1024,"body"),(1024,0,1024,"head"),
           (0,1024,768,"mane"),(768,1024,768,"mane"),
           (1536,1024,512,"mane"),(1536,1536,512,"mane"))
    bpy.context.view_layer.update()
    for i,(obj,(x,y,span,style)) in enumerate(zip(objects,tiles)):
        maps=bake_piece(obj,span,style,733+i)
        for texture,image in zip(textures,maps):
            texture[y:y+span,x:x+span,:3]=image
        for loop in obj.data.uv_layers.active.data:
            u,v=loop.uv
            loop.uv=((x+3+(span-6)*u)/size,(y+3+(span-6)*v)/size)
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for poly in obj.data.polygons:
            poly.material_index=0
    img_nodes=[n for n in material.node_tree.nodes if n.type=="TEX_IMAGE"]
    for node,img,label,space in zip(img_nodes,textures,("patina and wear","cavity ORM","cast engravings normal"),
                                    ("sRGB","Non-Color","Non-Color")):
        node.image=TextureAtlas.pack_image("Suanni "+label,img,space)
