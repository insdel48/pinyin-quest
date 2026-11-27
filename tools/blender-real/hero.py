"""Build Xiao Le on the MPFB game-engine rig; run from Blender 5.2 with MPFB 2.0.18."""
import math
from pathlib import Path
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import addon_utils
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

from common import (ROOT, TAU, TextureAtlas, activate, bone_parent, clip, cord, empty,
                    export, merge, mesh_object, new_asset, rounded, simplify, skin, smooth_path, sphere,
                    studio, surface, sweep)
from cloth_finish import bake_clothes
from hair import haircut
from skin_finish import apply_skin, finish_eyes
from makehuman_assets import ASSETS, EYES, TEETH


def fit_child_hands(body,rig):
    wrists={}
    for side in "lr":
        hand=rig.data.bones[f"hand_{side}"]
        forearm=rig.data.bones[f"lowerarm_{side}"]
        wrist=hand.head_local.copy()
        along=(wrist-forearm.head_local).normalized().lerp(
            (hand.tail_local-wrist).normalized(),.67).normalized()
        wrists[side]=(wrist,along)
    for vertex in body.data.vertices:
        co=vertex.co
        if abs(co.x)<.20 or co.z>.87:
            continue
        wrist,along=wrists["l" if co.x>0 else "r"]
        forward=(co-wrist).dot(along)
        influence=min(1,max(0,(forward+.003)/.025))
        scale=1-.21*influence*influence*(3-2*influence)
        co[:]=wrist+(co-wrist)*scale
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    for side,(wrist,_) in wrists.items():
        hand=rig.data.edit_bones[f"hand_{side}"]
        bones=[hand,*hand.children_recursive]
        transforms=[(bone,wrist+(bone.head-wrist)*.79,wrist+(bone.tail-wrist)*.79)
                    for bone in bones]
        for bone,head,tail in transforms:
            bone.head,bone.tail=head,tail
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.update_tag(refresh={"DATA"})
    bpy.context.scene.frame_set(0)


def child_head_shape(body,rig):
    """Enlarge the cranium towards a child's proportions, keeping the scalp height."""
    def adjust(v):
        if v.z<.970:
            return v
        t=min(1,(v.z-.970)/.048)
        w=t*t*(3-2*t)
        return Vector((v.x*(1+.056*w),-.034+(v.y+.034)*(1+.033*w),
                       v.z+(v.z-1.218)*.055*w))

    bpy.context.view_layer.update()
    for obj in [body,*[o for o in rig.children if o.parent_type=="BONE" and o.parent_bone=="head"]]:
        if obj.type!="MESH":
            continue
        matrix=obj.matrix_world.copy()
        inverse=matrix.inverted()
        keyset=obj.data.shape_keys
        if keyset:
            for key in keyset.key_blocks:
                for vertex in key.data:
                    vertex.co=inverse@adjust(matrix@vertex.co)
            for vertex,base in zip(obj.data.vertices,keyset.key_blocks[0].data):
                vertex.co=base.co
        else:
            for vertex in obj.data.vertices:
                vertex.co=inverse@adjust(matrix@vertex.co)
        obj.data.update()


