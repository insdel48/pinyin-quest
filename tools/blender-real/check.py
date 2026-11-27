"""Check exported game contracts, and optionally capture Blender's exports in the game viewer."""
import argparse
from io import BytesIO
import json
from pathlib import Path
import struct
from urllib.parse import urlencode

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPECS = {
    "hero": dict(
        model="models/hero.glb", root="Hero", triangles=60000, yaw=-55, distance=3.12,
        attachments={"Muzzle":"hand_l", "Bracer":"hand_l"},
        action_frames={
            "Idle": (3, .50, 2.30), "Cast": (.7, .15, .35), "Hit": (.6, .15, .35),
            "Victory": (1.5, .35, 1.15), "Charge": (1, .15, .70),
        },
    ),
    "suanni": dict(
        model="models/foes/suanni.glb", root="Foe", triangles=60000, yaw=50, distance=7.4,
        attachments={"Core":"Chest", "Mouth":"Head", "Armor1":"Head", "Armor2":"Front.L",
                     "Armor3":"Front.R", "Armor4":"Chest", "Armor5":"Spine"},
        action_frames={
            "Idle": (3, .55, 2.25), "Roar": (1.6, .40, 1.05), "Attack": (1, .25, .50),
            "Hit": (.5, .15, .35), "Defeat": (1.8, .45, 1.75),
        },
    ),
}


