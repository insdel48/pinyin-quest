// 3D 战斗场景：6 个场景、主角、5 种怪物、出招和命中效果。界面层只调用 World 的方法。
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { sfx } from "./audio";
import type { MonsterKind, OutfitId, SceneId } from "../core/types";

const INK = 0x2b2a26;
export const STAGE_W = 1280, STAGE_H = 800;
const FOE_X = 4.6, HERO_X = -4.6;

type Upd = (t: number, dt: number, hitK: number) => void;
interface SceneDef { name: string; sky: number; fog: [number, number]; light: [number, number]; night?: boolean; build: (g: THREE.Group, ctx: SceneCtx) => void }
interface SceneCtx { mists: THREE.Mesh[]; tick: Upd[] }
interface FoeDef { top: number; hitY: number; build: (f: THREE.Group, h: FoeHandle) => void }
interface FoeHandle { mats: THREE.MeshToonMaterial[]; eyes: THREE.Object3D[]; update: Upd }

const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- 材质和小工具 ----------
const grad = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
// 三阶色调的卡通材质；flatShading 参数被忽略（toon 材质不支持），要棱角感就用 facet() 处理几何体
const toon = (color: number, extra: THREE.MeshToonMaterialParameters & { flatShading?: boolean } = {}) => { const { flatShading: _f, ...rest } = extra; return new THREE.MeshToonMaterial({ color, gradientMap: grad, ...rest }); };
const facet = (geo: THREE.BufferGeometry) => { const g = geo.toNonIndexed(); g.computeVertexNormals(); return g; };
const lineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
function M(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m;
}
function outline<T extends THREE.Mesh>(mesh: T, s = 1.06): T { const o = new THREE.Mesh(mesh.geometry, lineMat); o.scale.setScalar(s); mesh.add(o); return mesh; }
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!); return new THREE.CanvasTexture(c);
}
const mistTex = canvasTex(256, 64, g => { const gr = g.createRadialGradient(128, 32, 4, 128, 32, 128); gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.scale(1, 0.5); g.fillRect(0, 0, 256, 128); });
const glowTex = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

const peakGeo = (r: number, h: number, seg: number) => new THREE.LatheGeometry([[1, 0], [0.82, 0.22], [0.55, 0.5], [0.3, 0.78], [0.12, 0.94], [0, 1]].map(([a, b]) => new THREE.Vector2(a * r, b * h)), seg);
function mountains(g: THREE.Group, o: { near: number; far: number; count?: number; z0?: number; zr?: number; h?: number; snow?: boolean }) {
  const near = new THREE.Color(o.near), far = new THREE.Color(o.far), z0 = o.z0 ?? 26, zr = o.zr ?? 46;
  for (let i = 0; i < (o.count ?? 20); i++) {
    const z = -z0 - rnd() * zr, x = (rnd() * 2 - 1) * (30 + (-z) * 0.6), h = (o.h ?? 6) + rnd() * 12 + (-z) * 0.12;
    if (Math.abs(x) < 8 && z > -34) continue;
    const k = Math.min(1, (-z - z0) / zr);
    const m = M(facet(peakGeo(h * (0.42 + rnd() * 0.2), h, 9)), toon(near.clone().lerp(far, k).getHex(), { flatShading: true }), x, 0, z, g);
    m.rotation.y = rnd() * 6; m.scale.x = 0.8 + rnd() * 0.6;
    if (o.snow) M(facet(peakGeo(h * 0.24, h * 0.36, 9)), toon(0xf6f6f2, { flatShading: true }), 0, h * 0.645, 0, m);
  }
}
function mist(g: THREE.Group, ctx: SceneCtx, list: [number, number, number, number][], tint = 0xf8f2e3) {
  for (const [x, y, z, w] of list) {
    const p = M(new THREE.PlaneGeometry(w, w * 0.22), new THREE.MeshBasicMaterial({ map: mistTex, color: tint, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }), x, y, z, g);
    p.userData.x0 = x; p.userData.sp = 0.3 + rnd() * 0.5; ctx.mists.push(p);
  }
}
const disc = (g: THREE.Group, color: number, x: number, y: number, z: number, r: number, opacity = 0.86) => M(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity }), x, y, z, g);
const groundPlane = (g: THREE.Group, color: number) => { const m = M(new THREE.PlaneGeometry(260, 260), toon(color), 0, 0, 0, g); m.rotation.x = -Math.PI / 2; return m; };
const patch = (g: THREE.Group, color: number, x: number, z: number, rx: number, rz: number, y = 0.01) => { const d = M(new THREE.CircleGeometry(1, 40), toon(color), x, y, z, g); d.rotation.x = -Math.PI / 2; d.scale.set(rx, rz, 1); return d; };
function prism(len: number, r: number, mat: THREE.Material) { const geo = new THREE.CylinderGeometry(r, r, len, 3); geo.rotateZ(Math.PI / 2); geo.rotateX(-Math.PI / 2); return new THREE.Mesh(geo, mat); }
function house(g: THREE.Group, x: number, z: number, w: number, d: number, h: number, ry = 0) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; g.add(grp);
  outline(M(new THREE.BoxGeometry(w, h, d), toon(0xf3efe6), 0, h / 2, 0, grp), 1.02);
  const roof = prism(w * 1.12, d * 0.62, toon(0x34332f)); roof.position.y = h + d * 0.18; roof.scale.y = 0.62; grp.add(roof);
  for (let i = 0; i < Math.max(1, Math.floor(w / 1.6)); i++) M(new THREE.BoxGeometry(0.4, 0.5, 0.05), toon(0x3c3a35), -w / 2 + 0.9 + i * 1.6, h * 0.55, d / 2 + 0.01, grp);
}
function rocks(g: THREE.Group, list: [number, number, number][], color = 0x8b9189) {
  for (const [x, z, s] of list) { const r = outline(M(new THREE.DodecahedronGeometry(s, 0), toon(color, { flatShading: true }), x, s * 0.45, z, g), 1.08); r.rotation.set(rnd(), rnd() * 3, rnd()); r.scale.y = 0.7; }
}
function tube(g: THREE.Object3D, pts: [number, number, number][], r: number, mat: THREE.Material, withLine = false) {
  const c = new THREE.CatmullRomCurve3(pts.map(p => V(...p)));
  const m = M(new THREE.TubeGeometry(c, 30, r, 8), mat, 0, 0, 0, g);
  if (withLine) M(new THREE.TubeGeometry(c, 30, r * 1.35, 8), lineMat, 0, 0, 0, g);
  return m;
}

