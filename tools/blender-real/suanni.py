"""Sculpt, rig and export the bronze Suanni guardian."""
import math
from pathlib import Path
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from bronze import bake_castings
from haze import place_haze
from mathutils import Vector

from common import (ROOT, TAU, TextureAtlas, activate, bone_parent, clip, cord, empty,
                    export, merge, new_asset, rig_object, simplify, skin, smooth_path,
                    sphere, studio, surface, sweep)


def palette():
    return TextureAtlas("Suanni", [
        ("Foundry bronze", (.242,.217,.188), .69,.52,"metal",0),
        ("Dark cast seams", (.177,.270,.207), .81,.27,"metal",0),
        ("Verdigris repoussé", (.219,.340,.281), .78,.36,"metal",0),
        ("Burnished edges", (.574,.373,.187), .31,.91,"leather",0),
        ("Old gilding", (.446,.347,.226), .49,.69,"bronze",0),
        ("Mane bronze", (.329,.246,.165), .59,.60,"metal",0),
        ("Horn and talons", (.555,.410,.252), .49,.73,"leather",0),
        ("Oxidized claw", (.223,.191,.163), .66,.48,"metal",0),
        ("Mouth interior", (.080,.044,.058), .81,.14,"leather",0),
        ("glow", (.58,.203,1), .3,.18,"glow",3.25),
        ("Dulled metal", (.262,.272,.222), .57,.71,"bronze",0),
        ("Burnished muzzle", (.321,.27,.22), .60,.53,"leather",0),
    ], size=2048)


LEGS = {
    "Front.L": ((-.72,.435,1.44),(-.45,.435,.824),(-.72,.435,.263),(-.94,.435,.084)),
    "Front.R": ((-.72,-.435,1.44),(-.45,-.435,.824),(-.72,-.435,.263),(-.94,-.435,.084)),
    "Hind.L": ((.84,.373,1.40),(.60,.373,.822),(1.03,.373,.359),(.94,.373,.095)),
    "Hind.R": ((.84,-.373,1.40),(.60,-.373,.822),(1.03,-.373,.359),(.94,-.373,.095)),
}


def leg_names(label):
    family, side = label.split(".")
    return label, f"{family}Shin.{side}", f"{family}Paw.{side}"


def skeleton(root):
    bones = [
        ("Master",(0,0,0),(0,0,.34),None),
        ("Spine",(.39,0,1.44),(-.43,0,1.51),"Master"),
        ("Chest",(-.56,0,1.49),(-.91,0,1.79),"Spine"),
        ("Neck",(-.94,0,1.73),(-1.21,0,1.98),"Chest"),
        ("Head",(-1.14,0,1.95),(-1.69,0,1.96),"Neck"),
        ("Jaw",(-1.25,0,1.79),(-1.68,0,1.64),"Head"),
        ("Mane.L",(-1.1,.18,2.10),(-.62,.52,1.87),"Head"),
        ("Mane.R",(-1.1,-.18,2.10),(-.62,-.52,1.87),"Head"),
        ("Tail.01",(1.05,0,1.42),(1.47,.07,1.68),"Spine"),
        ("Tail.02",(1.47,.07,1.68),(1.67,.10,1.89),"Tail.01"),
    ]
    for label, (p0,p1,p2,p3) in LEGS.items():
        thigh, shin, paw = leg_names(label)
        bones.extend(((thigh,p0,p1,"Master"),(shin,p1,p2,thigh),(paw,p2,p3,shin)))
    return rig_object("Suanni Skeleton",root,bones)


def transition(lo,hi,pos):
    t = max(0,min(1,(pos-lo)/(hi-lo)))
    return t*t*(3-2*t)


def body_weights(v):
    x,y,z=v
    front=x < .02
    chest=1-transition(-.75,.17,x)
    neck=transition(1.48,1.90,z)*(1-transition(-1.14,-.61,x))
    trunk={"Neck":neck,"Chest":chest*(1-neck),"Spine":(1-chest)*(1-neck)}
    leg = ("Front." if front else "Hind.") + ("L" if y>0 else "R")
    thigh, shin, paw = leg_names(leg)
    limb = 1-transition(.99,1.53,z)
    shin_factor=1-transition(.62,.97,z)
    paw_factor=1-transition(.19,.36,z)
    return {name:weight*(1-limb) for name,weight in trunk.items()} | {
        thigh:limb*(1-shin_factor), shin:limb*shin_factor*(1-paw_factor),
        paw:limb*shin_factor*paw_factor,
    }