def inspect(spec):
    path = ROOT / "public" / spec["model"]
    data = path.read_bytes()
    magic, version, length, json_bytes, chunk = struct.unpack_from("<4sIII4s", data)
    assert (magic, version, length, chunk) == (b"glTF", 2, len(data), b"JSON")
    assert length <= 8_000_000, f"{length} bytes exceeds the 8 MB budget"
    doc = json.loads(data[20:20+json_bytes])
    bin_start = 28 + json_bytes
    nodes, accessors = doc["nodes"], doc["accessors"]
    by_name = {n["name"]: n for n in nodes}
    scene = doc["scenes"][doc["scene"]]
    assert [nodes[i]["name"] for i in scene["nodes"]] == [spec["root"]]
    roots = [nodes[i] for i in scene["nodes"]]
    assert roots[0].get("translation", [0,0,0]) == [0,0,0]
    assert doc["skins"], "Expected a skeletal mesh"
    parents = {nodes[i]["name"]: node["name"] for node in nodes for i in node.get("children", ())}
    joint_indices = set().union(*(skin["joints"] for skin in doc["skins"]))
    joint_names = {nodes[i]["name"] for i in joint_indices}
    for child, parent in spec["attachments"].items():
        assert parents.get(child) == parent and parent in joint_names, (child, parents.get(child))
        is_mesh = child.startswith("Armor") or child == "Bracer"
        assert ("mesh" in by_name[child]) == is_mesh, child
    materials={m["name"]:m for m in doc["materials"]}
    if spec["root"] == "Hero":
        assert "jacket" in materials
        assert materials["Hair cards"].get("alphaMode") == "MASK"
        assert .25 < materials["Hair cards"].get("alphaCutoff",.5) < .66
        blink=[mesh for mesh in doc["meshes"] if "Blink" in mesh.get("extras",{}).get("targetNames",[])]
        assert len(blink)==1
        morphs=blink[0]["extras"]["targetNames"]
        assert blink[0]["weights"][morphs.index("Smile")]==1
        assert blink[0]["weights"][morphs.index("Blink")]==0
        assert materials["jacket"]["normalTexture"].get("texCoord")==1
        assert materials["Olive twill"]["normalTexture"].get("texCoord")==1
        assert "KHR_materials_clearcoat" in materials["MakeHuman high-poly brown eyes"]["extensions"]
        assert any("POSITION" in target for primitive in blink[0]["primitives"]
                   for target in primitive.get("targets",[]))
    else:
        assert materials["Violet haze"].get("alphaMode") == "BLEND"
        assert any("recessed patina" in name for name in materials)
    glow = [m for m in doc["materials"] if m.get("name") == "glow"]
    assert len(glow) == 1 and "emissiveTexture" in glow[0]
    for material in doc["materials"]:
        assert "baseColorTexture" in material["pbrMetallicRoughness"]
        if (material.get("alphaMode","OPAQUE") == "OPAQUE"
                and material["name"]!="MakeHuman high-poly brown eyes"):
            assert "metallicRoughnessTexture" in material["pbrMetallicRoughness"]
            assert "normalTexture" in material
            assert "occlusionTexture" in material
    primitives = [p for mesh in doc["meshes"] for p in mesh["primitives"]]
    assert all("KHR_draco_mesh_compression" in p.get("extensions", {}) for p in primitives)
    tris = sum(accessors[p["indices"]]["count"]//3 for p in primitives)
    assert tris <= spec["triangles"], f"{tris} triangles exceeds {spec['triangles']}"
    images = doc["images"]
    assert 0 < len(images) <= 10
    sizes = []
    for image in images:
        assert image["mimeType"]=="image/webp"
        view = doc["bufferViews"][image["bufferView"]]
        start = bin_start + view.get("byteOffset",0)
        with Image.open(BytesIO(data[start:start+view["byteLength"]])) as tex:
            assert max(tex.size) <= 2048
            sizes.append(tex.size)
    animations = {a["name"]:a for a in doc["animations"]}
    assert animations.keys() == spec["action_frames"].keys(), animations.keys()
    for name, (duration, _, _) in spec["action_frames"].items():
        anim = animations[name]
        times = [accessors[s["input"]] for s in anim["samplers"]]
        assert abs(min(t["min"][0] for t in times)) < 1e-5
        assert abs(max(t["max"][0] for t in times) - duration) < 1e-5, name
        if name in ("Idle","Charge"):
            for sampler in anim["samplers"]:
                out = accessors[sampler["output"]]
                view = doc["bufferViews"][out["bufferView"]]
                components = {"VEC3":3,"VEC4":4}[out["type"]]
                fmt = "<" + "f"*components
                start = bin_start + view.get("byteOffset",0) + out.get("byteOffset",0)
                end = start+4*components*(out["count"]-1)
                first, last = struct.unpack_from(fmt,data,start), struct.unpack_from(fmt,data,end)
                assert max(abs(a-b) for a,b in zip(first,last)) < 1e-4, (name, first, last)
    print(f"{path.name}: {tris:,} tris, {length:,} bytes, {len(images)} images {sizes}")
    print("  " + ", ".join(animations))


def instrument_viewer(route):
    response = route.fetch(timeout=6500, max_retries=1)
    body = response.text()
    marker = "window.__ready = true;"
    assert marker in body, "Viewer no longer has a readiness marker"
    body = body.replace(marker, "window.__assetCheck = {THREE, root, mixer, gltf, camera, ground}; " + marker)
    route.fulfill(response=response, body=body)


def check_poses(page, name):
    hero = name == "hero"
    data = page.evaluate("""(hero) => {
        const {THREE, root, mixer, gltf} = window.__assetCheck;
        const nodes = new Map();
        root.traverse(node => {
            nodes.set(node.name, node);
            if (node.userData.name) nodes.set(node.userData.name, node);
        });
        const pos = name => nodes.get(name).getWorldPosition(new THREE.Vector3()).toArray();
        const yaw = root.rotation.y;
        root.rotation.y = 0;
        root.updateMatrixWorld(true);
        root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
        const box = new THREE.Box3().setFromObject(root, true);
        const length = box.max.x-box.min.x;
        const height = box.max.y-box.min.y;
        const ground = box.min.y;
        const feet = hero ? ["foot_l","foot_r"] :
            ["FrontPaw.L","FrontPaw.R","HindPaw.L","HindPaw.R"];
        const stand = feet.map(pos);
        const moveName = hero ? "Cast" : "Attack";
        const weapon = hero ? "Muzzle" : "FrontPaw.L";
        const peakTime = hero ? .35 : .5;
        const swing = [];
        const supportDrift = {};
        for (const clip of gltf.animations) {
            const action = mixer.clipAction(clip).reset();
            action.setLoop(THREE.LoopOnce,1);
            action.clampWhenFinished = true;
            action.play();
            function sample(t) {
                mixer.setTime(t);
                root.updateMatrixWorld(true);
            }
            sample(peakTime);
            const peak = (hero ? 1 : -1)*pos(weapon)[0];
            const firstSupport = !hero && clip.name === "Defeat" ? 2 :
                !hero && clip.name === "Attack" ? 1 : 0;
            let drift = 0;
            for (let i=0;i<=40;i++) {
                sample(clip.duration*i/40);
                if (clip.name === moveName) swing.push((hero ? 1 : -1)*pos(weapon)[0]);
                drift = Math.max(drift, ...feet.slice(firstSupport).map((name,j) =>
                    Math.hypot(...pos(name).map((coord,k) => coord-stand[j+firstSupport][k]))));
            }
            supportDrift[clip.name] = drift;
            action.stop();
            if (clip.name === moveName) swing.push(peak);
        }
        const peak = swing.pop();
        root.rotation.y = yaw;
        return {height, length, ground, supportDrift, peak, maxSwing:Math.max(...swing)};
    }""", hero)
    expected_height = 1.22 if hero else 2.62
    assert abs(data["height"]-expected_height) <= .045, data
    if not hero:
        assert abs(data["length"]-3.8) < .12, data
    assert abs(data["ground"]) < .005, data
    assert max(data["supportDrift"].values()) < .005, data
    assert data["maxSwing"]-data["peak"] < .028, data
    print(f"{name} rest bounds, stance drift and attack peak · {data}")


def capture_blink(page, results):
    page.evaluate("""() => {
        const {THREE, root, camera} = window.__assetCheck;
        let blink = null;
        root.traverse(o => { if (o.morphTargetDictionary?.Blink !== undefined) blink = o; });
        if (blink === null) throw new Error("Blink morph is unavailable in three.js");
        const target = blink.geometry.morphAttributes.position[blink.morphTargetDictionary.Blink];
        const hero = root.getObjectByName("Hero");
        const side = new THREE.Vector3();
        const shift = new THREE.Vector3();
        const affected = [0,0];
        root.updateMatrixWorld(true);
        for (let i=0;i<target.count;i++) {
            shift.fromBufferAttribute(target,i);
            if (!blink.geometry.morphTargetsRelative) {
                side.fromBufferAttribute(blink.geometry.attributes.position,i);
                shift.sub(side);
            }
            if (shift.length() < .00015) continue;
            blink.getVertexPosition(i,side);
            blink.localToWorld(side);
            hero.worldToLocal(side);
            if (side.y<1.042 || side.y>1.155) throw new Error("Blink affects skin outside the eyes");
            affected[side.x>0 ? 1 : 0]++;
        }
        if (Math.min(...affected)<40 || Math.min(...affected)<Math.max(...affected)*.45) {
            throw new Error("Blink differs across the two eyelids: "+affected.join(", "));
        }
        window.__blinkPreview = blink;
        camera.position.set(0,1.122,.741);
        camera.lookAt(0,1.095,.027);
        document.getElementById("info").style.display="none";
    }""")
    next_frame="new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))"
    for state,value in (("open",0),("closed",1)):
        page.evaluate("""value => {
            const mesh = window.__blinkPreview;
            mesh.morphTargetInfluences[mesh.morphTargetDictionary.Blink] = value;
        }""",value)
        page.evaluate(next_frame)
        page.screenshot(path=results/f"hero-web-eyes-{state}.png")


def capture_scene_scale(page,server,asset,result):
    spec=SPECS[asset]
    angle=-60 if asset=="hero" else 52
    params={"m":spec["model"],"yaw":angle,"bg":"bg/c1.jpg","dist":5.4 if asset=="hero" else 7.4}
    proxy="**/viewer.html?html-proxy*"
    page.route(proxy,instrument_viewer)
    page.goto(f"{server.rstrip('/')}/pinyin-quest/viewer.html?{urlencode(params)}")
    page.wait_for_function("window.__ready === true",timeout=15000)
    pixels=page.evaluate("""asset => {
        const {THREE, root, camera, ground}=window.__assetCheck;
        ground.material=new THREE.ShadowMaterial({opacity:.22});
        document.getElementById("info").style.display="none";
        if(asset!=="hero") return null;
        root.updateMatrixWorld(true);
        root.traverse(o => { if(o.isSkinnedMesh) o.skeleton.update(); });
        const box=new THREE.Box3().setFromObject(root,true);
        const points=[new THREE.Vector3(),new THREE.Vector3()];
        function projectedHeight(){
            const bounds=[-Infinity,Infinity];
            root.traverse(mesh => {
                if(!mesh.isMesh || !mesh.visible) return;
                const pos=mesh.geometry.attributes.position;
                for(let i=0; i<pos.count; i++){
                    mesh.getVertexPosition(i,points[0]);
                    points[1].copy(points[0]).applyMatrix4(mesh.matrixWorld).project(camera);
                    bounds[0]=Math.max(bounds[0],points[1].y);
                    bounds[1]=Math.min(bounds[1],points[1].y);
                }
            });
            return (bounds[0]-bounds[1])*.5*innerHeight;
        }
        let distance=5.4;
        for(let i=0;i<3;i++){
            camera.position.set(0,1.12,distance);
            camera.lookAt(0,.92,0);
            camera.updateMatrixWorld(true);
            distance*=projectedHeight()/300;
        }
        return projectedHeight();
    }""",asset)
    if asset=="hero":
        assert abs(pixels-300)<3,pixels
        print(f"Hero scene height: {pixels:.2f} px, 30 degrees off front")
    page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
    page.screenshot(path=result)
    page.unroute(proxy,instrument_viewer)


def capture(names, server):
    from playwright.sync_api import sync_playwright

    results = ROOT/"art-work"/"real"
    results.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        try:
            page = browser.new_page(service_workers="block",viewport={"width":1100,"height":720}, device_scale_factor=1)
            errors = []
            page.on("pageerror",lambda error: errors.append(str(error)))
            for name in names:
                spec = SPECS[name]
                frames = [("rest", None)] + [(a,t) for a,(_,t0,t1) in spec["action_frames"].items()
                                             for t in (t0,t1)]
                proxy = "**/viewer.html?html-proxy*"
                page.route(proxy, instrument_viewer)
                for action, position in frames:
                    params = {"m":spec["model"],"yaw":spec["yaw"],"dist":spec["distance"]}
                    if position is not None:
                        params.update(a=action,t=position)
                    page.goto(f"{server.rstrip('/')}/pinyin-quest/viewer.html?{urlencode(params)}")
                    try:
                        page.wait_for_function("window.__ready === true",timeout=12000)
                    except Exception as error:
                        raise RuntimeError(f"Viewer failed: {page.url}, {errors}") from error
                    assert not errors, errors
                    info = page.locator("#info").inner_text()
                    assert all(a+"(" in info for a in spec["action_frames"]), info
                    page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
                    suffix = "" if position is None else f"-{position:.2f}s"
                    page.screenshot(path=results/f"{name}-web-{action}{suffix}.png")
                    if action == "rest" and name == "suanni":
                        page.evaluate("""() => {
                            const {root} = window.__assetCheck;
                            for (let i=1;i<=5;i++) root.getObjectByName("Armor"+i).visible = false;
                        }""")
                        page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
                        page.screenshot(path=results/"suanni-web-armor-hidden.png")
                    if action == "rest":
                        check_poses(page, name)
                        if name == "hero":
                            capture_blink(page, results)
                        page.unroute(proxy, instrument_viewer)
                print(f"{name} viewer · {info.replace(chr(10), ' · ')}")
                capture_scene_scale(page,server,name,results/f"{name}-third-game-scale.png")
        finally:
            browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", nargs="*", metavar="ASSET", help="hero or suanni (default: both)")
    parser.add_argument("--viewer", metavar="SERVER")
    args = parser.parse_args()
    assets = args.assets or list(SPECS)
    for asset in assets:
        if asset not in SPECS:
            parser.error(f"Unknown asset: {asset}")
        inspect(SPECS[asset])
    if args.viewer:
        capture(assets, args.viewer)


if __name__ == "__main__":
    main()