// ---------- 6 个场景 ----------
export const SCENES: Record<SceneId, SceneDef> = {
  shanye: { name: "山野松林", sky: 0xefe6d3, fog: [22, 80], light: [0.85, 0.85], build(g, ctx) {
    groundPlane(g, 0xb3c1b0);
    patch(g, 0x8fa595, HERO_X, 0.3, 2.6, 2.2); patch(g, 0x8fa595, FOE_X, 0.4, 2.8, 2.4);
    mountains(g, { near: 0x58766a, far: 0xc4cfc0 });
    disc(g, 0xc0533c, 22, 9, -85, 4.4);
    mist(g, ctx, [[-14, 3, -22, 34], [10, 2.2, -18, 30], [0, 5, -36, 50], [-20, 4, -44, 50], [18, 6, -50, 50]]);
    const mound = M(new THREE.SphereGeometry(4, 24, 12), toon(0x8ea393), -11, 0, -20, g); mound.scale.set(1.6, 0.5, 1.2);
    const pag = new THREE.Group(); pag.position.set(-11, 1.7, -20); g.add(pag);
    for (let i = 0; i < 5; i++) { const s = 1 - i * 0.14, y = i * 0.95; M(new THREE.BoxGeometry(1.3 * s, 0.75, 1.3 * s), toon(0x6f8579), 0, y + 0.38, 0, pag); M(new THREE.ConeGeometry(1.35 * s, 0.38, 4), toon(0x3e4d47), 0, y + 0.86, 0, pag).rotation.y = Math.PI / 4; }
    const pine = new THREE.Group(); pine.position.set(-11.5, 0, -6); pine.rotation.y = 0.3; g.add(pine);
    tube(pine, [[0, 0, 0], [0.3, 1.6, 0], [-0.2, 3.2, 0.1], [0.6, 4.6, 0], [1.8, 5.4, 0]], 0.22, toon(0x4a3a2c), true);
    for (const [x, y, z, s] of [[1.9, 5.5, 0, 1.5], [0.4, 4.7, 0.2, 1.2], [-0.6, 3.6, 0, 1.1], [2.9, 5.1, 0.1, 1.0], [0.9, 2.6, 0.3, 0.9]]) outline(M(new THREE.CylinderGeometry(s, s * 1.15, 0.38, 9), toon(0x34574c), x, y, z, pine), 1.07).rotation.z = (rnd() - 0.5) * 0.3;
    rocks(g, [[-7.4, 0.6, 0.5], [7.8, 1.2, 0.6], [-1.6, -3.5, 0.4], [10, -4, 1.1]]);
  } },
  zhulin: { name: "竹林小径", sky: 0xe6e9d6, fog: [14, 52], light: [0.9, 0.75], build(g, ctx) {
    groundPlane(g, 0xb9c6a3);
    for (let i = 0; i < 9; i++) patch(g, 0xd9d3c0, -6 + i * 1.5 + (rnd() - 0.5) * 0.4, 1.2 + Math.sin(i) * 0.5, 0.6, 0.45, 0.02);
    mountains(g, { near: 0x8fa58a, far: 0xd3dac6, count: 12 });
    const stalkMat = toon(0x7ea36f), nodeMat = toon(0x4f7347), leafMat = toon(0x4d7a52);
    const bamboo = (x: number, z: number, h: number, lean: number) => {
      const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.z = lean; grp.rotation.x = (rnd() - 0.5) * 0.08; g.add(grp);
      outline(M(new THREE.CylinderGeometry(0.11, 0.14, h, 8), stalkMat, 0, h / 2, 0, grp), 1.12);
      for (let y = 1.1; y < h; y += 1.15) M(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 8), nodeMat, 0, y, 0, grp);
      for (let k = 0; k < 7; k++) { const lf = M(new THREE.ConeGeometry(0.09, 0.95, 4), leafMat, (rnd() - 0.5) * 0.6, h - 1.6 + rnd() * 1.6, (rnd() - 0.5) * 0.4, grp); lf.rotation.z = (rnd() < 0.5 ? 1 : -1) * (0.9 + rnd() * 0.8); lf.scale.z = 0.25; }
    };
    for (let i = 0; i < 70; i++) { const z = -2 - rnd() * 30, side = rnd() < 0.5 ? -1 : 1, x = side * (2.5 + rnd() * 16); if (z > -6 && Math.abs(x) < 7.5) continue; bamboo(x, z, 7 + rnd() * 6, (rnd() - 0.5) * 0.12); }
    [-9.6, -8.4, 8.8, 10.2].forEach((x, i) => bamboo(x, 1 + (i % 2), 9 + rnd() * 3, x < 0 ? 0.06 : -0.06));
    const lamp = new THREE.Group(); lamp.position.set(-7.4, 0, -1); g.add(lamp);
    const stone = toon(0x9a988e, { flatShading: true });
    outline(M(new THREE.CylinderGeometry(0.2, 0.28, 1.1, 6), stone, 0, 0.55, 0, lamp), 1.08);
    outline(M(new THREE.BoxGeometry(0.6, 0.5, 0.6), stone, 0, 1.35, 0, lamp), 1.06);
    M(new THREE.BoxGeometry(0.3, 0.26, 0.62), new THREE.MeshBasicMaterial({ color: 0xf2d79a }), 0, 1.35, 0, lamp);
    outline(M(new THREE.ConeGeometry(0.6, 0.45, 4), stone, 0, 1.82, 0, lamp), 1.06).rotation.y = Math.PI / 4;
    mist(g, ctx, [[-10, 1.5, -10, 30], [8, 2.5, -14, 30], [0, 4, -24, 50], [0, 1, -6, 20]], 0xf4f4e6);
    for (let i = 0; i < 5; i++) { const ray = M(new THREE.PlaneGeometry(1.2, 14), new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.18, depthWrite: false, fog: false, side: THREE.DoubleSide }), -6 + i * 3.4, 6, -8 - i * 2, g); ray.rotation.z = 0.35; }
  } },
  shuixiang: { name: "江南水乡", sky: 0xece9df, fog: [20, 75], light: [0.85, 0.8], build(g, ctx) {
    groundPlane(g, 0xcac4b5);
    const water = M(new THREE.PlaneGeometry(260, 60), toon(0x9fb7b6), 0, 0.02, -33, g); water.rotation.x = -Math.PI / 2;
    const ripples: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) { const s = M(new THREE.PlaneGeometry(1.5 + rnd() * 3, 0.06), new THREE.MeshBasicMaterial({ color: 0xe8efe9, transparent: true, opacity: 0.7 }), (rnd() - 0.5) * 30, 0.04, -5 - rnd() * 16, g); s.rotation.x = -Math.PI / 2; ripples.push(s); }
    outline(M(new THREE.BoxGeometry(60, 0.5, 0.6), toon(0xa9a395), 0, 0.25, -3, g), 1.01);
    mountains(g, { near: 0x9fb0a6, far: 0xd6dbd2, count: 14, z0: 40, h: 4 });
    const houses: [number, number, number, number, number, number][] = [[-12, -12, 5, 3, 3.2, 0.1], [-6.5, -13, 4, 3, 2.6, 0], [-16, -9, 3.6, 2.6, 2.8, 0.3], [7.5, -13, 5, 3, 3.4, -0.05], [13, -11, 4, 3, 2.8, -0.2], [17, -15, 5, 3, 3, 0], [-1, -24, 6, 3, 3.4, 0], [5, -26, 4, 3, 2.8, 0]];
    for (const [x, z, w, d, hh, ry] of houses) house(g, x, z, w, d, hh, ry);
    outline(M(new THREE.TorusGeometry(2.8, 0.32, 8, 28, Math.PI), toon(0xb3ad9f), 0.5, 0, -10, g), 1.04).scale.z = 4;
    const boat = new THREE.Group(); boat.position.set(4.5, 0.1, -6.5); boat.rotation.y = -0.3; g.add(boat);
    outline(M(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(0x5a4632), 0, 0.15, 0, boat), 1.06).scale.set(2.2, 0.5, 0.65);
    const awn = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 14, 1, true, -Math.PI / 2, Math.PI); awn.rotateZ(Math.PI / 2);
    M(awn, toon(0x2f2d29, { side: THREE.DoubleSide }), 0, 0.15, 0, boat);
    const willow = new THREE.Group(); willow.position.set(-10.5, 0, -2); g.add(willow);
    tube(willow, [[0, 0, 0], [0.2, 2, 0], [-0.3, 3.6, 0], [0.4, 4.6, 0]], 0.25, toon(0x4a3a2c), true);
    const strand = new THREE.MeshBasicMaterial({ color: 0x6f9468 });
    for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * 2.2, len = 1.6 + rnd() * 2.4; M(new THREE.CylinderGeometry(0.025, 0.025, len, 4), strand, Math.cos(a) * r + 0.2, 4.7 - len / 2 - r * 0.25, Math.sin(a) * r * 0.6, willow); }
    mist(g, ctx, [[-12, 2, -18, 30], [12, 3, -22, 34], [0, 6, -40, 60]]);
    ctx.tick.push(t => { boat.position.y = 0.1 + Math.sin(t * 1.2) * 0.05; ripples.forEach((r, i) => { (r.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(t * 1.3 + i) * 0.3; }); });
  } },
  hetang: { name: "荷塘", sky: 0xf1ebd9, fog: [20, 72], light: [0.9, 0.85], build(g, ctx) {
    groundPlane(g, 0x9dbaae);
    const plank = toon(0x9b7650);
    for (const [x, z] of [[HERO_X, 0.3], [FOE_X, 0.4]]) for (let i = 0; i < 6; i++) outline(M(new THREE.BoxGeometry(0.48, 0.22, 3.2), plank, x - 1.25 + i * 0.5, 0.11, z, g), 1.03);
    const leafMat = toon(0x5f8f5b, { side: THREE.DoubleSide }), leafMat2 = toon(0x4c7a4b, { side: THREE.DoubleSide });
    for (let i = 0; i < 60; i++) {
      const x = (rnd() - 0.5) * 34, z = 3 - rnd() * 26;
      if ((Math.abs(x - HERO_X) < 2 || Math.abs(x - FOE_X) < 2) && z > -2.5) continue; if (Math.abs(x) < 3 && z > -1) continue;
      const r = 0.5 + rnd() * 0.9, tall = rnd() < 0.3;
      const leaf = M(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, 0.6), rnd() < 0.5 ? leafMat : leafMat2, x, tall ? 0.6 + rnd() * 0.8 : 0.05, z, g);
      leaf.scale.y = 0.35; leaf.rotation.set((rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4);
      if (tall) M(new THREE.CylinderGeometry(0.03, 0.03, leaf.position.y, 4), leafMat2, x, leaf.position.y / 2, z, g);
    }
    const petal = toon(0xe8a6aa), petal2 = toon(0xf6d7d6);
    for (const [x, z] of [[-2.6, -2.5], [7.4, -3.5], [-8, -5], [2.4, -6.5], [10, -1.2], [-9.8, 1.6]]) {
      const f = new THREE.Group(); f.position.set(x, 0, z); g.add(f); const h = 0.9 + rnd() * 0.7;
      M(new THREE.CylinderGeometry(0.035, 0.035, h, 4), leafMat2, 0, h / 2, 0, f);
      for (let k = 0; k < 7; k++) { const p = M(new THREE.SphereGeometry(0.22, 10, 8), k % 2 ? petal : petal2, Math.sin(k * 0.9) * 0.12, h + 0.12, Math.cos(k * 0.9) * 0.12, f); p.scale.set(0.55, 1.1, 0.3); p.rotation.y = k * 0.9; p.rotation.x = 0.45; }
      M(new THREE.SphereGeometry(0.09, 8, 6), toon(0xe3c25a), 0, h + 0.2, 0, f);
    }
    const pav = new THREE.Group(); pav.position.set(8.5, 0, -14); g.add(pav);
    outline(M(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 6), toon(0xc9c1ae), 0, 0.25, 0, pav), 1.03);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; M(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 6), toon(0x8e3b30), Math.cos(a) * 1.9, 1.7, Math.sin(a) * 1.9, pav); }
    outline(M(new THREE.ConeGeometry(3.0, 1.5, 6), toon(0x34332f), 0, 3.6, 0, pav), 1.03);
    M(new THREE.SphereGeometry(0.18, 8, 6), toon(0x34332f), 0, 4.45, 0, pav);
    mountains(g, { near: 0x8fae9a, far: 0xd2dccd, count: 16, z0: 30 });
    disc(g, 0xd8743f, -24, 8, -85, 3.8, 0.8);
    mist(g, ctx, [[-12, 2, -20, 34], [12, 2.6, -26, 36], [0, 5, -40, 60]]);
  } },
  xueshan: { name: "雪山古寺", sky: 0xe6eaec, fog: [20, 76], light: [0.95, 0.7], build(g, ctx) {
    groundPlane(g, 0xf1f1ec);
    patch(g, 0xdfe3e2, HERO_X, 0.3, 2.4, 2); patch(g, 0xdfe3e2, FOE_X, 0.4, 2.6, 2.2);
    mountains(g, { near: 0x7f8b8f, far: 0xc9d2d6, snow: true, h: 8 });
    const tmp = new THREE.Group(); tmp.position.set(-8.5, 0, -12); tmp.rotation.y = 0.35; g.add(tmp);
    for (let i = 0; i < 4; i++) outline(M(new THREE.BoxGeometry(6 - i * 0.5, 0.3, 1), toon(0xb9b7b0), 0, 0.15 + i * 0.3, 3.2 - i * 0.55, tmp), 1.02);
    outline(M(new THREE.BoxGeometry(6, 0.6, 4.2), toon(0xb9b7b0), 0, 0.3, 0, tmp), 1.02);
    outline(M(new THREE.BoxGeometry(4.8, 2.6, 3.2), toon(0xa8483a), 0, 1.9, 0, tmp), 1.02);
    M(new THREE.BoxGeometry(1.1, 1.7, 0.06), toon(0x5d2a22), 0, 1.45, 1.62, tmp);
    const roof = prism(6.2, 2.6, toon(0x34332f)); roof.position.y = 3.6; roof.scale.y = 0.55; tmp.add(roof);
    const snowRoof = prism(6.1, 2.55, toon(0xf7f7f3)); snowRoof.position.y = 3.72; snowRoof.scale.set(1, 0.5, 0.92); tmp.add(snowRoof);
    M(new THREE.BoxGeometry(1.8, 1.0, 1.6), toon(0xa8483a), 0, 4.3, 0, tmp);
    const roof2 = prism(3.2, 1.4, toon(0x34332f)); roof2.position.y = 4.9; roof2.scale.y = 0.6; tmp.add(roof2);
    const plum = new THREE.Group(); plum.position.set(10, 0, -3); g.add(plum);
    const bark = toon(0x3a2e27);
    tube(plum, [[0, 0, 0], [-0.3, 1.8, 0], [0.4, 3, 0], [-0.6, 4.2, 0.2]], 0.2, bark, true);
    tube(plum, [[0.2, 2.6, 0], [1.2, 3.4, 0.1], [2.2, 3.6, 0]], 0.1, bark);
    tube(plum, [[-0.2, 3.4, 0], [-1.4, 4.0, 0], [-2.2, 4.8, 0.2]], 0.09, bark);
    const bloom = toon(0xc9413d), snowM = toon(0xffffff);
    for (let i = 0; i < 60; i++) M(new THREE.SphereGeometry(0.08 + rnd() * 0.06, 6, 5), rnd() < 0.8 ? bloom : snowM, (rnd() - 0.5) * 4.4, 2.6 + rnd() * 2.4, (rnd() - 0.5) * 1.0, plum);
    rocks(g, [[-7.6, 0.8, 0.55], [7.4, 1.5, 0.5]], 0xb7bcbd);
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * 40; pos[i * 3 + 1] = rnd() * 16; pos[i * 3 + 2] = 6 - rnd() * 30; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, map: glowTex, transparent: true, depthWrite: false })));
    ctx.tick.push((t, dt) => { const p = geo.attributes.position as THREE.BufferAttribute; const f = dt * 60; for (let i = 0; i < p.count; i++) { let y = p.getY(i) - (0.02 + (i % 5) * 0.003) * f; if (y < 0) y = 16; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t + i) * 0.004 * f); } p.needsUpdate = true; });
    mist(g, ctx, [[-12, 2.5, -24, 36], [12, 3.5, -30, 40], [0, 7, -46, 60]], 0xffffff);
  } },
  denghui: { name: "灯会古城", sky: 0x262c3e, fog: [18, 70], light: [0.5, 0.45], night: true, build(g, ctx) {
    groundPlane(g, 0x3e4252);
    patch(g, 0x6a4a3e, HERO_X, 0.3, 2.6, 2.2); patch(g, 0x6a4a3e, FOE_X, 0.4, 2.8, 2.4);
    for (let i = 0; i < 12; i++) patch(g, 0x4a4e5e, -12 + i * 2.2, -1.5 + (i % 2), 1, 0.7, 0.015);
    disc(g, 0xf3ecd6, -26, 8.5, -80, 3.6, 0.95);
    const wallMat = toon(0x585d70, { flatShading: true });
    outline(M(new THREE.BoxGeometry(70, 4, 2.4), wallMat, 0, 2, -16, g), 1.005);
    for (let x = -34; x <= 34; x += 1.4) M(new THREE.BoxGeometry(0.7, 0.6, 2.4), wallMat, x, 4.3, -16, g);
    const tower = new THREE.Group(); tower.position.set(2, 4, -16); g.add(tower);
    outline(M(new THREE.BoxGeometry(7, 2.4, 3), toon(0x8e3b30), 0, 1.2, 0, tower), 1.02);
    for (let i = 0; i < 5; i++) M(new THREE.BoxGeometry(0.6, 0.8, 0.05), new THREE.MeshBasicMaterial({ color: 0xf2c46a }), -2.4 + i * 1.2, 1.3, 1.53, tower);
    const r1 = prism(8.6, 2.4, toon(0x22232b)); r1.position.y = 2.9; r1.scale.y = 0.55; tower.add(r1);
    M(new THREE.BoxGeometry(5, 1.4, 2.2), toon(0x8e3b30), 0, 3.8, 0, tower);
    const r2 = prism(6.2, 1.8, toon(0x22232b)); r2.position.y = 4.9; r2.scale.y = 0.55; tower.add(r2);
    M(new THREE.BoxGeometry(3, 3.4, 0.2), new THREE.MeshBasicMaterial({ color: 0x1a1c24 }), 2, 1.5, -14.75, g);
    const lanMat = new THREE.MeshBasicMaterial({ color: 0xe0533c }), capMat = new THREE.MeshBasicMaterial({ color: 0x2a2320 });
    const lamps: THREE.Sprite[] = [];
    for (const [x1, y1, z1, x2, y2, z2] of [[-14, 5.5, -9, 14, 5.0, -9], [-14, 4.6, -4, 14, 4.8, -5]]) {
      const pts: THREE.Vector3[] = []; for (let k = 0; k <= 20; k++) { const t = k / 20; pts.push(V(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t - Math.sin(t * Math.PI) * 0.9, z1 + (z2 - z1) * t)); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
      for (let k = 1; k < 20; k += 2) { const p = pts[k]; M(new THREE.SphereGeometry(0.28, 14, 10), lanMat, p.x, p.y - 0.4, p.z, g).scale.y = 1.15; M(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 8), capMat, p.x, p.y - 0.08, p.z, g); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a5a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 })); s.position.set(p.x, p.y - 0.4, p.z); s.scale.set(2, 2, 1); g.add(s); lamps.push(s); }
    }
    const stars = new Float32Array(300 * 3); for (let i = 0; i < 300; i++) { stars[i * 3] = (rnd() - 0.5) * 200; stars[i * 3 + 1] = 12 + rnd() * 50; stars[i * 3 + 2] = -70 - rnd() * 20; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe8e4d4, size: 0.35, fog: false, map: glowTex, transparent: true, depthWrite: false })));
    mist(g, ctx, [[-12, 1.5, -12, 30], [12, 2, -14, 30]], 0x5a6178);
    ctx.tick.push(t => lamps.forEach((l, i) => { l.material.opacity = 0.6 + Math.sin(t * 3 + i) * 0.12; }));
  } },
};