def cast_union(name, parts, material, voxel, limit):
    obj=merge(name,parts)
    activate(obj)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obj.data.remesh_voxel_size=voxel
    bpy.ops.object.voxel_remesh()
    smooth=obj.modifiers.new("Soften cast joins","SMOOTH")
    smooth.factor=.72
    smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    obj.data.calc_loop_triangles()
    simplify(obj,min(1,limit/len(obj.data.loop_triangles)))
    obj.data.materials.clear()
    obj.data.materials.append(material)
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    for face in obj.data.polygons:
        face.use_smooth=True
        for loop in face.loop_indices:
            x,y,z=obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(.57+.27*x+.093*y, .075+.36*z+.047*y)
    return obj


def body(rig,a):
    bronze=a["Foundry bronze"]
    chest=[((x,0,z),h,w) for x,z,h,w in (
        (-1.18,1.32,.22,.29),(-1.09,1.37,.449,.43),(-.83,1.44,.58,.571),
        (-.55,1.45,.53,.51),(-.25,1.49,.44,.42),(.04,1.51,.36,.36),
        (.34,1.50,.33,.34),(.62,1.48,.39,.38),(.88,1.43,.39,.41),
        (1.11,1.40,.31,.30),(1.24,1.42,.16,.19))]
    all_parts=[sweep("Chest, saddle and rump",smooth_path(chest),bronze,36,normal=(0,0,1),
                     ripple=lambda i,t:.025*math.cos(4*t+i*.27))]
    neck=[((-.74,0,1.30),.33,.37),((-.87,0,1.57),.40,.46),
          ((-.94,0,1.79),.41,.42),((-1.02,0,2.00),.34,.32),((-1.15,0,2.12),.26,.26)]
    all_parts.append(sweep("Upright leonine neck",smooth_path(neck),bronze,34,normal=(0,1,0)))
    for label,(p0,p1,p2,p3) in LEGS.items():
        front=label.startswith("Front")
        shoulder=Vector(p0)
        knee, ankle=Vector(p1),Vector(p2)
        sections=[
            (shoulder+Vector((.03,0,.26)),.22,.23),(shoulder,.293 if front else .304,.278),
            (shoulder.lerp(knee,.27),.260 if front else .265,.245),
            (shoulder.lerp(knee,.67),.196 if front else .245,.202),
            (knee,.173,.200),(knee.lerp(ankle,.25),.153,.173),
            (knee.lerp(ankle,.60),.114,.139),(ankle,.132,.149),
            ((p3[0]+.05,p3[1],p3[2]+.035),.147,.183),
        ]
        all_parts.append(sweep(label+" muscle and tendon",smooth_path(sections),bronze,22,normal=(0,1,0)))
        px,py,pz=p3
        all_parts.append(sphere(label+" broad foot",(px+.015,py,.132),(.260,.216,.13),bronze,24,12))
        paw=leg_names(label)[2]
        for k in range(4):
            dy=(k-1.5)*.101
            reach=.033*(1-abs(k-1.5))
            all_parts.append(sphere("Integrated knuckle",(px-.153-reach,py+dy,.102),
                                    (.154,.079,.107),bronze,16,9))
            claw_path=[((px-.190-reach,py+dy,.131),.060,.065),
                       ((px-.260-reach,py+dy,.106),.048,.053),
                       ((px-.312-reach,py+dy,.065),.034,.036),
                       ((px-.330-reach,py+dy,.018),.0016,.004)]
            talon=sweep("Oxidized talon",smooth_path(claw_path,2),a["Oxidized claw"],
                        8,normal=(0,1,0))
            ridge=cord("Claw rubbed edge",[(x,y-.020,z+.024) for (x,y,z),_,_ in claw_path[1:]],
                       .0073,a["Burnished edges"],5)
            bone_parent(merge("Dark talon with rubbed copper edge",[talon,ridge]),rig,paw)
    casting=cast_union("Continuous bronze body",all_parts,bronze,.026,9900)
    for vertex in casting.data.vertices:
        if vertex.co.z < .001:
            vertex.co.z = .001
    casting.data.update()
    return skin(casting,rig,body_weights)


def horn(name, control, rig, joint, a, grooves):
    path=smooth_path(control,4)
    parts=[sweep(name,path,a["Horn and talons"],18,normal=(0,1,0),
                 ripple=lambda i,t:.05*math.cos(6*t+i*.3))]
    for index in grooves:
        center,w,d=path[index]
        direction=Vector(path[index+1][0])-Vector(path[index-1][0])
        direction.normalize()
        across=Vector((0,1,0))
        across=(across-across.dot(direction)*direction).normalized()
        over=direction.cross(across)
        points=[Vector(center)+1.015*(across*w*math.cos(TAU*i/18)+over*d*math.sin(TAU*i/18))
                for i in range(19)]
        parts.append(cord("Ridge on cast horn",points,.007,a["Old gilding"],5))
    bone_parent(simplify(merge(name,parts),.60),rig,joint)