def make_human():
    module = "bl_ext.user_default.mpfb"
    if not addon_utils.check(module)[1] and not addon_utils.enable(module, default_set=True):
        raise RuntimeError("Install MPFB in the Blender user extensions repository.")
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    from bl_ext.user_default.mpfb.services.locationservice import LocationService
    from bl_ext.user_default.mpfb.services.targetservice import TargetService

    settings = TargetService.get_default_macro_info_dict()
    settings.update(gender=.025, age=.147, muscle=.34, weight=.48,
                    race={"asian": 1.0, "caucasian": 0.0, "african": 0.0})
    source = HumanService.create_human(mask_helpers=False, macro_detail_dict=settings)
    data = Path(LocationService.get_mpfb_data())
    targets=data/"targets"
    def target(group,name,weight):
        return TargetService.load_target(source,str(targets/group/(name+".target.gz")),weight=weight)
    expression=[
        target("expression/units/asian","mouth-corner-puller",.67),
        target("expression/units/asian","mouth-open",.091),
        target("expression/units/asian","mouth-upward-retraction",.045),
    ]
    target("forehead","forehead-scale-vert-incr",.30)
    target("chin","chin-height-decr",.37)
    target("chin","chin-width-decr",.19)
    for side in "lr":
        target("cheek",side+"-cheek-volume-incr",.63)
        target("cheek",side+"-cheek-inner-incr",.23)
        expression.append(target("cheek",side+"-cheek-trans-up",.39))
        target("eyes",side+"-eye-scale-incr",.35)
        target("eyes",side+"-eye-height1-incr",.15)
        target("eyes",side+"-eye-corner1-up",.13)
        target("expression/units/asian","eye-"+("left" if side=="l" else "right")+"-opened-up",.05)
    keys=source.data.shape_keys.key_blocks
    neutral=keys[0]
    smile_delta=[sum(((k.data[i].co-neutral.data[i].co)*k.value for k in expression),
                     Vector((0,0,0)))*1.067 for i in range(len(neutral.data))]
    closed=[TargetService.load_target(source,str(targets/"expression"/"units"/"asian"/f"eye-{side}-closure.target.gz"))
            for side in ("left","right")]
    delta=[sum((key.data[i].co-neutral.data[i].co for key in closed),Vector((0,0,0)))*1.067
           for i in range(len(neutral.data))]
    eyes=HumanService.add_mhclo_asset(str(ASSETS/EYES),source,asset_type="Eyes",
                                     subdiv_levels=0,set_up_rigging=False)
    teeth=HumanService.add_mhclo_asset(str(ASSETS/TEETH),source,asset_type="Teeth",
                                      subdiv_levels=0,set_up_rigging=False)
    rig = HumanService.add_builtin_rig(source, "game_engine")
    rig.name = "Xiao Le Skeleton"
    activate(source)
    bpy.context.view_layer.update()
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    transform = Matrix.Translation((0,0,.014)) @ Matrix.Scale(1.067, 4)
    for part in (eyes,teeth):
        part.parent=None
        part.data.transform(transform)
    source.data.transform(transform)
    rig.data.transform(transform)
    rig.update_tag(refresh={"DATA"})
    bpy.context.scene.frame_set(0)
    fit_child_hands(source,rig)
    groups = {group.name: group.index for group in source.vertex_groups}
    group_ids = [{g.group for g in v.groups} for v in source.data.vertices]

    eye_samples = {}
    for side in "lr":
        for group in (f"helper-{side}-eye", f"helper-{side}-eyelashes-1"):
            eye_samples[group] = [v.co.copy() for v in source.data.vertices
                                  if groups[group] in group_ids[v.index]]
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(source.data)
    bm.verts.ensure_lookup_table()
    hidden = []
    for vertex in bm.verts:
        x, y, z = vertex.co
        neck=z>.957
        forearm=rig.data.bones["lowerarm_l" if x>0 else "lowerarm_r"]
        along=(vertex.co-forearm.head_local).dot((forearm.tail_local-forearm.head_local).normalized())
        visible=neck or (abs(x)>.219 and z>.57 and along>forearm.length*.44)
        if groups["body"] not in group_ids[vertex.index] or not visible:
            hidden.append(vertex)
    bmesh.ops.delete(bm, geom=hidden, context="VERTS")
    for vertex in bm.verts:
        x,y,z = vertex.co
        if .95 < z < 1.031:
            t=min(1,max(0,(z-.982)/.049))
            width=.032+.095*t*t*(3-2*t)
            radial = math.hypot(x,(y+.013)*.98)
            if radial > width:
                fraction = width/radial
                vertex.co.x *= fraction
                vertex.co.y = -.013+(y+.013)*fraction
    # The right-side MPFB closure has the cleanest upper lid contour on this phenotype.
    # Mirror that contour to keep the two eyes synchronized after mesh simplification.
    samples=[]
    smile_samples=[]
    for vertex in bm.verts:
        p=vertex.co
        if -.051<p.x<-.008 and 1.075<p.z<1.125 and p.y<-.071 and delta[vertex.index].length>1e-7:
            shift=delta[vertex.index]
            samples.extend(((p.copy(),shift),(Vector((-p.x,p.y,p.z)),Vector((-shift.x,shift.y,shift.z)))))
        if 1.022<p.z<1.108 and p.y<-.056 and smile_delta[vertex.index].length>1e-7:
            smile_samples.append((p.copy(),smile_delta[vertex.index]))
    bm.to_mesh(source.data)
    bm.free()
    source.name = "Face, neck and hands"
    for poly in source.data.polygons:
        poly.use_smooth = True
    simplify(source, .66)
    tree=KDTree(len(samples))
    for i,(point,_) in enumerate(samples):
        tree.insert(point,i)
    tree.balance()
    basis=source.shape_key_add(name="Basis",from_mix=False)
    smile=source.shape_key_add(name="Smile",from_mix=False)
    blink=source.shape_key_add(name="Blink",from_mix=False)
    smile.value=1.0
    blink.relative_key=basis
    blink.value=0.0
    source.active_shape_key_index=0
    source.show_only_shape_key=False
    for vertex,closed_vertex in zip(source.data.vertices,blink.data):
        if not 1.083 < vertex.co.z < 1.13 or vertex.co.y>-.071:
            continue
        nearest=tree.find_n(vertex.co,4)
        shift,weight=Vector((0,0,0)),0.
        for _,i,distance in nearest:
            factor=max(0,1-distance/.0046)**2
            shift+=samples[i][1]*factor
            weight+=factor
        if weight>.001:
            shift=shift/max(.60,weight)*1.17
            shift.y-=max(0,-shift.z)*.060
            closed_vertex.co=vertex.co+shift
    smile_tree=KDTree(len(smile_samples))
    for i,(p,_) in enumerate(smile_samples):
        smile_tree.insert(p,i)
    smile_tree.balance()
    for key_vertex,closed_vertex in zip(basis.data,blink.data):
        co=key_vertex.co.copy()
        if not 1.022<co.z<1.108 or co.y>-.056:
            continue
        shift,weight=Vector((0,0,0)),0.
        for _,i,distance in smile_tree.find_n(co,3):
            factor=max(0,1-distance/.0042)**2
            shift+=smile_samples[i][1]*factor
            weight+=factor
        if weight>.001:
            neutral_offset=shift/max(.66,weight)
            key_vertex.co=co-neutral_offset
            closed_vertex.co-=neutral_offset
    source.data.update()
    bpy.context.view_layer.update()
    return source, rig, eye_samples, data, eyes, teeth


