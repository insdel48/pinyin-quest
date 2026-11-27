"""Paint complexion on the MPFB UV layout and generate close-up eye detail."""
from pathlib import Path

import bpy
import numpy as np

from bake import bleed, normal_from_height, rasterize
from common import TextureAtlas, bone_parent, value_noise
from makehuman_assets import ASSETS, SKIN, BROWN


def image_pixels(path, size):
    image=bpy.data.images.load(str(path),check_existing=True)
    width,height=image.size
    pixels=np.empty(width*height*4,dtype=np.float32)
    image.pixels.foreach_get(pixels)
    u=np.round(np.linspace(0,width-1,size)).astype(int)
    v=np.round(np.linspace(0,height-1,size)).astype(int)
    sampled=pixels.reshape(height,width,4)[v[:,None],u[None,:],:3]
    bpy.data.images.remove(image)
    return sampled


def apply_skin(obj, material, data: Path):
    size=1536
    vertices=np.array([tuple(v.co) for v in obj.data.vertices],dtype=np.float32)
    # Bake the individual character's face-space fields back to its original UV layout.
    fields,coverage=rasterize(obj.data,size,vertices)
    x,y,z=fields.transpose(2,0,1)
    ax=np.abs(x)
    front=np.clip((-.039-y)*24,0,1)
    rng=np.random.default_rng(271)
    speckle=(value_noise(rng,size,99)*.014+value_noise(rng,size,281)*.009
             +rng.normal(0,.005,(size,size)))
    def feature(cx,cy,cz,wx,wy,wz):
        return np.exp(-((ax-cx)/wx)**2-((y-cy)/wy)**2-((z-cz)/wz)**2)
    cheek=feature(.039,-.074,1.079,.022,.050,.027)*front
    nose=feature(.004,-.121,1.079,.020,.023,.017)
    eyebrow=feature(.030,-.090,1.125,.034,.049,.012)*front
    forehead=feature(.027,-.088,1.146,.040,.044,.038)*front
    ear=feature(.068,-.022,1.080,.020,.030,.027)
    jaw=feature(.043,-.050,1.036,.021,.036,.020)
    # Keep the photographic variation from the CC0 MakeHuman skin. Grade shadow
    # chroma in the albedo only; the render's direct lighting remains dynamic.
    skin=image_pixels(ASSETS/SKIN,size)
    luminance=skin @ np.array([.2126,.7152,.0722],dtype=np.float32)
    shadow=np.clip((.64-luminance)*2.0,0,.63)*front
    skin*=np.array([.924,.855,.769],dtype=np.float32)
    skin += (shadow[...,None]*np.array([.087,.020,.013])
             +cheek[...,None]*np.array([.055,-.031,-.023])
             +nose[...,None]*np.array([.042,-.024,-.020])
             +ear[...,None]*np.array([.050,-.045,-.035])
             +jaw[...,None]*np.array([.024,.010,.007])
             +speckle[...,None]*.43)
    for name,tone,strength in (
        ("eyelids",(.47,.285,.210),.13),("lips",(.575,.268,.219),.20),
        ("inside-mouth",(.13,.052,.041),.89),
    ):
        mask=image_pixels(data/"textures"/f"mpfb_{name}.jpg",size)[:,:,:1]*strength
        if name in ("lips","inside-mouth"):
            mask*=np.clip((z-1.020)*79,0,1)[...,None]
        skin=skin*(1-mask)+np.asarray(tone,dtype=np.float32)*mask
    rough=np.clip(.665-.156*nose-.115*forehead-.046*cheek+.34*speckle,.41,.75)
    ao=np.clip(1-.071*eyebrow-.043*jaw-.035*ear,.78,1)
    orm=np.stack((ao,rough,np.zeros_like(rough)),axis=-1)
    # Derive only subtle micro-relief. Broad brightness and lip pigment do not
    # become raised geometry.
    fine=luminance-(np.roll(luminance,2,0)+np.roll(luminance,-2,0)
                    +np.roll(luminance,2,1)+np.roll(luminance,-2,1))*.25
    bump=normal_from_height(speckle*.60+np.clip(fine,-.020,.020)*.44,2.2)
    sources=[]
    for label,pixels,color_space in (
        ("Complexion",skin,"sRGB"),("Skin roughness and occlusion",orm,"Non-Color"),
        ("Skin micro normal",bump,"Non-Color"),
    ):
        rgba=np.ones((size,size,4),dtype=np.float32)
        rgba[:,:,:3]=np.clip(pixels,0,1)
        bleed(rgba,coverage,9)
        sources.append(TextureAtlas.pack_image("Xiao Le "+label,rgba,color_space))
    nodes=material.node_tree.nodes
    for node,new_image in zip((n for n in nodes if n.type=="TEX_IMAGE"),sources):
        node.image=new_image
    shader=nodes.get("Principled BSDF")
    shader.inputs["Specular IOR Level"].default_value=.33
    shader.inputs["Subsurface Weight"].default_value=.145
    shader.inputs["Subsurface Radius"].default_value=(1,.46,.24)
    shader.inputs["Subsurface Scale"].default_value=.006
    shader.inputs["Sheen Weight"].default_value=.07
    shader.inputs["Sheen Roughness"].default_value=.73