def face(rig,a):
    bronze=a["Foundry bronze"]
    skull=[((x,0,z),h,w) for x,z,h,w in (
        (-1.79,1.853,.12,.17),(-1.68,1.866,.138,.255),(-1.54,1.94,.206,.328),
        (-1.40,2.015,.262,.387),(-1.28,2.052,.301,.419),(-1.12,2.04,.306,.420),
        (-.96,2.00,.26,.36),(-.83,1.94,.18,.26),(-.78,1.92,.11,.15))]
    upper=[sweep("Lion cranium",smooth_path(skull),bronze,32,normal=(0,0,1),
                 ripple=lambda i,t:.04*math.cos(4*t+i*.23))]
    for sign in (-1,1):
        upper += [
            sphere("Temple",(-1.17,sign*.275,1.953),(.29,.194,.255),bronze,24,14),
            sphere("Muzzle pad",(-1.605,sign*.139,1.819),(.196,.175,.105),bronze,24,13),
            sphere("Cheek plane",(-1.407,sign*.248,1.775),(.25,.166,.13),bronze,20,11),
        ]
    head=cast_union("Sculpted lion head",upper,bronze,.015,5500)
    bone_parent(head,rig,"Head")
    nostril_profile=[(-1.883,.044,.026),(-1.875,.117,.042),(-1.853,.151,.052),
                     (-1.818,.155,.048),(-1.780,.103,.034)]
    nose_rings=[]
    for x,width,height in nostril_profile:
        nose_rings.append([(x,.97*width*math.cos(t)*(1+.31*math.sin(t)),
                            1.872+height*math.sin(t)) for t in (TAU*j/32 for j in range(32))])
    bone_parent(surface("Tapered cast lion nose",nose_rings,a["Burnished muzzle"]),rig,"Head")
    for sign in (-1,1):
        nose=sphere("Shallow carved nostril",(-1.864,sign*.084,1.888),(.024,.035,.015),
                    a["Mouth interior"],12,8,rotation=(0,.2,sign*.35))
        bone_parent(nose,rig,"Head")
        # The socket and tapered eyelids frame the light inside a fixed bronze eyelid.
        socket=sphere("Recessed eye socket",(-1.449,sign*.319,1.993),(.139,.077,.086),
                      a["Dulled metal"],20,10,rotation=(0,-.19,sign*.37))
        eye=sphere("Violet eye",(-1.505,sign*.381,1.986),(.081,.037,.040),
                   a["glow"],19,10,rotation=(0,-.27,sign*.43))
        bone_parent(merge("Socket and violet cornea",[socket,eye]),rig,"Head")
        brow=[((-1.663,sign*.254,1.988),.036,.029),
              ((-1.553,sign*.349,2.021),.073,.048),
              ((-1.425,sign*.402,2.079),.097,.057),
              ((-1.302,sign*.397,2.117),.069,.039),
              ((-1.211,sign*.418,2.157),.006,.008)]
        bone_parent(sweep("Gilt storm brow",smooth_path(brow,4),a["Old gilding"],13,normal=(0,0,1)),rig,"Head")
        lid=[(-1.575,sign*.324,1.995),(-1.499,sign*.388,1.952),(-1.386,sign*.409,1.967),
             (-1.322,sign*.400,2.011)]
        bone_parent(cord("Scrolled lower eyelid",lid,.024,a["Verdigris repoussé"],8,3),rig,"Head")
        fang=[((-1.644,sign*.216,1.805),.061,.049),((-1.670,sign*.231,1.720),.041,.035),
              ((-1.663,sign*.239,1.647),.026,.024),((-1.615,sign*.230,1.573),.002,.003)]
        bone_parent(sweep("Bronze canine",smooth_path(fang),a["Horn and talons"],12,normal=(0,1,0)),rig,"Head")
        for i in range(3):
            tooth=[((-1.477+i*.065,sign*(.216+i*.025),1.757),.025,.022),
                   ((-1.486+i*.065,sign*(.220+i*.025),1.713),.015,.019),
                   ((-1.465+i*.065,sign*(.218+i*.025),1.688),.003,.004)]
            bone_parent(sweep("Cast teeth",smooth_path(tooth),a["Horn and talons"],7,normal=(0,1,0)),rig,"Head")
    for index in range(3):
        x=-1.772+.051*index
        z=1.920+.032*index
        fold=[(x+.024*abs(t),t*.134,z-.046*abs(t)+.008*math.cos(t*5))
              for t in (-1,-.62,-.29,0,.29,.62,1)]
        bone_parent(cord("Creased lion nose bridge",fold,.025-index*.003,
                         a["Burnished muzzle"],7,2),rig,"Head")
    jaw=[((x,0,z),h,w) for x,z,h,w in (
        (-1.716,1.651,.060,.132),(-1.62,1.627,.075,.217),(-1.50,1.605,.095,.245),
        (-1.35,1.641,.118,.275),(-1.22,1.70,.107,.245),(-1.12,1.74,.085,.178))]
    lower=sweep("Hinged lion jaw",smooth_path(jaw),bronze,24,normal=(0,0,1))
    cavity=sphere("Hollow mouth",(-1.481,0,1.690),(.239,.185,.051),a["Mouth interior"],22,10)
    bone_parent(merge("Hinged jaw and mouth",[lower,cavity]),rig,"Jaw")
    for sign in (-1,1):
        whisker=[((-1.52,sign*.232,1.756),.035,.034),((-1.40,sign*.371,1.779),.029,.027),
                 ((-1.33,sign*.425,1.719),.021,.018),((-1.29,sign*.404,1.640),.003,.005)]
        bone_parent(sweep("Curled muzzle relief",smooth_path(whisker,4),a["Old gilding"],
                          11,normal=(0,0,1)),rig,"Head")

    horn("Single ridged horn",[
        ((-1.509,0,2.143),.135,.125),((-1.605,0,2.279),.107,.089),
        ((-1.692,.0,2.404),.075,.057),((-1.750,.009,2.506),.043,.032),
        ((-1.787,.014,2.579),.023,.016),((-1.794,.012,2.618),.001,.001),
    ],rig,"Head",a,(2,4,6,8,10,13,15,17))
    return head