def palette():
    return TextureAtlas("Xiao Le", [
        ("Skin", (.77,.52,.372), .44, .0, "skin", 0),
        ("jacket", (.162,.141,.123), .88, .0, "cloth", 0),
        ("Oatmeal jersey", (.52,.471,.366), .9, 0, "cloth", 0),
        ("Olive twill", (.249,.243,.171), .85, 0, "cloth", 0),
        ("Boot leather", (.30,.214,.138), .65, 0, "leather", 0),
        ("Rubber", (.115,.102,.086), .87, 0, "leather", 0),
        ("Weathered canvas", (.40,.332,.219), .87, 0, "cloth", 0),
        ("Brass stitching", (.52,.39,.22), .59, .56, "leather", 0),
        ("Hair", (.037,.025,.018), .77, .0, "hair", 0),
        ("Lid edge", (.535,.333,.258), .58, .0, "skin", 0),
        ("Boot mesh", (.17,.158,.135), .86, .0, "cloth", 0),
        ("Edge wear", (.29,.246,.195), .82, .0, "cloth", 0),
        ("Shoulder embroidery", (.402,.311,.206), .89, 0, "cloth", 0),
        ("Eye catchlight", (.85,.81,.73), .14, 0, "skin", .22),
        ("Tooth ivory",(.79,.727,.608),.39,0,"skin",.135),
        ("Ancient bronze", (.52,.33,.148), .44, .80, "bronze", 0),
        ("glow", (1,.54,.08), .42, .16, "glow", 2.8),
        ("Dark piping", (.138,.112,.090), .79, .0, "cloth", 0),
    ], size=2048)


def split_weights(vertex, start, stop, a, b):
    t = min(1, max(0, (vertex.z-start)/(stop-start)))
    return {a: 1-t, b: t}