// ---------- 5 种怪物 ----------
function eyes(parent: THREE.Object3D, xs: number[], y: number, z: number, r: number) {
  const white = toon(0xf3ead8), pup = new THREE.MeshBasicMaterial({ color: INK });
  return xs.map(x => { const e = new THREE.Group(); e.position.set(x, y, z); M(new THREE.SphereGeometry(r, 18, 12), white, 0, 0, 0, e).scale.set(1, 1.15, 0.55); M(new THREE.SphereGeometry(r * 0.42, 12, 8), pup, -r * 0.3, -r * 0.1, r * 0.48, e); parent.add(e); return e; });
}
const sealTex = canvasTex(128, 128, g => { g.strokeStyle = "#c0533c"; g.lineWidth = 10; g.lineCap = "round"; g.strokeRect(14, 14, 100, 100); g.beginPath(); g.moveTo(38, 42); g.lineTo(90, 42); g.moveTo(64, 42); g.lineTo(64, 88); g.moveTo(38, 88); g.lineTo(90, 88); g.stroke(); });

export const FOES: Record<MonsterKind, FoeDef> = {
  blob: { top: 3.5, hitY: 1.6, build(f, h) {
    const geo = new THREE.SphereGeometry(1.25, 40, 26); const base = (geo.attributes.position.array as Float32Array).slice();
    const mat = toon(INK); h.mats.push(mat);
    M(geo, mat, 0, 1.4, 0, f);
    tube(f, [[1.0, 1.0, 0], [1.8, 1.3, -0.2], [2.1, 2.2, -0.3], [1.7, 2.7, -0.2]], 0.14, mat);
    tube(f, [[-0.8, 2.3, 0], [-1.3, 3.0, 0.1], [-1.0, 3.5, 0.2]], 0.09, mat);
    h.eyes = eyes(f, [-0.42, 0.42], 1.7, 1.08, 0.27);
    M(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: sealTex, transparent: true }), 0, 1.0, 1.22, f).rotation.x = -0.25;
    h.update = (t, _dt, hitK) => {
      const pos = geo.attributes.position as THREE.BufferAttribute, amp = reduce ? 0 : 1;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        const n = amp * (0.07 * Math.sin(3 * x + t * 1.7) + 0.06 * Math.sin(4 * y + t * 2.3) + 0.05 * Math.sin(5 * z + t * 1.3) + hitK * 0.18 * Math.sin(9 * x + 7 * y + t * 20));
        const flat = y < -0.75 ? 1 + (y + 0.75) * 0.25 : 1;
        pos.setXYZ(i, x * (1 + n), y * (1 + n) * flat, z * (1 + n));
      }
      pos.needsUpdate = true; geo.computeVertexNormals();
    };
  } },
  lantern: { top: 4.3, hitY: 2.1, build(f, h) {
    const body = new THREE.Group(); body.position.y = 2.1; f.add(body);
    const paper = toon(0xc4483a); h.mats.push(paper);
    outline(M(new THREE.SphereGeometry(1.05, 28, 20), paper, 0, 0, 0, body), 1.04).scale.set(1, 1.18, 1);
    const rib = toon(0x7a2a22);
    for (let k = -2; k <= 2; k++) { const y = k * 0.38, r = Math.sqrt(Math.max(0, 1 - (y / 1.24) ** 2)) * 1.06; M(new THREE.TorusGeometry(r, 0.025, 6, 40), rib, 0, y, 0, body).rotation.x = Math.PI / 2; }
    const gold = toon(0x3a2f25);
    outline(M(new THREE.CylinderGeometry(0.5, 0.6, 0.22, 16), gold, 0, 1.26, 0, body), 1.08);
    outline(M(new THREE.CylinderGeometry(0.6, 0.5, 0.22, 16), gold, 0, -1.26, 0, body), 1.08);
    M(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), gold, 0, 2.1, 0, body);
    const tas = M(new THREE.CylinderGeometry(0.1, 0.18, 0.8, 8), toon(0xd8a24a), 0, -1.8, 0, body);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 })); glow.scale.set(4, 4, 1); body.add(glow);
    h.eyes = eyes(body, [0], 0.25, 1.12, 0.34);
    M(new THREE.TorusGeometry(0.22, 0.04, 6, 16, Math.PI), toon(INK), 0, -0.3, 1.1, body).rotation.z = Math.PI;
    h.update = t => { if (!reduce) { body.position.y = 2.1 + Math.sin(t * 1.5) * 0.15; body.rotation.z = Math.sin(t * 1.1) * 0.05; tas.rotation.z = Math.sin(t * 2.1) * 0.25; } };
  } },
  kite: { top: 4.6, hitY: 2.8, build(f, h) {
    const body = new THREE.Group(); body.position.y = 2.7; f.add(body);
    const s = new THREE.Shape();
    s.moveTo(0, 0.75); s.quadraticCurveTo(0.28, 0.62, 0.32, 0.3); s.lineTo(1.75, 0.5); s.quadraticCurveTo(1.05, -0.08, 0.36, -0.06); s.lineTo(0.5, -1.15); s.lineTo(0, -0.5); s.lineTo(-0.5, -1.15); s.lineTo(-0.36, -0.06); s.quadraticCurveTo(-1.05, -0.08, -1.75, 0.5); s.lineTo(-0.32, 0.3); s.quadraticCurveTo(-0.28, 0.62, 0, 0.75);
    const dark = toon(0x2b2a26, { side: THREE.DoubleSide }); h.mats.push(dark);
    const kb = new THREE.Group(); kb.scale.set(1.25, 1.25, 1); body.add(kb);
    outline(M(new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }), dark, 0, 0, 0, kb), 1.03);
    M(new THREE.CircleGeometry(0.32, 24), toon(0xf3ead8), 0, 0.05, 0.08, kb).scale.set(0.9, 1.3, 1);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) M(new THREE.BoxGeometry(0.42, 0.06, 0.02), toon(0xc0533c), sx * (0.75 + k * 0.32), 0.3 + k * 0.08, 0.08, kb).rotation.z = sx * 0.18;
    h.eyes = eyes(kb, [-0.16, 0.16], 0.52, 0.1, 0.11);
    const tailL = M(new THREE.PlaneGeometry(0.08, 1.6), toon(0xc0533c, { side: THREE.DoubleSide }), -0.3, -1.9, 0.02, body), tailR = M(new THREE.PlaneGeometry(0.08, 1.6), toon(0xc0533c, { side: THREE.DoubleSide }), 0.3, -1.9, 0.02, body);
    body.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, -0.2, 0), V(1.8, -2.9, -3)]), new THREE.LineBasicMaterial({ color: 0x3a3833 })));
    h.update = t => { if (!reduce) { body.rotation.z = Math.sin(t * 1.8) * 0.12; body.position.y = 2.7 + Math.sin(t * 1.2) * 0.25; body.position.x = Math.sin(t * 0.7) * 0.25; tailL.rotation.z = Math.sin(t * 4) * 0.3; tailR.rotation.z = -Math.sin(t * 4 + 1) * 0.3; } };
  } },
  lion: { top: 3.9, hitY: 2.0, build(f, h) {
    const stone = toon(0xa19e95, { flatShading: true }), dark = toon(0x7e7b73, { flatShading: true }); h.mats.push(stone, dark);
    outline(M(new THREE.BoxGeometry(2.4, 0.6, 1.8), dark, 0, 0.3, 0, f), 1.03);
    outline(M(new THREE.SphereGeometry(0.9, 10, 8), stone, 0, 1.35, -0.1, f), 1.05).scale.set(1.05, 1, 0.9);
    for (const x of [-0.55, 0.55]) outline(M(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 8), stone, x, 0.95, 0.45, f), 1.08);
    const head = new THREE.Group(); head.position.set(0, 2.45, 0.35); f.add(head);
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; outline(M(new THREE.SphereGeometry(0.28, 8, 6), dark, Math.cos(a) * 0.78, Math.sin(a) * 0.78, -0.12, head), 1.08); }
    outline(M(new THREE.SphereGeometry(0.72, 12, 10), stone, 0, 0, 0, head), 1.05);
    M(new THREE.SphereGeometry(0.26, 10, 8), dark, 0, -0.18, 0.62, head);
    for (const x of [-0.28, 0.28]) M(new THREE.BoxGeometry(0.34, 0.08, 0.1), toon(INK), x, 0.32, 0.6, head).rotation.z = x > 0 ? -0.3 : 0.3;
    h.eyes = eyes(head, [-0.27, 0.27], 0.12, 0.6, 0.15);
    const ball = outline(M(new THREE.SphereGeometry(0.38, 14, 10), toon(0xc0533c), 0.95, 0.95, 0.75, f), 1.06);
    for (let k = 0; k < 3; k++) M(new THREE.TorusGeometry(0.385, 0.03, 6, 24), toon(0xe3c25a), 0.95, 0.95, 0.75, f).rotation.y = k * 1.05;
    h.update = t => { if (!reduce) { head.rotation.z = Math.sin(t * 0.9) * 0.06; ball.rotation.y = t; } };
  } },
  ding: { top: 4.7, hitY: 2.1, build(f, h) {
    const bronze = toon(0x5c7563), patina = toon(0x86a08b), deep = toon(0x3f5246); h.mats.push(bronze, patina);
    for (const [x, z] of [[-0.75, 0.4], [0.75, 0.4], [0, -0.75]]) outline(M(new THREE.CylinderGeometry(0.16, 0.24, 1.3, 8), deep, x, 0.65, z, f), 1.08);
    outline(M(new THREE.CylinderGeometry(1.5, 1.15, 1.7, 28), bronze, 0, 2.05, 0, f), 1.03);
    M(new THREE.CylinderGeometry(1.42, 1.34, 0.28, 28), patina, 0, 2.55, 0, f);
    outline(M(new THREE.TorusGeometry(1.5, 0.12, 8, 36), deep, 0, 2.92, 0, f), 1.05).rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) outline(M(new THREE.TorusGeometry(0.4, 0.09, 8, 20), deep, sx * 0.95, 3.35, 0, f), 1.08);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf0b04a });
    for (const x of [-0.45, 0.45]) { M(new THREE.SphereGeometry(0.17, 12, 10), eyeMat, x, 2.05, 1.38, f).scale.z = 0.4; M(new THREE.BoxGeometry(0.5, 0.1, 0.1), toon(INK), x, 2.32, 1.38, f).rotation.z = x > 0 ? -0.35 : 0.35; }
    M(new THREE.BoxGeometry(0.9, 0.08, 0.1), toon(INK), 0, 1.6, 1.3, f);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; M(new THREE.BoxGeometry(0.12, 0.3, 0.12), deep, Math.sin(a) * 1.28, 1.35, Math.cos(a) * 1.28, f).rotation.y = a; }
    const smoke = [0, 1, 2].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: 0x3c3a36, transparent: true, depthWrite: false, opacity: 0.35 })); f.add(s); return s; });
    h.update = t => { smoke.forEach((s, i) => { const k = (t * 0.35 + i / 3) % 1; s.position.set(Math.sin(t + i) * 0.3, 3.1 + k * 2.4, 0); s.material.opacity = 0.4 * (1 - k); s.scale.set(1.6 + k * 2, 0.8 + k, 1); }); };
  } },
};