def flame(name, points, a, material="Mane bronze", normal=(0,1,0)):
    path=smooth_path(points,4)
    core=sweep(name,path,a[material],12,normal=normal,
               ripple=lambda i,t:.24*math.cos(4*t+.15*math.sin(i*.45))+.075*math.cos(8*t))
    ridge_path=[]
    for i,(center,w,d) in enumerate(path):
        prev=Vector(path[max(0,i-1)][0])
        nxt=Vector(path[min(len(path)-1,i+1)][0])
        tangent=(nxt-prev).normalized()
        n=Vector(normal)
        n=(n-tangent*n.dot(tangent)).normalized()
        ridge_path.append((Vector(center)+n*w*.92,max(.0015,w*.115),max(.0012,w*.09)))
    ridge=sweep("Polished flame crest",ridge_path,a["Old gilding"],5,normal=normal)
    return [core,ridge]


def mane_and_tail(rig,a):
    rng=random.Random(112)
    manes=[]
    for sign,label in ((1,"L"),(-1,"R")):
        parts=[]
        for i in range(15):
            t=i/14
            shift=rng.uniform(-.04,.05)
            z=2.19-.70*t+shift
            y=.25+.38*math.sin(math.pi*t*.83)
            x=-1.37+.21*t
            length=.64+.23*math.sin(math.pi*t)+rng.uniform(-.11,.11)
            lift=.19+.105*math.cos(i*1.9)
            sway=.09*math.sin(i*2.31)
            scale=rng.uniform(.74,1.14)*(.88 if i%2 else 1.05)
            pattern=[
                (x,y*.76,z+.081), (x+.19,y+.017,z+.067+sway),
                (x+length*.53,y+.055,z-.010+sway),
                (x+length*.81,y+.058,z-.035+.55*lift),
                (x+length,y+.027,z+lift*.73),
                (x+length-.055,y-.015,z+lift),
            ]
            width=(.065,.101,.084,.058,.028,.0017)
            depth=(.076,.085,.063,.048,.021,.0022)
            control=[((px,sign*py,pz),w*scale,d*scale)
                     for (px,py,pz),w,d in zip(pattern,width,depth)]
            parts.extend(flame("S-curve bronze mane flame",control,a,normal=(0,sign,.11)))
        for i in range(3):
            x=-1.515+i*.107
            points=[((x,sign*.19,1.725-i*.039),.055,.047),
                    ((x+.013,sign*.30,1.61-i*.037),.048,.031),
                    ((x+.095,sign*.33,1.51-i*.031),.036,.023),
                    ((x+.154,sign*.36,1.54-i*.019),.024,.017),
                    ((x+.14,sign*.365,1.62-i*.008),.002,.002)]
            parts.extend(flame("Curled beard tendril",points,a,normal=(0,sign,.15)))
        mane=simplify(merge("Sculpted flame mane "+label,parts),.405)
        bone_parent(mane,rig,"Mane."+label)
        manes.append(mane)
    top=[]
    for sign in (-1,1):
        profile=[
            ((-1.41,sign*.284,2.132),.062,.054),((-1.393,sign*.395,2.224),.079,.061),
            ((-1.296,sign*.451,2.296),.058,.047),((-1.199,sign*.467,2.288),.044,.025),
            ((-1.157,sign*.438,2.358),.022,.014),((-1.235,sign*.432,2.410),.0015,.002),
        ]
        top.extend(flame("Temple flame curl",profile,a,normal=(0,sign,.12)))
    for j,dy in enumerate((-.159,-.054,.064,.169)):
        controls=[
            ((-1.275,dy,2.226),.106,.079),((-1.13,dy-.045*j,2.365),.109,.082),
            ((-.965,dy,2.461+.017*j),.093,.067),((-.783,dy+.034,2.431+.025*j),.063,.046),
            ((-.703,dy+.06,2.513+.018*j),.0015,.002)]
        top.extend(flame("Crown flame",controls,a,normal=(0,0,1)))
    crown=simplify(merge("Central flame crown",top),.60)
    bone_parent(crown,rig,"Head")

    tail=[((1.03,0,1.44),.18,.14),((1.24,.028,1.49),.143,.126),
          ((1.47,.074,1.67),.113,.095),((1.599,.104,1.865),.083,.079),
          ((1.68,.10,1.956),.082,.067)]
    shaft=sweep("Articulated bronze tail",smooth_path(tail,5),a["Foundry bronze"],21,
                normal=(0,1,0),ripple=lambda i,t:.08*math.cos(4*t+i*.2))
    def weights(v):
        factor=transition(1.56,1.80,v.z)
        return {"Tail.01":1-factor,"Tail.02":factor}
    skin(shaft,rig,weights)
    parts=[]
    profiles=[
        [(1.58,.105,1.88),(1.72,.165,2.035),(1.84,.230,2.18),(1.849,.272,2.31),(1.749,.284,2.376),(1.670,.281,2.319)],
        [(1.53,.095,1.94),(1.63,.179,2.146),(1.57,.221,2.273),(1.43,.267,2.331),(1.37,.284,2.416)],
        [(1.63,.064,1.895),(1.802,.05,1.972),(1.944,.11,2.139),(1.937,.146,2.256),(1.854,.156,2.330)],
        [(1.60,.072,1.917),(1.715,-.065,2.062),(1.742,-.119,2.224),(1.627,-.166,2.320),(1.550,-.176,2.282)],
        [(1.654,.098,1.949),(1.766,.213,1.821),(1.885,.275,1.855),(1.949,.300,1.960),(1.898,.324,2.005)],
    ]
    for profile in profiles:
        flare=((.090,.064),(.143,.105),(.101,.073),(.059,.040),(.026,.029),(.0018,.002))
        if len(profile)==5:
            flare=flare[:4]+flare[-1:]
        control=[(p,w,d) for p,(w,d) in zip(profile,flare)]
        parts.extend(flame("Tail flame",control,a,normal=(0,1,0)))
    tail_flames=simplify(merge("Flame tail finial",parts),.58)
    bone_parent(tail_flames,rig,"Tail.02")
    return [*manes,crown,tail_flames]