def garments(rig, a):
    def chest_weights(v):
        return split_weights(v, .67, .83, "spine_01", "spine_03")

    levels = [
        (.628,.116,.068,.004), (.644,.128,.073,.006), (.667,.124,.075,.008),
        (.70,.120,.075,.010), (.75,.127,.080,.012), (.81,.136,.079,.014),
        (.868,.139,.069,.015), (.914,.126,.061,.014), (.945,.092,.054,.007),
        (.977,.053,.053,-.004), (.990,.047,.047,-.008),
    ]

    def torso_shape(name, material, gap, size):
        rings = []
        for i, (z,w,d,y) in enumerate(levels):
            ring = []
            for j in range(33 if gap else 32):
                opening = gap*(1+1.1*max(0,z-.906)/.084)
                t = opening+(TAU-2*opening)*j/32
                chest_fold=(.06*math.sin(9*t+i*.54)+.040*math.sin(16*t-i*.86))*max(0,1-abs(z-.775)/.15)
                fold=1+.029*math.sin(13*t+i*.8)+.045*math.sin(7*t-i*.72)+chest_fold
                neckline=-.020*max(0,z-.914)/.076*max(0,math.cos(t)) if not gap else 0
                tuck=-.015*max(0,.665-z)/.037 if gap else 0
                depth=d*(.82 if not gap and z<.647 else 1)
                ring.append((w*size*math.sin(t)*fold,y-depth*size*math.cos(t)*fold,
                             z+neckline+tuck+.004*math.sin(3*t)+.006*math.cos(t+i*.25)))
            rings.append(ring)
        return skin(surface(name, rings, a[material], closed=not gap, cap=False),rig,chest_weights), rings

    torso_shape("Oatmeal T-shirt", "Oatmeal jersey", 0, .90)
    _, jacket = torso_shape("Open drill jacket", "jacket", .235, 1)
    for edge in (0,-1):
        points = [row[edge] for row in jacket]
        skin(cord("Zipper tape", points,.004,a["Dark piping"],6,3),rig,chest_weights)
        skin(cord("Brass zipper coil", [(x,y-.003,z) for x,y,z in points],.0018,
                  a["Brass stitching"],5,3),rig,chest_weights)
        slider = rounded("Zipper pull", (points[1][0],points[1][1]-.006,points[1][2]+.008),
                         (.008,.004,.018),.0016,a["Brass stitching"])
        bone_parent(slider,rig,"spine_01")
    for edge in (1,-2):
        points = [row[edge] for row in jacket]
        skin(cord("Double-jacket topstitch",[(x*1.008,y-.002,z) for x,y,z in points],
                  .0008,a["Edge wear"],5,3),rig,chest_weights)
    for sign in (-1,1):
        pocket = [(sign*.064,-.062,.685),(sign*.075,-.065,.709),(sign*.090,-.063,.735)]
        skin(cord("Welt hand pocket", pocket,.0055,a["Dark piping"],7,3),rig,chest_weights)
        skin(cord("Pocket edge", [(x+sign*.003,y-.002,z) for x,y,z in pocket],
                  .0013,a["Weathered canvas"],5,3),rig,chest_weights)

        flap=rounded("Jacket welt pocket flap",(sign*.081,-.063,.715),(.015,.013,.071),
                     .004,a["jacket"],(0,sign*.51,sign*.19))
        bone_parent(flap,rig,"spine_02")
    # The hood is down, with a folded lip and an open center below the back of the neck.
    hood = []
    for i in range(9):
        t = i/8
        hood.append([(.104*(1-.23*t)*math.sin(angle),
                      .021+(.091+.033*math.sin(math.pi*t))*math.cos(angle)+.008*t,
                      .946-(.044+.091*math.cos(angle))*t+.013*math.cos(angle))
                     for angle in np.linspace(-1.55,1.55,23)])
    bone_parent(surface("Dropped double-layer hood",hood,a["jacket"],closed=False),rig,"spine_03")
    bone_parent(cord("Raised hood binding",hood[0],.005,a["Dark piping"]),rig,"spine_03")
    bone_parent(cord("Hood rim topstitch",[(x,y+.004,z-.007) for x,y,z in hood[0]],
                          .0011,a["Edge wear"],5,2),rig,"spine_03")

    trousers=[]
    def pants_weights(v):
        side="l" if v.x>=0 else "r"
        if v.z>.564:
            return split_weights(v,.564,.634,f"thigh_{side}","pelvis")
        return split_weights(v,.283,.362,f"calf_{side}",f"thigh_{side}")

    bone = rig.data.bones
    for side, sign in (("l",1),("r",-1)):
        upper, lower = f"upperarm_{side}",f"lowerarm_{side}"
        shoulder,elbow,wrist = (bone[n].head_local.copy() for n in (upper,lower,f"hand_{side}"))
        centerline = [(shoulder.lerp(elbow,t),w,d) for t,w,d in (
            (-.23,.028,.030),(-.05,.041,.039),(.22,.046,.041),(.47,.046,.041),
            (.70,.042,.036),(.86,.043,.035),(1,.040,.035))]
        centerline += [(elbow.lerp(wrist,t),w,d) for t,w,d in (
            (.13,.041,.037),(.24,.037,.033),(.35,.040,.033),(.43,.033,.029),
            (.48,.035,.029),(.54,.032,.027))]
        def sleeve_weights(v):
            tip = max(0, min(1, .5 + (v-elbow).dot((wrist-shoulder).normalized())/.075))
            fixed = max(0,min(.60, .68-(v-shoulder).dot((elbow-shoulder).normalized())/.08))
            return {upper:(1-tip)*(1-fixed),lower:tip*(1-fixed),"spine_03":fixed}
        refined=smooth_path(centerline,2)
        def sleeve_folds(i,t):
            p=i/(len(refined)-1)
            elbow=.166*math.exp(-((p-.67)/.21)**2)
            cuff=.090*math.exp(-((p-.92)/.11)**2)
            return (.051*math.sin(4*t+i*.44)
                    +elbow*math.sin(i*.88+2.15*t+.46*math.sin(3*t))
                    +cuff*math.cos(i*1.39-1.40*t))
        shell = sweep("Rolled sleeve",refined,a["jacket"],sides=32,
                      normal=(0,1,0),ripple=sleeve_folds)
        skin(shell,rig,sleeve_weights)
        end=(wrist-elbow).normalized()
        cuff= [((centerline[-1][0]+end*offset),w,d)
               for offset,w,d in ((-.012,.034,.029),(-.007,.035,.030),(.005,.034,.030),(.010,.031,.027))]
        cuff_mesh=sweep("Folded sleeve cuff",cuff,a["Dark piping"],24,normal=(0,1,0))
        bone_parent(cuff_mesh,rig,lower)
        seam_points=[shell.data.vertices[i*32+4].co.copy() for i in range(2,len(refined)-3)]
        skin(cord("Outer sleeve seam",seam_points,.0010,a["Edge wear"],5),rig,sleeve_weights)
        dragon_embroidery(shell,rig,sleeve_weights,shoulder.lerp(elbow,.31),sign,a)

        thigh, calf, foot = (bone[n].head_local.copy() for n in (f"thigh_{side}", f"calf_{side}", f"foot_{side}"))
        trouser = [((sign*.071,-.003,.614),.070,.071),((sign*.073,-.006,.588),.073,.076),
                   ((sign*.081,-.009,.551),.072,.078),
                   (thigh.lerp(calf,.31),.066,.066),(thigh.lerp(calf,.48),.059,.061),
                   (thigh.lerp(calf,.71),.054,.051),(thigh.lerp(calf,.87),.054,.049),
                   (calf,.053,.054),(calf.lerp(foot,.17),.055,.049),
                   (calf.lerp(foot,.31),.047,.048),(calf.lerp(foot,.55),.046,.043),
                   (calf.lerp(foot,.72),.047,.043),(calf.lerp(foot,.80),.040,.039),
                   (calf.lerp(foot,.90),.048,.041),(calf.lerp(foot,.97),.033,.033),
                   ((foot.x,foot.y,.066),.030,.033)]
        leg=smooth_path(trouser,2)
        def trouser_folds(i,t):
            p=i/(len(leg)-1)
            knee=.168*math.exp(-((p-.53)/.177)**2)
            ankle=.227*math.exp(-((p-.89)/.12)**2)
            fade=min(1,p*5)
            return fade*(.06*math.cos(5*t+i*.41)+.065*math.sin(3*t-i*.38)
                         +(knee+ankle)*math.sin(i*.98+2*t+.27*math.cos(3*t)))
        leg_mesh=sweep("Cargo trouser leg",leg,a["Olive twill"],sides=32,
                       ripple=trouser_folds,cap=False)
        trousers.append(leg_mesh)
        flat_cargo_pocket(leg_mesh,rig,side,sign,a)
        seam = [(p[0][0]+sign*(p[1]*.80),p[0][1]-.52*p[2],p[0][2]) for p in trouser[2:]]
        skin(cord("Trouser double seam",seam,.0018,a["Dark piping"],5,2),rig,pants_weights)
        boots(rig,a,side,foot)
    fit_waistband(rig,trousers,pants_weights,a["Olive twill"])


