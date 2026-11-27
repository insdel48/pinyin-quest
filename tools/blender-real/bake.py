"""Rasterize mesh fields into texture space and pad the islands for filtering."""
import math

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def rasterize(mesh, size, fields):
    """Interpolate an array of per-vertex values over the active UV triangles."""
    mesh.calc_loop_triangles()
    coords = np.asarray([tuple(u.uv) for u in mesh.uv_layers.active.data],dtype=np.float32)
    pixels=np.zeros((size,size,fields.shape[1]),dtype=np.float32)
    occupied=np.zeros((size,size),dtype=bool)
    for triangle in mesh.loop_triangles:
        a,b,c=coords[list(triangle.loops)]*size-.5
        lo=np.maximum(0,np.floor(np.minimum(np.minimum(a,b),c)).astype(int))
        hi=np.minimum(size-1,np.ceil(np.maximum(np.maximum(a,b),c)).astype(int))
        if np.any(lo>hi):
            continue
        ab,ac=b-a,c-a
        det=ab[0]*ac[1]-ab[1]*ac[0]
        if abs(det)<1e-7:
            continue
        y,x=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1].astype(np.float32)
        x-=a[0]
        y-=a[1]
        u=(x*ac[1]-y*ac[0])/det
        v=(ab[0]*y-ab[1]*x)/det
        keep=(u>=-.001)&(v>=-.001)&(u+v<=1.001)
        if keep.any():
            values=fields[list(triangle.vertices)]
            patch=pixels[lo[1]:hi[1]+1,lo[0]:hi[0]+1]
            patch[keep]=values[0]+u[keep,None]*(values[1]-values[0])+v[keep,None]*(values[2]-values[0])
            occupied[lo[1]:hi[1]+1,lo[0]:hi[0]+1] |= keep
    return pixels,occupied


def bleed(pixels, occupied, passes):
    """Extend edge texels into a small UV gutter without wrapping the atlas."""
    coverage=occupied.copy()
    for _ in range(passes):
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            sy=slice(max(0,-dy),len(coverage)-max(0,dy))
            sx=slice(max(0,-dx),len(coverage)-max(0,dx))
            ty=slice(max(0,dy),len(coverage)-max(0,-dy))
            tx=slice(max(0,dx),len(coverage)-max(0,-dx))
            extend=coverage[sy,sx]&~coverage[ty,tx]
            pixels[ty,tx][extend]=pixels[sy,sx][extend]
            coverage[ty,tx][extend]=True
    return pixels


def recess_and_ao(mesh, radius):
    """Estimate signed curvature and nearby occlusion on the actual sculpt."""
    vertices=[v.co.copy() for v in mesh.vertices]
    normals=[v.normal.copy() for v in mesh.vertices]
    polygons=[tuple(p.vertices) for p in mesh.polygons]
    tree=BVHTree.FromPolygons(vertices,polygons)
    neighbors=[[] for _ in vertices]
    for edge in mesh.edges:
        a,b=edge.vertices
        neighbors[a].append(b)
        neighbors[b].append(a)
    fields=np.empty((len(vertices),2),dtype=np.float32)
    for i,(pos,normal) in enumerate(zip(vertices,normals)):
        links=neighbors[i]
        curvature=0.
        if len(links)>=3:
            for j in links:
                vec=vertices[j]-pos
                if vec.length>1e-6:
                    curvature+=vec.normalized().dot(normal)
            curvature/=len(links)
        tangent=normal.cross(Vector((0,0,1) if abs(normal.z)<.86 else (1,0,0))).normalized()
        bitangent=normal.cross(tangent)
        occlusion=0.
        for ray in range(8):
            angle=(ray+.377)*math.tau/8
            direction=normal*.54+(math.cos(angle)*tangent+math.sin(angle)*bitangent)*.842
            _,_,_,distance=tree.ray_cast(pos+normal*radius*.018,direction,radius)
            if distance is not None:
                occlusion += (1-distance/radius)*.125
        fields[i] = (curvature,occlusion)
    return fields


def normal_from_height(height, scale):
    dy,dx=np.gradient(height)
    normal=np.stack((-dx*scale,-dy*scale,np.ones_like(dx)),axis=-1)
    return .5 + .5*normal/np.linalg.norm(normal,axis=-1,keepdims=True)