def shield(rig,a,name,bone,center,axis_u,axis_v,outline,bulge,pattern,additions=()):
    center,u,v=map(Vector,(center,axis_u,axis_v))
    normal=u.cross(v).normalized()

    def point(x,y,height=0):
        curvature = bulge * max(-.45,1-x*x*.72-y*y*.70)
        return center+u*x+v*y+normal*(curvature+height)

    # Radially loft the plate into a solid, with a distinct bevel around the rim.
    rings=[]
    for fraction,offset in ((.08,.025),(.58,.027),(.93,.022),(1,0),(.98,-.042),(.11,-.049)):
        rings.append([point(x*fraction,y*fraction,offset) for x,y in outline])
    pieces=[surface("Thick cast armor plate",rings,a["Verdigris repoussé"])]
    for frac,radius,lift,mat in ((.993,.026,.012,"Burnished edges"),(.878,.014,.027,"Old gilding")):
        pieces.append(cord("Worn cast edging",[point(x*frac,y*frac,lift)
                                              for x,y in (*outline,outline[0])],radius,a[mat],7,2))
    if pattern=="mask":
        designs=[
            [(-.78,-.09),(-.68,.19),(-.46,.44),(-.19,.31),(-.27,.12),(-.50,.18),(-.47,.02),(-.32,-.06)],
            [(-.75,-.21),(-.53,-.40),(-.30,-.43),(-.17,-.24),(-.31,-.17),(-.45,-.26)],
            [(-.54,.53),(-.34,.68),(-.11,.52)],
        ]
        designs += [[(-x,y) for x,y in segment] for segment in list(designs)]
        designs.append([(0,.48),(.129,.06),(0,-.31),(-.129,.06),(0,.48)])
    else:
        cloud=[(-.82,-.30),(-.80,.27),(-.64,.49),(-.20,.49),(-.20,-.14),(-.58,-.14),
               (-.58,.19),(-.38,.19)]
        designs=[cloud,[(-x,-y) for x,y in cloud]]
    for line in designs:
        pieces.append(cord("Recess under relief",[point(x,y,.023) for x,y in line],
                           .030,a["Dark cast seams"],7,2))
        pieces.append(cord("Cast relief scroll",[point(x,y,.053) for x,y in line],
                           .020,a["Old gilding"],7,2))
    for j,(x,y) in enumerate(outline):
        p=point(x*.795,y*.795,.048)
        radius=.030 if j%3==0 else .022
        pieces.append(sphere("Hammered rim rivet",p,(radius,radius,.78*radius),a["Burnished edges"],10,6))
    for x,y in ((-.52,.55),(.52,.55),(0,-.55)):
        pts=[point(x+dx,y+dy,.049) for dx,dy in ((-.075,0),(0,.069),(.075,0),(0,-.069),(-.075,0))]
        pieces.append(cord("Inlaid bronze diamond",pts,.013,a["Old gilding"],6))
    obj=simplify(merge(name,[*pieces,*additions]),.40 if name.startswith("Armor") else .34)
    bone_parent(obj,rig,bone)
    return obj