def dragon_embroidery(shell,rig,weights,origin,sign,a):
    designs=(
        [(-.022,-.012),(-.027,.002),(-.010,.017),(.005,.017),(.012,.008),(.005,-.003),
         (-.010,-.010),(-.008,-.020),(.008,-.017),(.024,-.005)],
        [( .012,.008),(.019,.014),(.028,.013),(.023,.021),(.017,.022),(.018,.029)],
        [(.023,.021),(.030,.024),(.034,.022),(.030,.018)],
        [(-.004,.015),(-.008,.025),(-.014,.026),(-.017,.022)],
        [(-.010,-.010),(-.018,-.017),(-.017,-.023),(-.012,-.022)],
        [(.008,-.017),(.015,-.024),(.020,-.025),(.023,-.020)],
    )
    for line in designs:
        points=[]
        for dx,dz in line:
            x,z=origin.x+sign*dx,origin.z+dz
            ok,p,_,_=shell.ray_cast((x,-.23,z),(0,1,0),distance=.31)
            if ok:
                points.append(Vector((p.x,p.y-.00072,p.z)))
        if len(points)>1:
            skin(cord("Low-contrast embroidered dragon",points,.00082,a["Shoulder embroidery"],5,2),
                 rig,weights)


def flat_cargo_pocket(leg,rig,side,sign,a):
    def project(y,z,lift):
        ok,p,_,_=leg.ray_cast((.37*sign,y,z),(-sign,0,0),distance=.37)
        return Vector((p.x+sign*lift,y,z)) if ok else Vector((sign*.154,y,z))
    rows=[]
    for row in range(9):
        t=row/8
        z=.417+.088*t
        width=.031+.014*math.sin(math.pi*t*.91)
        rows.append([project(-.027+width*(i/9*2-1),z,.0047) for i in range(10)])
    pocket=surface("Flat cargo patch pocket",rows,a["Olive twill"],closed=False,cap=False)
    seam=cord("Flush pocket edge",[row[0] for row in rows[::-1]]+rows[0]+[row[-1] for row in rows],
              .00092,a["Edge wear"],5)
    flap=surface("Cargo pocket flap",[[project(-.027+.045*(i/11*2-1),z,.0067)
                                          for i in range(12)] for z in (.482,.494,.514)],
                 a["Olive twill"],closed=False,cap=False)
    bone_parent(merge("Fitted cargo pocket",[pocket,seam,flap]),rig,f"thigh_{side}")