def finish_eyes(obj,samples,rig,highlight):
    """Keep the fitted high-poly eyeballs and represent their optical shell with coat."""
    import bmesh
    from mathutils import Vector

    mesh=bmesh.new()
    mesh.from_mesh(obj.data)
    pending=set(mesh.verts)
    centers=[]
    while pending:
        component=set()
        stack=[pending.pop()]
        while stack:
            vertex=stack.pop()
            component.add(vertex)
            for edge in vertex.link_edges:
                neighbor=edge.other_vert(vertex)
                if neighbor in pending:
                    pending.remove(neighbor)
                    stack.append(neighbor)
        if len(component)==256:
            bmesh.ops.delete(mesh,geom=list(component),context="VERTS")
            continue
        if len(component)!=276:
            raise RuntimeError(f"Unexpected eye component topology: {len(component)} vertices")
        sign=1 if next(iter(component)).co.x>0 else -1
        helper=samples[f"helper-{'l' if sign>0 else 'r'}-eye"]
        origin=Vector(tuple((min(v[i] for v in helper)+max(v[i] for v in helper))*.5 for i in range(3)))
        low=min(v.co.y for v in component)
        # Seat the photographic iris within the native lid opening.
        shift=(origin.y-.0149)-low
        centers.append(origin)
        for vertex in component:
            vertex.co.y+=shift
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.materials.clear()
    material=bpy.data.materials.new("MakeHuman high-poly brown eyes")
    material.use_nodes=True
    nodes,links=material.node_tree.nodes,material.node_tree.links
    bsdf=nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value=.25
    bsdf.inputs["Coat Weight"].default_value=.38
    bsdf.inputs["Coat Roughness"].default_value=.13
    bsdf.inputs["Specular IOR Level"].default_value=.38
    pixels=image_pixels(ASSETS/BROWN,768)
    brightness=pixels @ np.array([.27,.63,.1],dtype=np.float32)
    iris_mask=np.clip((.43-brightness)*3.0,0,1)
    rgba=np.ones((768,768,4),dtype=np.float32)
    rgba[:,:,:3]=pixels*(1-iris_mask[...,None])+iris_mask[...,None]*(pixels*.96+np.array([.045,.048,.035]))
    tex=nodes.new("ShaderNodeTexImage")
    tex.image=TextureAtlas.pack_image("MakeHuman brown iris and sclera",rgba,"sRGB")
    links.new(tex.outputs["Color"],bsdf.inputs["Base Color"])
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index=0
        polygon.use_smooth=True
    from common import sphere
    for center in centers:
        x,z=center.x-.00155,center.z+.00198
        hit,point,_,_=obj.ray_cast((x,-.24,z),(0,1,0),distance=.193)
        if hit:
            highlight_mesh=sphere("Soft window eye catchlight",(x,point.y-.00032,z),
                                  (.00068,.00018,.00055),highlight,10,6)
            bone_parent(highlight_mesh,rig,"head")
    obj.name="MakeHuman high-poly eyeballs"
    bone_parent(obj,rig,"head")