def ornaments(rig,a):
    dome=[(-.97,-.28),(-.86,.37),(-.58,.76),(0,.98),(.58,.76),(.86,.37),
          (.97,-.28),(.70,-.49),(.43,-.78),(0,-.97),(-.43,-.78),(-.70,-.49)]
    shoulder=[(-.96,-.20),(-.86,.51),(-.53,.83),(-.06,.97),(.52,.8),(.88,.45),
              (.98,-.04),(.72,-.44),(.46,-.63),(.04,-.95),(-.46,-.63),(-.81,-.48)]
    shield(rig,a,"Armor1","Head",(-1.52,0,2.153),(0,-.259,0),(.15,0,.21),dome,.063,"mask")
    for name,side,sign in (("Armor2","L",1),("Armor3","R",-1)):
        shield(rig,a,name,"Front."+side,(-.68,sign*.585,1.56),(-sign*.371,0,.042),
               (.065,-sign*.21,.351),shoulder,.16,"mask")
        shield(rig,a,"Haunch bronze saddle "+side,"Hind."+side,(.85,sign*.558,1.362),
               (-sign*.29,0,.02),(.020,-sign*.13,.287),shoulder,.132,"cloud")
        y=sign*.474
        shin_label="FrontShin."+side
        wrist=rig.data.bones["FrontPaw."+side].head_local.copy()
        band=sweep("Wraparound forged vambrace",
                   [(wrist+Vector((.058,0,.062)),.153,.154),
                    (wrist+Vector((.075,0,.088)),.170,.171),
                    (wrist+Vector((.105,0,.163)),.167,.167),
                    (wrist+Vector((.123,0,.187)),.150,.154)],
                   a["Old gilding"],16,normal=(0,1,0),cap=False)
        bone_parent(band,rig,shin_label)
        shield(rig,a,"Front greave "+side,shin_label,(-.677,y,.566),(-sign*.126,0,.035),
               (.121,0,.224),dome,.081,"cloud")
        shield(rig,a,"Cheek repoussé "+side,"Head",(-1.248,sign*.416,1.947),
               (-sign*.162,0,.049),(.037,-sign*.030,.132),dome,.054,"cloud")
        shield(rig,a,"Hind greave "+side,"HindShin."+side,(.84,sign*.452,.591),
               (-sign*.121,0,.051),(-.122,0,.191),dome,.076,"cloud")
    wrap=[]
    for z,radius,side in ((1.73,.365,.49),(1.67,.415,.527),(1.54,.429,.561),
                          (1.40,.421,.531),(1.28,.370,.455),(1.21,.306,.370)):
        wrap.append([(-.84-radius*math.cos(t),side*math.sin(t),z+.09*abs(math.sin(t)))
                     for t in (-1.30+2.60*j/36 for j in range(37))])
    chest=[surface("Wrapped chest cuirass",wrap,a["Verdigris repoussé"],closed=False,cap=False)]
    for edge in (wrap[0],wrap[-1]):
        chest.append(cord("Cuirass rolled copper border",edge,.025,a["Burnished edges"],6))
    for col in (0,6,11,25,30,36):
        chest.append(cord("Cuirass ribs",[row[col] for row in wrap],.016,a["Old gilding"],6,2))
    shield(rig,a,"Armor4","Chest",(-1.172,0,1.447),(0,-.323,0),(-.113,0,.334),
           dome,.111,"mask",chest)
    shield(rig,a,"Armor5","Spine",(.246,0,1.834),(.501,0,.025),(0,.346,.015),shoulder,.110,"cloud")