def fit_waistband(rig,trousers,weights,material):
    """Sew the two cuffs into a single continuous fitted trouser mesh."""
    import bmesh

    right,left=trousers[1],trousers[0]
    left_ring=[left.data.vertices[i].co.copy() for i in range(32)]
    right_ring=[right.data.vertices[i].co.copy() for i in range(32)]
    outline=[left_ring[i%32] for i in range(20,45)]
    outline.extend(right_ring[i] for i in range(4,29))
    waistband=[outline]
    for t,z,w,d in ((.50,.632,.130,.071),(1,.657,.119,.063)):
        ring=[]
        for p in outline:
            angle=math.atan2(p.y+.003,p.x*.53)
            waist=Vector((w*math.cos(angle),-.003+d*math.sin(angle),z))
            blended=p.lerp(waist,t)
            blended.z=z
            ring.append(blended)
        waistband.append(ring)
    yoke=surface("Seamed waist yoke",waistband,material,cap=False)
    gusset=[left_ring[i] for i in range(12,21)]+[right_ring[i%32] for i in range(28,37)]
    crotch=mesh_object("Cargo crotch gusset",gusset,
                       [(i,i+1,16-i,17-i) for i in range(8)],material)
    pants=merge("Continuous cargo trousers",[left,right,yoke,crotch])
    bm=bmesh.new()
    bm.from_mesh(pants.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(pants.data)
    bm.free()
    skin(pants,rig,weights)


def boots(rig, a, side, foot):
    x = foot.x
    horizontal = [
        ((x,-.042,.002),.037,.091),((x,-.045,.012),.044,.099),
        ((x,-.045,.028),.042,.099),((x,-.043,.043),.040,.090),
    ]
    upper = [
        ((x,-.046,.025),.041,.095),((x,-.046,.042),.041,.095),
        ((x,-.051,.063),.037,.078),((x,-.038,.078),.035,.055),
        ((x,-.019,.100),.032,.038),((x,-.015,.118),.032,.032),
    ]
    def profile(name, levels, material):
        rings = [[(cx+w*math.cos(t),cy+d*math.sin(t),z)
                  for t in np.linspace(0,TAU,26,endpoint=False)]
                 for (cx,cy,z),w,d in levels]
        return surface(name,rings,material)
    objects = [
        profile("Lug outsole",horizontal,a["Rubber"]),
        profile("Hiking boot upper",upper,a["Boot leather"]),
        rounded("Scuffed toe cap",(x,-.103,.036),(.080,.070,.039),.017,a["Rubber"]),
        cord("Boot upper binding",[(x-.035,-.082,.050),(x-.030,-.105,.061),
                                   (x,-.127,.061),(x+.031,-.107,.060),(x+.036,-.078,.052)],
             .0026,a["Boot leather"],6,3),
        sweep("Woven boot tongue",smooth_path([
            ((x,-.112,.062),.029,.004),((x,-.093,.076),.027,.003),
            ((x,-.072,.091),.024,.004),((x,-.049,.111),.018,.003)],3),a["Boot mesh"],12),

    ]
    for y in np.linspace(-.119,.022,7):
        for sign in (-1,1):
            objects.append(rounded("Outsole tread",(x+sign*.034,y,.009),
                                   (.024,.013,.017),.002,a["Rubber"],segments=1))
    for y,z,offset in ((-.121,.067,.015),(-.097,.077,.014),(-.080,.087,.012),
                       (-.064,.097,.010),(-.055,.108,.010)):
        objects.append(cord("Round bootlace",[(x-.023,y+offset,z),
                                               (x,y-.003,z+.002),
                                               (x+.023,y+offset,z+.004)],.0025,
                            a["Weathered canvas"],5,2))
        objects.append(sphere("Boot eyelet",(x-.023,y+offset,z),
                              (.004,.003,.004),a["Brass stitching"],8,4))
        objects.append(sphere("Boot eyelet",(x+.023,y+offset,z+.004),
                              (.004,.003,.004),a["Brass stitching"],8,4))
    boot = merge("Left hiking boot" if side=="l" else "Right hiking boot",objects)
    bone_parent(simplify(boot,.72),rig,f"foot_{side}")


def satchel(rig, a):
    center = (-.142,-.053,.636)
    body = rounded("Canvas satchel",center,(.132,.069,.113),.025,a["Weathered canvas"],(0,-.10,-.13))
    flap = rounded("Overlapping canvas flap",(-.142,-.081,.671),(.135,.032,.061),.014,
                   a["Weathered canvas"],(0,-.10,-.13))
    seam = cord("Canvas topstitch",[(-.201,-.09,.684),(-.198,-.098,.651),(-.145,-.101,.643),
                                  (-.094,-.095,.652),(-.083,-.084,.676)],.0019,a["Brass stitching"],5,4)
    tab = rounded("Leather closure",(-.139,-.098,.632),(.021,.009,.054),.004,a["Boot leather"],(0,-.10,0))
    snap = sphere("Satchel stud",(-.139,-.105,.626),(.007,.003,.007),a["Brass stitching"],10,6)
    binding=cord("Weathered satchel leather binding",
                 [(-.198,-.079,.652),(-.200,-.079,.602),(-.183,-.080,.582),
                  (-.121,-.087,.584),(-.085,-.083,.600),(-.082,-.080,.641)],
                 .0034,a["Boot leather"],7,4)
    bone_parent(merge("Field satchel",[body,flap,seam,tab,snap,binding]),rig,"spine_01")

    front = [(-.155,-.095,.677),(-.12,-.088,.70),(-.071,-.08,.746),(-.022,-.082,.793),
             (.029,-.078,.841),(.077,-.054,.885),(.104,-.022,.916),(.112,.025,.912)]
    back = [(.112,.025,.912),(.100,.058,.891),(.044,.085,.828),(-.018,.089,.776),
            (-.080,.080,.725),(-.137,.028,.682)]
    for label, path in (("Front",front),("Back",back)):
        part = sweep(label+" canvas strap",smooth_path([(v,.015,.003) for v in path]),
                     a["Boot leather"],sides=10)
        skin(part,rig,lambda v: split_weights(v,.68,.875,"spine_01","spine_03"))
    buckle_path = [(.017,-.082,.81),(.037,-.079,.83),(.061,-.069,.816),
                   (.040,-.075,.796),(.017,-.082,.81)]
    bone_parent(cord("Satchel buckle",buckle_path,.0028,a["Brass stitching"],6),rig,"spine_03")


def face(body, rig, samples, a):
    def facial_surface(x,z,fallback):
        hit,p,_,_=body.ray_cast((x,-.25,z),(0,1,0),distance=.19)
        return min(p.y,fallback+.0016) if hit else fallback

    parts=[]
    for side in "lr":
        sign=1 if side=="l" else -1
        points=samples[f"helper-{side}-eye"]
        center=Vector(tuple((min(v[i] for v in points)+max(v[i] for v in points))/2 for i in range(3)))
        center.y-=.0008
        rx,ry,rz=.0154,.0142,.01445
        def eyeball_y(dx,dz):
            return center.y-ry*math.sqrt(max(.12,1-(dx/rx)**2-(dz/rz)**2))
        for upper in (True,False):
            points=[]
            for i in range(18):
                t=i/17
                dx=sign*(-.0126+.0258*t)
                dz=(.0048 if upper else -.0040)*math.sin(math.pi*t)+.0008*(t-.5)
                x,z=center.x+dx,center.z+dz
                fallback=eyeball_y(dx,dz)-.0005
                surface_y=facial_surface(x,z,fallback)
                # Blend the lash root into the actual eyelid surface.
                points.append(Vector((x,max(surface_y,fallback-.00030),z)))
            parts.append(sweep("Upper lid" if upper else "Lower lid",
                              [(p,.00028+.00045*math.sin(math.pi*i/17),.00037)
                               for i,p in enumerate(points)],a["Lid edge"],6,normal=(0,0,1)))
            if upper:
                for i,p in enumerate(points[2:-2]):
                    length=.00072+.00124*(i/13)
                    tip=p+Vector((sign*.0008,-.00070,length))
                    parts.append(sweep("Fine upper lash",[(p,.00021,.00011),
                       (p.lerp(tip,.55),.00013,.00008),(tip,.00005,.00005)],
                       a["Hair"],4,normal=(1,0,0)))
        rng=random.Random(238+(side=="l"))
        for i in range(38):
            t=i/37
            x=sign*(.011+.036*t)
            z=1.120+.006*math.sin(math.pi*t)-.0019*t+rng.uniform(-.00075,.00065)
            y=facial_surface(x,z,-.109+.017*t*t)-.00031
            p=Vector((x,y,z-.0008))
            q=Vector((x+sign*(.0013+.0011*t),
                      facial_surface(x+sign*.002,z+.0015,y)-.00028,
                      z+.0014+rng.uniform(0,.0009)))
            parts.append(sweep("Brushed individual brow strand",[(p,.00021,.00016),
                               (p.lerp(q,.55),.00018,.00013),(q,.00006,.00008)],
                               a["Hair"],4))
    bone_parent(merge("Eyes, brows and lashes",parts),rig,"head")



def bracer(rig, a):
    wrist = rig.data.bones["hand_l"].head_local.copy()
    axis = (wrist-rig.data.bones["lowerarm_l"].head_local).normalized()
    center = wrist-axis*.014
    across = Vector((1,0,0))
    across = (across-across.dot(axis)*axis).normalized()
    side = axis.cross(across)
    def point(height, angle, r):
        return center+axis*height+across*math.cos(angle)*r+side*math.sin(angle)*r*.90
    profile=[(-.030,.026),(-.027,.033),(-.022,.034),(-.019,.030),
             (.012,.028),(.014,.032),(.020,.032),(.023,.025)]
    rings = [[point(t,TAU*j/40,r) for j in range(40)] for t,r in profile]
    parts=[surface("Patinated cast cuff",rings,a["Ancient bronze"])]
    for edge in (-.023,.016):
        parts.append(cord("Polished bronze rim",[point(edge,TAU*j/40,.033 if edge<0 else .031)
                                                for j in range(41)],.0018,a["Brass stitching"],5))
    motifs = [
        [(-.016,-.26),(.007,-.26),(.007,.17),(-.003,.17),(-.003,-.064),(.002,-.064)],
        [(-.014,.23),(-.014,-.14),(-.009,-.14)],
        [(.012,-.18),(.012,.19)],
    ]
    for i in range(10):
        angle = TAU*i/10
        for motif in motifs:
            pts=[point(t,angle+u,.0307-(t+.012)*.07) for t,u in motif]
            parts.append(cord("Inlaid seal groove",pts,.00105,a["glow"],5))
    bone_parent(merge("Bracer",parts),rig,"hand_l")
    muzzle=empty("Muzzle",tuple(wrist+axis*.023+across*.05))
    bone_parent(muzzle,rig,"hand_l")


def direction_pose(rig, side, directions):
    names=[f"{label}_{side}" for label in ("upperarm","lowerarm","hand")]
    result={}
    accumulated=Matrix.Identity(3)
    for name, target in zip(names,directions):
        bone=rig.data.bones[name]
        rest=(bone.tail_local-bone.head_local).normalized()
        wanted=accumulated.inverted() @ Vector(target).normalized()
        turn=rest.rotation_difference(wanted)
        result[name]=(tuple(turn.axis),math.degrees(turn.angle),(0,0,0))
        accumulated=accumulated @ turn.to_matrix()
    return result


def fingers(rig, side, amount):
    sign = 1 if side == "l" else -1
    bones = rig.data.bones
    index = bones[f"index_01_{side}"].head_local
    pinky = bones[f"pinky_01_{side}"].head_local
    axis = tuple((pinky-index).normalized()*sign)
    result = {}
    for digit in ("index","middle","ring","pinky"):
        for joint, degrees in enumerate((45,81,59),1):
            name = f"{digit}_{joint:02d}_{side}"
            result[name] = (axis, degrees*amount, (0,0,0))
    thumb_axis = (sign*.55,-.23,.78)
    for joint, degrees in enumerate((20,29,35),1):
        result[f"thumb_{joint:02d}_{side}"] = (thumb_axis, degrees*amount, (0,0,0))
    return result


def animate(rig):
    def turn(x=0,y=0,z=0,offset=(0,0,0)):
        axes=((1,0,0),(0,1,0),(0,0,1))
        for value, axis in zip((x,y,z),axes):
            if value:
                return (axis,value,offset)
        return (axes[0],0,offset)

    def pose(left=None, right=None, fist=.14, **body):
        neutral=((.29,-.03,-1),(.19,-.29,-1),(.03,-.24,-1))
        l=left or neutral
        r=right or tuple((-x,y,z) for x,y,z in neutral)
        return (direction_pose(rig,"l",l) | direction_pose(rig,"r",r)
                | fingers(rig,"l",fist) | fingers(rig,"r",.17) | body)

    neutral=pose(right=((-0.27,-.09,-1),(-.16,-.31,-1),(-.08,-.20,-1)),
                 head=turn(y=-1.2))
    breathe=pose(spine_03=turn(x=-3),head=turn(y=2))
    relax=pose(spine_03=turn(x=1.7),head=turn(y=-1.4))
    prep=pose(left=((.52,.24,-.83),(-.01,-.41,.91),(-.05,-.59,.8)),
              fist=.38, spine_03=turn(z=-8),head=turn(z=4))
    reach=pose(left=((.17,-.96,-.17),(-.10,-.995,.12),(-.18,-.97,-.10)),
               right=((-0.4,.35,-1),(-.2,-.28,-1),(-.1,-.34,-1)),
               spine_03=turn(z=11),head=turn(z=-6))
    recoil=pose(left=((.34,.26,-.80),(.12,-.57,.30),(.1,-.82,.27)),
                right=((-0.52,.34,-.72),(-.07,-.63,.55),(-.01,-.83,.35)),
                spine_01=turn(x=-12),head=turn(x=-14))
    cheer=pose(left=((.58,-.30,-.43),(.0,-.2,.94),(.1,-.19,.98)),
               fist=.89, spine_03=turn(y=-6),head=turn(x=-6))
    guard=pose(left=((.42,.04,-.90),(-.74,-.49,.48),(-.67,-.43,.6)),
               right=((-0.36,-.08,-.85),(.43,-.75,.28),(.27,-.87,.35)),
               spine_03=turn(x=1),head=turn(x=4))
    guard_peak=guard | {"spine_03":turn(x=-2),"head":turn(x=2)}
    for name,length,poses in (
        ("Idle",3,{0:neutral, 15:breathe, 31:neutral, 46:relax, 60:neutral}),
        ("Cast",.7,{0:neutral, 3:prep, 7:reach, 9:reach, 14:neutral}),
        ("Hit",.6,{0:neutral, 3:recoil, 7:pose(spine_03=turn(x=7)), 12:neutral}),
        ("Victory",1.5,{0:neutral, 6:prep, 13:cheer, 20:cheer|{"head":turn(y=-5)}, 30:cheer}),
        ("Charge",1,{0:guard, 10:guard_peak, 20:guard}),
    ):
        clip(rig,name,length,poses)
    idle = rig.animation_data.nla_tracks["Idle"].strips[0]
    rig.animation_data.action = idle.action
    rig.animation_data.action_slot = idle.action_slot
    bpy.context.scene.frame_set(0)


def build():
    root=new_asset("Hero")
    body, rig, samples, data, eyes, teeth=make_human()
    rig.parent=root
    a=palette()
    body.data.materials.append(a["Skin"])
    apply_skin(body,a["Skin"],data)
    garments(rig,a)
    satchel(rig,a)
    face(body,rig,samples,a)
    finish_eyes(eyes,samples,rig,a["Eye catchlight"])
    teeth.name="MakeHuman teeth"
    teeth.data.materials.clear()
    teeth.data.materials.append(a["Tooth ivory"])
    for poly in teeth.data.polygons:
        poly.material_index=0
    for vertex in teeth.data.vertices:
        vertex.co.y-=.0046
        vertex.co.z-=.0011
    bone_parent(simplify(teeth,.49),rig,"head")
    haircut(rig,a["Hair"])
    bracer(rig,a)
    child_head_shape(body,rig)
    a.uv([obj for obj in root.children_recursive if obj != body])
    bake_clothes(root)
    animate(rig)
    root.rotation_euler.z=math.pi/2
    model=ROOT/"public"/"models"/"hero.glb"
    # Apply all construction modifiers before export; retain the rig and Blink target.
    for obj in root.children_recursive:
        for modifier in list(obj.modifiers):
            if modifier.type!="ARMATURE":
                activate(obj)
                bpy.ops.object.modifier_apply(modifier=modifier.name)
    export(root,model,use_rest_pose=False,apply_modifiers=False)
    target=(0,0,.609)
    source=studio(1.22,root,"hero",[
        ("front",target,math.pi/2,.065,1.38),("three-quarter",target,math.pi*.29,.067,1.39),
        ("side",target,0,.06,1.39),("head",(0,0,1.09),math.pi*.37,.04,.31),
        ("concept",(.012,0,.610),math.pi*.399,.023,1.34),
    ])
    return {"model":str(model),"source":str(source)}


if __name__ == "__main__":
    result = build()