// 小主角的衣服颜色：上衣、领口、胸前小图案
const OUTFITS: Record<OutfitId, { shirt: number; collar: number; patch: number }> = {
  tee: { shirt: 0xf4f1ea, collar: 0x7cc9c0, patch: 0x8cc26a },
  jacket: { shirt: 0xc4483a, collar: 0xe3c25a, patch: 0xe3c25a },
};

// ---------- 场景控制 ----------
type Power = "light" | "heavy" | "finisher";

/** 卡通描边：顶点沿法线往外推一点、只画背面，得到粗黑轮廓线 */
const outlineShader = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.022 }, color: { value: new THREE.Color(0x14121a) } },
  vertexShader: "uniform float thickness; void main() { vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
  fragmentShader: "uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }",
  side: THREE.BackSide,
});
const NO_OUTLINE = /^(eyeH|blush|teeth|tongue|smile|smiley|chestPatch|lace|watchFace|eyeP|nose)/;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, STAGE_W / STAGE_H, 0.1, 240);
  private hemi = new THREE.HemisphereLight(0xfff8ea, 0x8fa79a, 0.85);
  private dir = new THREE.DirectionalLight(0xfff1dc, 0.85);
  private sceneGroup: THREE.Group | null = null;
  private ctx: SceneCtx = { mists: [], tick: [] };
  private foeGroup: THREE.Group | null = null;
  private foe: FoeHandle | null = null;
  private foeKind: MonsterKind | null = null;
  // 主角：Blender 做的模型（public/models/kid.glb），按节点名做动作
  private hero = new THREE.Group();
  private node: Record<"Body" | "Head" | "ArmR" | "ArmL" | "VSign", THREE.Object3D | null> = { Body: null, Head: null, ArmR: null, ArmL: null, VSign: null };
  private heroMats: Record<string, THREE.MeshToonMaterial> = {};
  private outfit: OutfitId = "tee";
  private cheerK = 0; private swing = 0; private heroDX = 0; private heroLift = 0; private heroTilt = 0;
  private shadowMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.2 });
  private heroShadow: THREE.Mesh;
  private foeShadow: THREE.Mesh;
  private shot = new THREE.Group();
  private shotParts: THREE.Mesh[];
  private drops: { m: THREE.Mesh; v: THREE.Vector3 }[];
  // 动画用“游戏时间”：顿帧时停住，慢动作时变慢
  private anims: { start: number; dur: number; fn: (k: number) => void; done?: () => void }[] = [];
  private gt = 0; private stopUntil = 0; private slowUntil = 0; private slowScale = 1;
  private hitT = -1; private hitPower = 0;
  private shakeAmp = 0; private shakeLeft = 0; private zoom = 0;
  private foeX = FOE_X; private foeXTarget = FOE_X; private foeScale = 1; private foeAlpha = 1;
  private foeLift = 0; private foeSpin = 0; private foeKnock = 0; private launching = false;
  private heroFlash = 0;
  private last = performance.now();
  private running = false;
  private proj = new THREE.Vector3();
  private fxLayer: HTMLDivElement;
  private flashEl: HTMLDivElement;
  night = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(STAGE_W, STAGE_H, false);
    this.scene.fog = new THREE.Fog(0xefe6d3, 22, 80);
    this.scene.add(this.hemi); this.dir.position.set(-6, 9, 7); this.scene.add(this.dir);

    // 打击特效（爆炸字、伤害字、闪屏）叠在画布上
    this.fxLayer = document.createElement("div"); this.fxLayer.className = "fx3d";
    this.flashEl = document.createElement("div"); this.flashEl.className = "flash3d";
    canvas.after(this.fxLayer, this.flashEl);

    this.scene.add(this.hero);
    this.hero.position.set(HERO_X, 0, 0.3); this.hero.rotation.y = 0.45; this.hero.scale.setScalar(1.1);
    void this.loadHero();
    this.heroShadow = M(new THREE.CircleGeometry(0.95, 32), this.shadowMat, HERO_X, 0.03, 0.3, this.scene); this.heroShadow.rotation.x = -Math.PI / 2;
    this.foeShadow = M(new THREE.CircleGeometry(1.3, 32), this.shadowMat, FOE_X, 0.03, 0.4, this.scene); this.foeShadow.rotation.x = -Math.PI / 2;

    const inkMat = toon(INK);
    this.scene.add(this.shot); this.shot.visible = false;
    this.shotParts = [0.26, 0.19, 0.14, 0.1, 0.07].map(r => M(new THREE.SphereGeometry(r, 14, 10), inkMat, 0, 0, 0, this.shot));
    this.drops = Array.from({ length: 22 }, () => { const m = M(new THREE.SphereGeometry(0.08 + rnd() * 0.1, 8, 6), inkMat, 0, 0, 0, this.scene); m.visible = false; return { m, v: V(0, 0, 0) }; });
    this.setScene("shanye");
    document.addEventListener("visibilitychange", () => { this.last = performance.now(); });
  }

  /** 载入 Blender 做的主角模型，换成卡通材质并加描边 */
  private async loadHero() {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/kid.glb`);
    const root = gltf.scene;
    const meshes: THREE.Mesh[] = [];
    root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); }); // 先收集，免得把新加的描边也遍历进去
    meshes.forEach(mesh => {
      const src = mesh.material as THREE.MeshStandardMaterial;
      const name = src.name || "m";
      if (!this.heroMats[name]) {
        this.heroMats[name] = toon(src.color.getHex(), name === "skin" ? { emissive: 0x3a2412 } : {});
        this.heroMats[name].name = name;
      }
      mesh.material = this.heroMats[name];
      if (!NO_OUTLINE.test(mesh.name)) mesh.add(new THREE.Mesh(mesh.geometry, outlineShader));
    });
    for (const k of Object.keys(this.node) as (keyof World["node"])[]) this.node[k] = root.getObjectByName(k) ?? null;
    if (this.node.VSign) this.node.VSign.visible = false;
    this.hero.add(root);
    this.setOutfit(this.outfit);
  }

  setScene(id: SceneId) {
    if (this.sceneGroup) { this.scene.remove(this.sceneGroup); disposeTree(this.sceneGroup); }
    const S = SCENES[id]; seed = 11;
    this.ctx = { mists: [], tick: [] };
    this.sceneGroup = new THREE.Group(); this.scene.add(this.sceneGroup);
    S.build(this.sceneGroup, this.ctx);
    this.renderer.setClearColor(S.sky);
    const fog = this.scene.fog as THREE.Fog; fog.color.setHex(S.sky); fog.near = S.fog[0]; fog.far = S.fog[1];
    this.hemi.intensity = S.light[0]; this.dir.intensity = S.light[1];
    this.hemi.color.setHex(S.night ? 0xb8c4e8 : 0xfff8ea); this.hemi.groundColor.setHex(S.night ? 0x3a3040 : 0x8fa79a);
    this.dir.color.setHex(S.night ? 0xffc89a : 0xfff1dc);
    this.shadowMat.color.setHex(S.night ? 0x000000 : INK);
    this.night = !!S.night;
  }

  setOutfit(id: OutfitId) {
    this.outfit = id;
    const o = OUTFITS[id];
    this.heroMats.shirt?.color.setHex(o.shirt); this.heroMats.collar?.color.setHex(o.collar); this.heroMats.patch?.color.setHex(o.patch);
  }

  /** 打败怪物：比个剪刀手、蹦一下 */
  cheer() {
    if (reduce) return;
    if (this.node.VSign) this.node.VSign.visible = true;
    this.anim(1300, k => { this.cheerK = Math.sin(Math.min(1, k * 1.4) * Math.PI / 2) * (k < 0.85 ? 1 : (1 - k) / 0.15); }, () => { this.cheerK = 0; if (this.node.VSign) this.node.VSign.visible = false; });
  }

  /** 换怪物；null = 没有怪物（地图、宝箱等）。怪物从右边跳进场 */
  setMonster(kind: MonsterKind | null) {
    if (this.foeGroup) { this.scene.remove(this.foeGroup); disposeTree(this.foeGroup); }
    this.foeGroup = null; this.foe = null; this.foeKind = kind;
    this.foeShadow.visible = !!kind;
    this.launching = false; this.foeSpin = 0; this.foeLift = 0; this.foeKnock = 0;
    if (!kind) return;
    this.foeGroup = new THREE.Group(); this.scene.add(this.foeGroup);
    this.foe = { mats: [], eyes: [], update: () => {} };
    FOES[kind].build(this.foeGroup, this.foe);
    this.foeShadow.scale.setScalar(kind === "kite" ? 0.6 : kind === "ding" ? 1.25 : 1);
    this.foeScale = 1; this.foeAlpha = 1;
    this.foeXTarget = FOE_X; this.foeX = FOE_X + 7;
    this.anim(450, k => { this.foeX = FOE_X + 7 * (1 - (1 - (1 - k) ** 3)); this.foeLift = Math.sin(k * Math.PI) * 2.2; }, () => { this.foeLift = 0; this.hitT = this.gt; this.hitPower = 0.2; this.shake(0.12, 0.2); });
  }

  /** 怪物离主角还剩几步（distance / total），越近越往左走 */
  setApproach(distance: number, total: number) { this.foeXTarget = FOE_X - (total - distance) * (4.2 / Math.max(1, total)); }

  foeTop() { return this.foeKind ? FOES[this.foeKind].top : 3; }

  /** 3D 点 → 舞台坐标 */
  toStage(x: number, y: number, z: number): [number, number] {
    this.proj.set(x, y, z).project(this.camera);
    return [(this.proj.x + 1) / 2 * STAGE_W, (1 - this.proj.y) / 2 * STAGE_H];
  }
  private hitY() { return this.foeKind ? FOES[this.foeKind].hitY : 1.6; }
  foeAnchor(dy = 0): [number, number] { return this.toStage(this.foeX, this.hitY() + dy + this.foeLift, 0.4); }
  foeTopAnchor(): [number, number] { return this.toStage(this.foeX, this.foeTop() + this.foeLift, 0.4); }

  private anim(dur: number, fn: (k: number) => void, done?: () => void) { this.anims.push({ start: this.gt, dur: dur / 1000, fn, done }); }
  private wait(ms: number) { return new Promise<void>(r => this.anim(ms, () => {}, r)); }

  // ---------- 出招 ----------
  /**
   * 主角出招。hit = false 墨打偏。power：light 普通一下；heavy 一个字拼完；finisher 整题打完（冲上去连打三下再挑飞）。
   * label 是打中时飘起来的字（拼音）。onLand 在打中（或落空）那一刻调用。
   */
  attack(hit: boolean, onLand: () => void, power: Power = "light", label = "") {
    if (hit && power === "finisher") { void this.finisher(onLand, label); return; }
    // 举笔蓄力 → 甩下去，墨团飞出
    this.anim(140, k => { this.swing = -1.6 * k; }, () => {
      sfx("whoosh");
      this.anim(160, k => { this.swing = -1.6 + 2.4 * k; }, () => this.anim(300, k => { this.swing = 0.8 * (1 - k); }));
      const A = V(HERO_X + 1.2, 3.0, 0.5);
      const B = hit ? V(this.foeX - 0.2, this.hitY(), 1.0) : V(this.foeX - 2.6, 0.1, 1.4);
      this.shot.visible = true;
      this.anim(hit ? 240 : 360, k => this.shotParts.forEach((m, j) => { const tt = Math.max(0, k - j * 0.06); m.position.lerpVectors(A, B, tt); m.position.y += Math.sin(tt * Math.PI) * (hit ? 0.7 : 0.6); }), () => {
        this.shot.visible = false;
        if (hit) this.impact(power === "heavy" ? 1 : 0.65, label);
        else { this.splash(B, 0.5); this.burst(...this.toStage(B.x, B.y + 0.4, B.z), "噗", 0.6, "#cfc6b6"); this.shake(0.06, 0.12); sfx("miss"); }
        onLand();
      });
    });
  }

  /** 打中的那一下：顿帧、震屏、推近、闪白、击退、挤压回弹、爆炸字、墨点飞溅、飘字 */
  private impact(power: number, label: string) {
    this.hitT = this.gt; this.hitPower = power;
    this.hitStop(60 + power * 80);
    this.shake(0.18 + power * 0.25, 0.22 + power * 0.15);
    this.punch(0.05 + power * 0.05);
    this.foeKnock = 0.8 + power * 0.9;
    this.splash(V(this.foeX - 0.2, this.hitY(), 1.0), 0.8 + power * 0.6);
    const [x, y] = this.foeAnchor();
    this.burst(x - 50, y - 20, power > 0.8 ? pick(["砰！", "咚！", "啪！"]) : pick(["啪！", "嘭！"]), power > 0.8 ? 1.15 : 0.85);
    if (label) this.floatText(x + 30, y - 90, label);
    sfx("punch");
  }

  private async finisher(onLand: () => void, label: string) {
    const close = this.foeX - HERO_X - 2.4;
    sfx("whoosh");
    await new Promise<void>(r => this.anim(170, k => { this.heroDX = close * (1 - (1 - k) ** 3); this.heroLift = Math.sin(k * Math.PI) * 0.6; }, r));
    for (let i = 0; i < 3; i++) {
      this.anim(110, k => { this.swing = (i % 2 ? 1 : -1) * 1.8 * Math.sin(k * Math.PI); this.heroTilt = (i % 2 ? -0.15 : 0.15) * Math.sin(k * Math.PI); });
      await this.wait(70);
      this.impact(0.55 + i * 0.15, "");
      await this.wait(i === 2 ? 120 : 90);
    }
    // 上挑：大闪光、顿帧、慢动作，把怪物挑飞
    this.anim(200, k => { this.swing = -2.4 * Math.sin(k * Math.PI / 2); this.heroLift = 0.8 * Math.sin(k * Math.PI); });
    await this.wait(90);
    this.flash(0.9);
    this.hitT = this.gt; this.hitPower = 1.3;
    this.hitStop(200); this.slow(600, 0.3);
    this.shake(0.6, 0.55); this.punch(0.16);
    this.splash(V(this.foeX, this.hitY(), 1.0), 1.8);
    const [x, y] = this.foeAnchor();
    this.burst(x - 20, y - 60, "打败啦！", 1.5);
    this.stars(x, y);
    if (label) this.floatText(x + 30, y - 110, label);
    sfx("boom");
    this.launching = true;
    onLand();
    this.anim(320, k => { this.heroDX = close * (1 - k); this.swing *= 0.8; this.heroLift = 0; });
  }

  private splash(at: THREE.Vector3, power: number) {
    this.drops.forEach(d => { d.m.visible = true; d.m.scale.set(1, 1, 1); d.m.position.set(at.x - 0.3, at.y + 0.2, at.z); d.v.set((-1.5 + rnd() * 5) * power, (1 + rnd() * 4) * power, (rnd() - 0.5) * 3 * power); });
  }

  /** 怪物扑到主角面前咬一口，再退回去。onBite 返回 false 表示被竹盾挡住 */
  lunge(onBite: () => boolean) {
    const from = this.foeX;
    sfx("whoosh");
    this.anim(300, k => { this.foeX = from + (HERO_X + 2.2 - from) * (k * k); this.foeLift = Math.sin(k * Math.PI) * 0.8; }, () => {
      const hurt = onBite();
      const [hx, hy] = this.toStage(HERO_X, 2.6, 0.3);
      if (hurt) {
        this.heroFlash = 1; this.hitStop(120); this.shake(0.45, 0.4); this.flash(0.4, "#ff5a48");
        this.burst(hx + 20, hy - 30, "哎哟！", 0.95, "#ff9a8a");
        this.anim(320, k => { this.heroDX = -0.7 * Math.sin((1 - k) * Math.PI / 2) * (1 - k); });
      } else {
        this.burst(hx + 70, hy, "挡住！", 0.95, "#a6e07a"); this.shake(0.15, 0.2);
      }
      this.anim(420, k => { this.foeX = HERO_X + 2.2 + (from - HERO_X - 2.2) * (1 - (1 - k) ** 3); this.foeLift = 0; });
    });
  }

  /** 把怪物挑飞出画面（大招打完后调用） */
  defeat(onDone: () => void) {
    this.launching = true;
    const x0 = this.foeX;
    this.anim(900, k => {
      this.foeX = x0 + 9 * k; this.foeLift = 6 * Math.sin(k * Math.PI * 0.75); this.foeSpin = k * 10;
      this.foeAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    }, () => { this.setMonster(null); onDone(); });
  }

  // ---------- 效果 ----------
  private shake(amp: number, sec: number) { if (reduce) return; this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeLeft = Math.max(this.shakeLeft, sec); }
  private punch(z: number) { if (!reduce) this.zoom = Math.max(this.zoom, z); }
  private hitStop(ms: number) { if (!reduce) this.stopUntil = Math.max(this.stopUntil, performance.now() + ms); }
  private slow(ms: number, scale: number) { if (!reduce) { this.slowUntil = performance.now() + ms; this.slowScale = scale; } }
  private flash(alpha: number, color = "#ffffff") {
    this.flashEl.style.transition = "none"; this.flashEl.style.background = color; this.flashEl.style.opacity = String(alpha);
    void this.flashEl.offsetWidth; this.flashEl.style.transition = "opacity .35s ease-out"; this.flashEl.style.opacity = "0";
  }
  /** 漫画式爆炸字 */
  private burst(x: number, y: number, text: string, size = 1, color = "#ffd23f") {
    const pts = Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2, r = (i % 2 ? 58 : 100) * (0.88 + rnd() * 0.24); return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r * 0.78).toFixed(1)}`; }).join(" ");
    const el = document.createElement("div");
    el.className = "burst";
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.style.setProperty("--s", String(size)); el.style.setProperty("--r", `${(rnd() - 0.5) * 30}deg`);
    el.innerHTML = `<svg viewBox="-115 -95 230 190"><polygon points="${pts}" fill="${color}" stroke="#14121a" stroke-width="7" stroke-linejoin="round"/></svg><b>${text}</b>`;
    this.fxLayer.append(el);
    setTimeout(() => el.remove(), 700);
  }
  private floatText(x: number, y: number, text: string) {
    const el = document.createElement("div");
    el.className = "dmg"; el.textContent = text;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    this.fxLayer.append(el);
    setTimeout(() => el.remove(), 1200);
  }
  private stars(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const el = document.createElement("i");
      el.className = "star3d";
      const a = rnd() * Math.PI * 2, d = 120 + rnd() * 160;
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      el.style.setProperty("--dx", `${Math.cos(a) * d}px`); el.style.setProperty("--dy", `${Math.sin(a) * d - 80}px`);
      this.fxLayer.append(el);
      setTimeout(() => el.remove(), 900);
    }
  }

  start() {
    if (this.running) return; this.running = true;
    const loop = (now: number) => { if (!this.running) return; this.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }

  private frame(now: number) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000)); this.last = now;
    const frozen = now < this.stopUntil;
    const scale = frozen ? 0 : now < this.slowUntil ? this.slowScale : 1;
    const gdt = dt * scale;
    this.gt += gdt;
    const t = this.gt;

    // 镜头：慢慢晃 + 震屏 + 推近
    const sway = reduce ? 0 : Math.sin(t * 0.18);
    let sx = 0, sy = 0;
    if (this.shakeLeft > 0) { this.shakeLeft -= dt; const a = this.shakeAmp * Math.min(1, this.shakeLeft * 4); sx = (rnd() - 0.5) * 2 * a; sy = (rnd() - 0.5) * 2 * a * 0.7; if (this.shakeLeft <= 0) this.shakeAmp = 0; }
    this.zoom *= Math.pow(0.002, dt);
    this.camera.position.set(sway * 1.1 + sx, 4.1 + (reduce ? 0 : Math.sin(t * 0.13) * 0.15) + sy, 16.5 * (1 - this.zoom));
    this.camera.lookAt(sx * 0.5, 1.75 + sy * 0.5, 0);

    if (!reduce) this.ctx.mists.forEach(p => { p.position.x = p.userData.x0 + Math.sin(t * 0.08 * p.userData.sp * 3) * 3; });
    this.ctx.tick.forEach(f => f(t, gdt, 0));
    const list = this.anims; this.anims = [];
    const keep = list.filter(a => { const k = Math.min(1, (t - a.start) / a.dur); a.fn(k); if (k >= 1) { a.done?.(); return false; } return true; });
    this.anims = keep.concat(this.anims);

    // 主角：呼吸、出招挥笔、比剪刀手、被咬闪红
    const { Body, Head, ArmR, ArmL } = this.node;
    const breathe = reduce ? 0 : Math.sin(t * 3.2) * 0.02;
    this.hero.position.set(HERO_X + this.heroDX, (reduce ? 0 : Math.abs(Math.sin(t * 1.6)) * 0.03) + Math.sin(this.cheerK * Math.PI) * 0.35 + this.heroLift, 0.3);
    this.hero.rotation.z = -this.heroTilt;
    if (Body) Body.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    if (Head) Head.rotation.z = (reduce ? 0 : Math.sin(t * 1.1) * 0.05) - this.cheerK * 0.12;
    if (ArmR) ArmR.rotation.z = this.swing;
    if (ArmL) { ArmL.rotation.z = (reduce ? 0 : Math.sin(t * 1.6) * 0.05) - this.cheerK * 2.6; ArmL.rotation.x = -this.cheerK * 0.3; }
    if (this.heroFlash > 0) { this.heroFlash = Math.max(0, this.heroFlash - dt * 2.5); this.heroMats.shirt?.emissive.setHex(this.heroFlash > 0.4 ? 0xd2402e : 0x000000); }
    this.heroShadow.position.x = HERO_X + this.heroDX; this.heroShadow.scale.setScalar(Math.max(0.5, 1 - this.heroLift * 0.4));

    if (this.foeGroup && this.foe) {
      const hk = this.hitT >= 0 ? Math.max(0, 1 - (t - this.hitT) / 0.6) : 0;
      this.foe.update(t, gdt, hk);
      if (!this.launching) this.foeX += (this.foeXTarget - this.foeX) * Math.min(1, gdt * 3);
      this.foeKnock *= Math.pow(0.02, gdt);
      const squash = hk > 0 ? Math.sin((1 - hk) * Math.PI * 3) * hk * (0.18 + this.hitPower * 0.15) : 0;
      this.foeGroup.scale.set((1 + squash) * this.foeScale, (1 - squash) * this.foeScale, (1 + squash) * this.foeScale);
      const bob = (!reduce && this.foeKind !== "kite" && this.foeKind !== "lantern") ? Math.sin(t * 1.3) * 0.05 : 0;
      this.foeGroup.position.set(this.foeX + this.foeKnock, bob + this.foeLift, 0.4);
      this.foeGroup.rotation.z = -this.foeSpin;
      this.foe.mats.forEach(m => m.emissive.setHex(hk > 0.72 ? 0xffffff : 0x000000));
      const blink = (t % 4.2) < 0.12 ? 0.1 : 1; this.foe.eyes.forEach(e => { e.scale.y = blink; });
      if (this.foeAlpha < 1) this.foeGroup.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) { m.transparent = true; m.opacity = this.foeAlpha; } });
      this.foeShadow.position.x = this.foeX + this.foeKnock; this.foeShadow.visible = this.foeLift < 2;
    }
    this.drops.forEach(d => { if (!d.m.visible) return; d.v.y -= 9 * gdt; d.m.position.addScaledVector(d.v, gdt); if (d.m.position.y < 0.05) { d.m.position.y = 0.04; d.v.set(0, 0, 0); d.m.scale.y = 0.25; } });
    this.renderer.render(this.scene, this.camera);
  }

  clearDrops() { this.drops.forEach(d => { d.m.visible = false; }); }
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function disposeTree(g: THREE.Object3D) {
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(x => x !== lineMat && x.dispose()); else if (mat && mat !== lineMat) mat.dispose();
  });
}