def cracks(rig,a,body):
    fissures = [
        [(-.87,1.38),(-.81,1.30),(-.775,1.30),(-.746,1.233),(-.681,1.249),
         (-.651,1.182),(-.595,1.165),(-.511,1.103)],
        [(-.31,1.64),(-.265,1.565),(-.256,1.513),(-.195,1.466),(-.174,1.427),
         (-.084,1.432),(-.050,1.373),(.005,1.370),(.073,1.324),(.16,1.309)],
        [(.31,1.695),(.421,1.663),(.469,1.701),(.519,1.697),(.577,1.653),
         (.625,1.664),(.722,1.601),(.813,1.595)],
    ]
    for sign in (-1,1):
        def project(x,z):
            hit,point,_,_=body.ray_cast((x,2.2*sign,z),(0,-sign,0),distance=2.2)
            return point+Vector((0,.005*sign,0)) if hit else None
        for i,line in enumerate(fissures):
            whole=[project(x,z) for x,z in line]
            points=[p for p in whole if p is not None]
            if len(points)<2:
                continue
            paths=[points]
            x,z=line[3]
            branch=[p for p in (project(x,z),project(x+.034,z+.037),
                                project(x+.056,z+.050),project(x+.087,z+.079)) if p is not None]
            if len(branch)>1:
                paths.append(branch)
            pieces=[]
            for j,path in enumerate(paths):
                for label,material,scale,lift in (
                    ("Cast crack shadow","Mouth interior",.012,0),
                    ("Violet light inside crack","glow",.0054,.008),
                ):
                    radius=scale*(.59 if j else 1)
                    sizes=[.28]+[.7+.28*math.sin(k*2.81) for k in range(1,len(path)-1)]+[.17]
                    profile=[(p+Vector((0,lift*sign,0)),radius*r,radius*r)
                             for p,r in zip(path,sizes)]
                    pieces.append(sweep(label,profile,a[material],sides=6,normal=(0,1,0)))
            skin(merge("Branching purple fissure",pieces),rig,body_weights)


def rotation(axis, degrees, offset=(0,0,0)):
    return axis,degrees,offset


def leg_pose(label,pelvis,shift):
    p0,p1,p2,_=map(Vector,LEGS[label])
    target=p2+Vector(shift)-Vector(pelvis)
    delta=target-p0
    distance=delta.length
    a=(p1-p0).length
    b=(p2-p1).length
    projected=(a*a-b*b+distance*distance)/(2*distance)
    lift=math.sqrt(max(0,a*a-projected*projected))
    forward=delta.normalized()
    perpendicular=Vector((-forward.z,0,forward.x))
    side=1 if label.startswith("Front") else -1
    elbow=p0+forward*projected+perpendicular*side*lift
    knee_angle=lambda v: math.atan2(v.x,v.z)
    thigh=math.degrees(knee_angle(elbow-p0)-knee_angle(p1-p0))
    lower=math.degrees(knee_angle(target-elbow)-knee_angle(p2-p1))
    # Normalize angles across atan2's wrap before interpolation.
    thigh=(thigh+180)%360-180
    lower=(lower+180)%360-180
    a,b,c=leg_names(label)
    return {a:rotation((0,1,0),thigh),b:rotation((0,1,0),lower-thigh),
            c:rotation((0,1,0),-lower)}


def bake_leg_support(keyposes):
    """Solve the ankles on every export frame while interpolating the body pose."""
    frames = {}
    keys = sorted(keyposes)
    for start,end in zip(keys,keys[1:]):
        (a,feet_a),(b,feet_b)=keyposes[start],keyposes[end]
        for frame in range(start,end+1):
            t=transition(start,end,frame)
            pose={}
            for joint,(axis,angle,offset) in a.items():
                _,target_angle,target_offset=b[joint]
                pose[joint]=rotation(axis,angle+(target_angle-angle)*t,
                                     Vector(offset).lerp(Vector(target_offset),t))
            translation=pose["Master"][2]
            for label in LEGS:
                origin=(0,0,0)
                ankle=Vector(feet_a.get(label,origin)).lerp(Vector(feet_b.get(label,origin)),t)
                pose.update(leg_pose(label,translation,ankle))
            frames[frame]=pose
    return frames


def animate(rig):
    def pose(shift=(0,0,0), feet=None, chest=0, head=0, jaw=0, tail=0, mane=0, yaw=0):
        return {
            "Master":rotation((0,1,0),0,shift), "Chest":rotation((0,1,0),chest),
            "Neck":rotation((0,0,1),yaw), "Head":rotation((0,1,0),head),
            "Jaw":rotation((0,1,0),jaw), "Tail.01":rotation((0,0,1),tail),
            "Tail.02":rotation((1,0,0),tail*.9),
            "Mane.L":rotation((1,0,0),mane), "Mane.R":rotation((1,0,0),-mane),
        }, feet or {}

    stand=pose()
    inhale=pose(shift=(0,0,.021),chest=2.3,head=-1.2,tail=9,mane=3,yaw=-2)
    exhale=pose(shift=(0,0,-.018),chest=-1.7,head=2.2,tail=-9,mane=-2,yaw=2)
    roar_prep=pose(shift=(.05,0,-.075),chest=-6,head=-7,tail=-12,mane=-4)
    roar=pose(shift=(.025,0,.065),chest=12,head=24,jaw=-31,tail=19,mane=9,yaw=-4)
    roar_peak=pose(shift=(.025,0,.057),chest=10,head=28,jaw=-34,tail=24,mane=8,yaw=4)
    load=pose(shift=(.13,0,-.16),feet={"Front.L":(.08,0,.09)},chest=-9,head=4,tail=-16,mane=-6)
    slash_up=pose(shift=(-.08,0,-.17),feet={"Front.L":(-.28,0,.36)},
                  chest=7,head=7,jaw=-17,tail=14,mane=6)
    slash=pose(shift=(-.17,0,-.21),feet={"Front.L":(-.49,0,.20)},
               chest=-10,head=2,jaw=-18,tail=20,mane=8)
    impact=pose(shift=(-.07,0,-.13),feet={"Front.L":(-.31,0,.015)},chest=-14,jaw=-8,tail=-12,mane=6)
    sting=pose(shift=(.11,0,-.105),chest=10,head=-17,jaw=-12,tail=17,mane=10,yaw=-9)
    stumble=pose(shift=(.135,0,-.155),feet={"Front.L":(.10,0,.12)},chest=9,head=-10,jaw=-6,tail=-21)
    bow=pose(shift=(-.04,0,-.55),feet={"Front.L":(-.22,0,.01),"Front.R":(-.17,0,.01)},
             chest=-15,head=-14,jaw=-7,tail=12,mane=-6)
    still=pose(shift=(-.06,0,-.607),feet={"Front.L":(-.23,0,.01),"Front.R":(-.18,0,.006)},
               chest=-20,head=-19,jaw=-1,tail=6,mane=-6)
    for label,duration,frames in (
        ("Idle",3,{0:stand,15:inhale,31:stand,45:exhale,60:stand}),
        ("Roar",1.6,{0:stand,6:roar_prep,12:roar,20:roar_peak,25:roar,32:stand}),
        ("Attack",1,{0:stand,3:load,7:slash_up,10:slash,14:impact,20:stand}),
        ("Hit",.5,{0:stand,3:sting,6:roar_prep,10:stand}),
        ("Defeat",1.8,{0:stand,8:stumble,15:roar_prep,24:bow,31:still,36:still}),
    ):
        clip(rig,label,duration,bake_leg_support(frames))


def build():
    root=new_asset("Foe")
    rig=skeleton(root)
    a=palette()
    casting=body(rig,a)
    head=face(rig,a)
    manes=mane_and_tail(rig,a)
    ornaments(rig,a)
    cracks(rig,a,casting)
    place_haze(rig)
    bone_parent(empty("Core",(-1.158,0,1.416)),rig,"Chest")
    bone_parent(empty("Mouth",(-1.881,0,1.721)),rig,"Head")
    castings=[casting,head,*manes]
    a.uv([o for o in root.children_recursive if o not in castings])
    sculpt_material=a.make_material("Cast bronze with recessed patina",0)
    bake_castings(castings,sculpt_material)
    animate(rig)
    root.scale=(.98,.98,.98)
    model=ROOT/"public"/"models"/"foes"/"suanni.glb"
    export(root,model)
    source=studio(2.62,root,"suanni",[
        ("front",(-.2,0,1.30),-math.pi/2,.065,3.46),
        ("three-quarter",(0,0,1.33),-math.pi*.225,.11,4.08),
        ("side",(0,0,1.31),0,.035,4.19),
        ("head",(-1.28,0,2.046),-math.pi*.316,.060,1.69),
        ("concept",(.015,0,1.29),-math.pi*.208,.037,3.80),
    ])
    return {"model":str(model),"source":str(source)}


if __name__=="__main__":
    result=build()
