// 3D 战斗场景（粗黑线美式卡通）：5 章手绘背景、Blender 做的主角/怪物/小鸟嘀嗒、手表声波拳和命中效果。
// 模型在 tools/blender/ 用脚本生成；界面层只调用 World 的方法。
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { sfx } from "./audio";
import type { MonsterKind, OutfitId, SceneId } from "../core/types";

export const STAGE_W = 1280, STAGE_H = 800;
export const SCENE_IDS: SceneId[] = ["c1", "c2", "c3", "c4", "c5"];
const FOE_X = 4.6, HERO_X = -4.6;
const INK = 0x14121a;
const BASE = import.meta.env.BASE_URL;
const CAM = new THREE.Vector3(0, 4.1, 16.5), LOOK_Y = 2.2;

type Power = "light" | "heavy" | "finisher";
const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 闯关模式的怪物种类 → 当前章节的哪只怪（故事模式直接用敌人编号） */
export function foeFor(kind: MonsterKind, scene: SceneId): string {
  const n = SCENE_IDS.indexOf(scene);
  if (kind === "ding") return `${scene}e4`;
  if (kind === "lion") return `${SCENE_IDS[(n + 1) % 5]}e${1 + (n % 3)}`;
  return `${scene}e${kind === "blob" ? 1 : kind === "kite" ? 2 : 3}`;
}

// ---------- 卡通材质：两段色阶 + 背面外扩的粗黑描边 ----------
const grad = new THREE.DataTexture(new Uint8Array([175, 175, 175, 255, 255, 255, 255, 255]), 2, 1, THREE.RGBAFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const toon = (color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });
const outlineMat = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.04 }, color: { value: new THREE.Color(INK) } },
  vertexShader: "uniform float thickness; void main() { vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
  fragmentShader: "uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }",
  side: THREE.BackSide,
});
function M(geo: THREE.BufferGeometry, mat: THREE.Material, parent?: THREE.Object3D) { const m = new THREE.Mesh(geo, mat); parent?.add(m); return m; }
function withLine<T extends THREE.Mesh>(m: T): T { m.add(new THREE.Mesh(m.geometry, outlineMat)); return m; }

const draco = new DRACOLoader(); draco.setDecoderPath(`${BASE}draco/`);
const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
const models = new Map<string, Promise<THREE.Group>>();
function loadModel(name: string) {
  let p = models.get(name);
  if (!p) { p = loader.loadAsync(`${BASE}models/${name}.glb`).then(g => g.scene); models.set(name, p); p.catch(() => models.delete(name)); }
  return p;
}
const bgTex = new Map<SceneId, THREE.Texture>();
const texLoader = new THREE.TextureLoader();

/** 把 Blender 导出的材质换成卡通材质、加描边。d_ 开头的小细节不描边；glow 发光；bubble 半透明 */
function toonify(root: THREE.Object3D, mats: Record<string, THREE.MeshToonMaterial | THREE.MeshBasicMaterial>) {
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); }); // 先收集，免得把新加的描边也遍历进去
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    const name = src.name || "m";
    if (!mats[name]) {
      mats[name] = name === "glow" ? new THREE.MeshBasicMaterial({ color: src.color })
        : toon(src.color, name.startsWith("bubble") ? { transparent: true, opacity: 0.72 } : {});
      mats[name].name = name;
    }
    mesh.material = mats[name];
    const label = mesh.name.startsWith("d_") || mesh.parent?.name.startsWith("d_");
    if (!label) mesh.add(new THREE.Mesh(mesh.geometry, outlineMat));
  }
}

// 小主角的衣服颜色：上衣、领口、胸前小图案
const OUTFITS: Record<OutfitId, { shirt: number; collar: number; patch: number }> = {
  tee: { shirt: 0xfbfaf5, collar: 0x3fc7a8, patch: 0x5cc04a },
  jacket: { shirt: 0xe5413a, collar: 0xffd23f, patch: 0xffd23f },
};

interface Foe { root: THREE.Group; mats: THREE.MeshToonMaterial[]; eyes: THREE.Object3D[]; sways: THREE.Object3D[]; top: number; hitY: number }

export class World {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, STAGE_W / STAGE_H, 0.1, 240);
  private bg: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  sceneId: SceneId = "c1";
  // 怪物
  private foe: Foe | null = null;
  private foeWant: string | null = null;
  // 主角：Blender 做的模型（public/models/kid.glb），按节点名做动作
  private hero = new THREE.Group();
  private node: Record<"Body" | "Head" | "ArmL" | "ArmR" | "Cannon" | "VSign", THREE.Object3D | null> = { Body: null, Head: null, ArmL: null, ArmR: null, Cannon: null, VSign: null };
  private heroMats: Record<string, THREE.MeshToonMaterial> = {};
  private outfit: OutfitId = "tee";
  private cheerK = 0; private punch = 0; private cannonK = 0; private heroDX = 0; private heroLift = 0; private heroTilt = 0;
  // 伙伴小鸟嘀嗒
  private bird = new THREE.Group();
  private wings: THREE.Object3D[] = [];
  private birdSpin = 0; private birdHop = 0; private flap = 1;
  // 声波拳：一只金拳头 + 几圈声波环
  private fist = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private shadowMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.22, depthWrite: false });
  private heroShadow: THREE.Mesh;
  private foeShadow: THREE.Mesh;
  private bits: { m: THREE.Mesh; v: THREE.Vector3; life: number }[];
  // 动画用“游戏时间”：顿帧时停住，慢动作时变慢
  private anims: { start: number; dur: number; fn: (k: number) => void; done?: () => void }[] = [];
  private gt = 0; private stopUntil = 0; private slowUntil = 0; private slowScale = 1;
  private hitT = -1; private hitPower = 0;
  private shakeAmp = 0; private shakeLeft = 0; private zoom = 0;
  private foeX = FOE_X; private foeXTarget = FOE_X; private foeAlpha = 1;
  private foeLift = 0; private foeSpin = 0; private foeKnock = 0; private launching = false;
  private heroFlash = 0;
  private last = performance.now();
  private running = false;
  private proj = new THREE.Vector3();
  private fxLayer: HTMLDivElement;
  private flashEl: HTMLDivElement;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(STAGE_W, STAGE_H, false);
    this.renderer.setClearColor(0x5ec8f0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c8a8, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-5, 9, 8); this.scene.add(sun);

    // 打击特效（爆炸字、伤害字、闪屏）叠在画布上
    this.fxLayer = document.createElement("div"); this.fxLayer.className = "fx3d";
    this.flashEl = document.createElement("div"); this.flashEl.className = "flash3d";
    canvas.after(this.fxLayer, this.flashEl);

    this.bg = this.makeBackdrop();
    this.scene.add(this.hero);
    this.hero.position.set(HERO_X, 0, 0.3); this.hero.rotation.y = 0.45; this.hero.scale.setScalar(1.1);
    this.scene.add(this.bird);
    this.scene.add(this.fist); this.fist.visible = false;
    void this.loadActors();
    this.heroShadow = M(new THREE.CircleGeometry(0.95, 32), this.shadowMat, this.scene); this.heroShadow.rotation.x = -Math.PI / 2; this.heroShadow.position.set(HERO_X, 0.02, 0.3);
    this.foeShadow = M(new THREE.CircleGeometry(1.3, 32), this.shadowMat, this.scene); this.foeShadow.rotation.x = -Math.PI / 2; this.foeShadow.position.set(FOE_X, 0.02, 0.4);

    const ringMat = toon(0x6fe4ff, { transparent: true, opacity: 0.9 });
    this.rings = [0, 1, 2].map(() => { const r = withLine(M(new THREE.TorusGeometry(0.42, 0.08, 10, 36), ringMat, this.scene)); r.visible = false; return r; });
    const bitMats = [0xffd23f, 0x6fe4ff, 0xff6fb0, 0xffffff, 0x8ee04a].map(c => toon(c));
    this.bits = Array.from({ length: 26 }, (_, i) => {
      const geo = i % 2 ? new THREE.OctahedronGeometry(0.12 + rnd() * 0.08) : new THREE.SphereGeometry(0.09 + rnd() * 0.07, 8, 6);
      const m = M(geo, bitMats[i % bitMats.length], this.scene); m.visible = false; return { m, v: V(0, 0, 0), life: 0 };
    });
    this.setScene("c1");
    document.addEventListener("visibilitychange", () => { this.last = performance.now(); });
  }

  /** 手绘背景挂在远处一块大板上：跟镜头的基准姿势对齐，震屏时背景动得比角色少，有纵深感 */
  private makeBackdrop() {
    const c0 = this.camera.clone(); c0.position.copy(CAM); c0.lookAt(0, LOOK_Y, 0); c0.updateMatrixWorld();
    const D = 40, H = 2 * D * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const Ph = H * 1.32, Pw = Ph * (1586 / 992);
    // 画里的地平线在图高 63% 处，放到画面高 56% 处，角色脚下就是地面
    const offset = -0.06 * H + 0.13 * Ph;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(Pw, Ph), new THREE.MeshBasicMaterial({ fog: false, depthWrite: false, toneMapped: false }));
    bg.position.copy(V(0, offset, -D).applyMatrix4(c0.matrixWorld)); bg.quaternion.copy(c0.quaternion);
    bg.renderOrder = -1;
    this.scene.add(bg);
    return bg;
  }

  /** 载入主角、小鸟、拳头 */
  private async loadActors() {
    const [kid, didi, fist] = await Promise.all([loadModel("kid"), loadModel("foes/didi"), loadModel("foes/fist")]);
    toonify(kid, this.heroMats);
    this.heroMats.skin?.emissive.setHex(0x3a2412);
    for (const k of Object.keys(this.node) as (keyof World["node"])[]) this.node[k] = kid.getObjectByName(k) ?? null;
    if (this.node.VSign) this.node.VSign.visible = false;
    if (this.node.Cannon) this.node.Cannon.scale.setScalar(0.001);
    this.hero.add(kid);
    this.setOutfit(this.outfit);
    toonify(didi, {});
    this.wings = ["WingL", "WingR"].map(n => didi.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
    this.bird.add(didi); this.bird.scale.setScalar(0.95); this.bird.rotation.y = 0.5;
    toonify(fist, {});
    fist.rotation.y = 0; this.fist.add(fist);
  }

  setScene(id: SceneId) {
    if (!SCENE_IDS.includes(id)) id = "c1";
    this.sceneId = id;
    const show = (t: THREE.Texture) => { if (this.sceneId === id) { this.bg.material.map = t; this.bg.material.needsUpdate = true; } };
    const t = bgTex.get(id);
    if (t) show(t);
    else texLoader.load(`${BASE}bg/${id}.jpg`, tex => { tex.colorSpace = THREE.SRGBColorSpace; bgTex.set(id, tex); show(tex); });
    for (let i = 1; i <= 4; i++) void loadModel(`foes/${id}e${i}`).catch(() => {}); // 这一章的怪物先下载好
  }

  setOutfit(id: OutfitId) {
    this.outfit = id;
    const o = OUTFITS[id];
    this.heroMats.shirt?.color.setHex(o.shirt); this.heroMats.collar?.color.setHex(o.collar); this.heroMats.patch?.color.setHex(o.patch);
  }

  /** 打败怪物：比个剪刀手、蹦一下，嘀嗒翻跟头 */
  cheer() {
    if (reduce) return;
    if (this.node.VSign) this.node.VSign.visible = true;
    this.birdFlip();
    this.anim(1300, k => { this.cheerK = Math.sin(Math.min(1, k * 1.4) * Math.PI / 2) * (k < 0.85 ? 1 : (1 - k) / 0.15); }, () => { this.cheerK = 0; if (this.node.VSign) this.node.VSign.visible = false; });
  }

  private birdFlip() { if (!reduce) this.anim(520, k => { this.birdSpin = k * Math.PI * 2; this.birdHop = Math.sin(k * Math.PI) * 0.6; this.flap = 3; }, () => { this.birdSpin = 0; this.flap = 1; }); }

  /** 换怪物（模型编号，如 c1e2）；null = 没有怪物。怪物从右边跳进场 */
  setMonster(model: string | null) {
    if (this.foe) { this.scene.remove(this.foe.root); this.foe.mats.forEach(m => m.dispose()); }
    this.foe = null; this.foeWant = model;
    this.foeShadow.visible = false;
    this.launching = false; this.foeSpin = 0; this.foeLift = 0; this.foeKnock = 0; this.foeAlpha = 1;
    if (!model) return;
    void loadModel(`foes/${model}`).then(src => {
      if (this.foeWant !== model || this.foe) return;
      const root = src.clone(true);
      const mats: Record<string, THREE.MeshToonMaterial> = {};
      toonify(root, mats);
      const box = new THREE.Box3().setFromObject(root);
      const foe: Foe = { root, mats: Object.values(mats).filter(m => (m as THREE.MeshToonMaterial).isMeshToonMaterial), eyes: [], sways: [], top: box.max.y, hitY: Math.min(2.4, (box.min.y + box.max.y) / 2) };
      root.traverse(o => { if (/^Eye\d/.test(o.name)) foe.eyes.push(o); else if (o.name.startsWith("Sway")) { o.userData.rz = o.rotation.z; foe.sways.push(o); } });
      root.rotation.y = -0.35;
      const g = new THREE.Group(); g.add(root);
      this.foe = { ...foe, root: g };
      this.scene.add(g);
      this.foeShadow.visible = true;
      this.foeShadow.scale.setScalar(Math.max(0.8, (box.max.x - box.min.x) / 2.6));
      this.foeXTarget = FOE_X; this.foeX = FOE_X + 7;
      this.anim(450, k => { this.foeX = FOE_X + 7 * (1 - k) ** 3; this.foeLift = Math.sin(k * Math.PI) * 2.2; }, () => { this.foeLift = 0; this.hitT = this.gt; this.hitPower = 0.2; this.shake(0.12, 0.2); });
    }).catch(() => {});
  }

  /** 怪物离主角还剩几步（distance / total），越近越往左走 */
  setApproach(distance: number, total: number) { this.foeXTarget = FOE_X - (total - distance) * (4.2 / Math.max(1, total)); }

  /** 3D 点 → 舞台坐标 */
  toStage(x: number, y: number, z: number): [number, number] {
    this.proj.set(x, y, z).project(this.camera);
    return [(this.proj.x + 1) / 2 * STAGE_W, (1 - this.proj.y) / 2 * STAGE_H];
  }
  private hitY() { return this.foe?.hitY ?? 1.6; }
  foeAnchor(dy = 0): [number, number] { return this.toStage(this.foeX, this.hitY() + dy + this.foeLift, 0.4); }
  foeTopAnchor(): [number, number] { return this.toStage(this.foeX, (this.foe?.top ?? 3) + this.foeLift, 0.4); }

  private anim(dur: number, fn: (k: number) => void, done?: () => void) { this.anims.push({ start: this.gt, dur: dur / 1000, fn, done }); }

  // ---------- 出招 ----------
  /** 手表炮口的位置（举手对准怪物时） */
  private muzzle() { return V(HERO_X + this.heroDX + 1.6, 1.65 + this.heroLift, 0.35); }

  /**
   * 主角出招：举起左手，手表弹出喇叭炮口，打出声波拳。hit = false 打偏。
   * power：light 拼对一个部分；heavy 一个字拼完；finisher 整题打完（蓄力发超大金拳头，把怪物打飞）。
   * label 是打中时飘起来的字（拼音）。onLand 在打中（或落空）那一刻调用。
   */
  attack(hit: boolean, onLand: () => void, power: Power = "light", label = "") {
    if (hit && power === "finisher") { void this.finisher(onLand, label); return; }
    this.raiseArm(120, () => {
      sfx("whoosh");
      const A = this.muzzle();
      const B = hit ? V(this.foeX - 0.6, this.hitY(), 0.9) : V(this.foeX - 2.4, 0.2, 1.3);
      const size = power === "heavy" ? 1.0 : 0.7;
      this.shoot(A, B, hit ? 200 : 320, size, () => {
        if (hit) { this.impact(power === "heavy" ? 1 : 0.65, label); if (power === "heavy") this.birdFlip(); }
        else { this.burst(...this.toStage(B.x, B.y + 0.4, B.z), "噗", 0.6, "#cfe8ff"); this.shake(0.06, 0.12); sfx("miss"); }
        onLand();
      });
      this.anim(110, k => { this.heroTilt = -0.06 * Math.sin(k * Math.PI); });
    });
  }

  /** 举手对准怪物、弹出炮口；done 后开火，过一会儿自己放下 */
  private raiseArm(ms: number, done: () => void, hold = 420) {
    this.anim(ms, k => { this.punch = Math.max(this.punch, k); this.cannonK = Math.max(this.cannonK, k); }, () => {
      done();
      this.anim(hold, () => {}, () => this.anim(260, k => { this.punch = 1 - k; this.cannonK = 1 - k; }));
    });
  }

  /** 拳头带着声波环从 A 飞到 B */
  private shoot(A: THREE.Vector3, B: THREE.Vector3, ms: number, size: number, land: () => void) {
    this.fist.visible = true; this.fist.scale.setScalar(size * 0.6);
    this.rings.forEach(r => { r.visible = true; r.rotation.set(0, Math.PI / 2, 0); });
    this.anim(ms, k => {
      const e = k * k * (3 - 2 * k);
      this.fist.position.lerpVectors(A, B, e); this.fist.position.y += Math.sin(e * Math.PI) * 0.25;
      this.fist.scale.setScalar(size * (0.6 + 0.4 * e));
      this.fist.rotation.x = e * Math.PI * 2;
      this.rings.forEach((r, j) => { const tt = Math.max(0, e - 0.12 * (j + 1)); r.position.lerpVectors(A, B, tt); r.scale.setScalar(size * (0.6 + tt * 1.4)); });
    }, () => { this.fist.visible = false; this.rings.forEach(r => { r.visible = false; }); land(); });
  }

  /** 打中的那一下：顿帧、震屏、推近、闪白、击退、挤压回弹、爆炸字、彩色碎片、飘字 */
  private impact(power: number, label: string) {
    this.hitT = this.gt; this.hitPower = power;
    this.hitStop(60 + power * 80);
    this.shake(0.18 + power * 0.25, 0.22 + power * 0.15);
    this.punchZoom(0.05 + power * 0.05);
    this.foeKnock = 0.8 + power * 0.9;
    this.spray(V(this.foeX - 0.4, this.hitY(), 1.0), 0.8 + power * 0.6);
    const [x, y] = this.foeAnchor();
    this.burst(x - 50, y - 20, power > 0.8 ? pick(["砰！", "咚！", "轰！"]) : pick(["啪！", "嘭！"]), power > 0.8 ? 1.15 : 0.85);
    if (label) this.floatText(x + 30, y - 90, label);
    sfx("punch");
  }

  private async finisher(onLand: () => void, label: string) {
    // 往前踏一大步、举起手表蓄力：声波环往炮口收
    const step = 1.6;
    sfx("whoosh");
    this.birdFlip();
    await new Promise<void>(r => this.anim(170, k => { this.heroDX = step * (1 - (1 - k) ** 3); this.heroLift = Math.sin(k * Math.PI) * 0.3; this.punch = k; this.cannonK = k; }, r));
    const A = this.muzzle();
    this.rings.forEach(r => { r.visible = true; r.rotation.set(0, Math.PI / 2, 0); });
    await new Promise<void>(r => this.anim(320, k => {
      this.rings.forEach((ring, j) => { const kk = Math.min(1, k * 1.3 - j * 0.15); ring.position.copy(A).add(V(1.2 * (1 - kk), 0, 0)); ring.scale.setScalar(2.6 - 2.2 * Math.max(0, kk)); });
      this.zoom = Math.max(this.zoom, 0.04 * k); this.heroTilt = 0.05 * k;
    }, r));
    // 发射超大金拳头
    this.heroTilt = -0.12; this.flash(0.35, "#fff4c0"); this.shake(0.2, 0.15);
    await new Promise<void>(r => this.shoot(A, V(this.foeX - 0.8, this.hitY(), 1.0), 190, 2.4, r));
    this.flash(0.9);
    this.hitT = this.gt; this.hitPower = 1.3;
    this.hitStop(200); this.slow(600, 0.3);
    this.shake(0.6, 0.55); this.punchZoom(0.16);
    this.spray(V(this.foeX, this.hitY(), 1.0), 1.8);
    const [x, y] = this.foeAnchor();
    this.burst(x - 20, y - 60, "打败啦！", 1.5);
    this.stars(x, y);
    if (label) this.floatText(x + 30, y - 110, label);
    sfx("boom");
    this.launching = true;
    onLand();
    this.anim(380, k => { this.heroDX = step * (1 - k); this.heroLift = 0; this.heroTilt *= 0.8; this.punch = 1 - k; this.cannonK = 1 - k; });
  }

  private spray(at: THREE.Vector3, power: number) {
    this.bits.forEach(d => { d.m.visible = true; d.life = 1.4; d.m.scale.setScalar(1); d.m.position.set(at.x - 0.3, at.y + 0.2, at.z); d.v.set((-1 + rnd() * 5) * power, (1 + rnd() * 4.5) * power, (rnd() - 0.5) * 3 * power); });
  }

  /** 怪物扑到主角面前撞一下，再退回去。onBite 返回 false 表示被挡住 */
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

  /** 把怪物打飞出画面（大招打完后调用） */
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
  private punchZoom(z: number) { if (!reduce) this.zoom = Math.max(this.zoom, z); }
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
    this.camera.position.set(CAM.x + sway * 0.6 + sx, CAM.y + (reduce ? 0 : Math.sin(t * 0.13) * 0.1) + sy, CAM.z * (1 - this.zoom));
    this.camera.lookAt(sx * 0.5, LOOK_Y + sy * 0.5, 0);

    const list = this.anims; this.anims = [];
    const keep = list.filter(a => { const k = Math.min(1, (t - a.start) / a.dur); a.fn(k); if (k >= 1) { a.done?.(); return false; } return true; });
    this.anims = keep.concat(this.anims);

    // 主角：呼吸、举手表开炮、比剪刀手、被撞闪红
    const { Body, Head, ArmL, ArmR, Cannon } = this.node;
    const breathe = reduce ? 0 : Math.sin(t * 3.2) * 0.02;
    this.hero.position.set(HERO_X + this.heroDX, (reduce ? 0 : Math.abs(Math.sin(t * 1.6)) * 0.03) + Math.sin(this.cheerK * Math.PI) * 0.35 + this.heroLift, 0.3);
    this.hero.rotation.z = -this.heroTilt;
    if (Body) Body.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    if (Head) Head.rotation.z = (reduce ? 0 : Math.sin(t * 1.1) * 0.05) - this.cheerK * 0.12;
    if (ArmL) { ArmL.rotation.z = (reduce ? 0 : Math.sin(t * 1.6) * 0.05) + this.punch * 1.45; ArmL.rotation.y = -this.punch * 0.45; }
    if (Cannon) Cannon.scale.setScalar(Math.max(0.001, 1.7 * this.cannonK * (1 + Math.sin(this.cannonK * Math.PI) * 0.4))); // 炮口弹出来时先胀大一下
    if (ArmR) { ArmR.rotation.z = (reduce ? 0 : -Math.sin(t * 1.6) * 0.05) - this.cheerK * 2.6; ArmR.rotation.x = -this.cheerK * 0.3; }
    if (this.heroFlash > 0) { this.heroFlash = Math.max(0, this.heroFlash - dt * 2.5); this.heroMats.shirt?.emissive.setHex(this.heroFlash > 0.4 ? 0xd2402e : 0x000000); }
    this.heroShadow.position.x = HERO_X + this.heroDX; this.heroShadow.scale.setScalar(Math.max(0.5, 1 - this.heroLift * 0.4));

    // 嘀嗒：在主角头边飞，扇翅膀；高兴时翻跟头
    this.bird.position.set(HERO_X + this.heroDX * 0.6 - 1.35, 3.75 + (reduce ? 0 : Math.sin(t * 2.4) * 0.12) + this.birdHop, 0.7);
    this.bird.rotation.z = this.birdSpin;
    this.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (reduce ? 0.2 : 0.25 + Math.sin(t * 14 * this.flap) * 0.45); });

    const foe = this.foe;
    if (foe) {
      const hk = this.hitT >= 0 ? Math.max(0, 1 - (t - this.hitT) / 0.6) : 0;
      if (!this.launching) this.foeX += (this.foeXTarget - this.foeX) * Math.min(1, gdt * 3);
      this.foeKnock *= Math.pow(0.02, gdt);
      const squash = hk > 0 ? Math.sin((1 - hk) * Math.PI * 3) * hk * (0.18 + this.hitPower * 0.15) : 0;
      foe.root.scale.set(1 + squash, 1 - squash, 1 + squash);
      const bob = reduce ? 0 : Math.sin(t * 1.3) * 0.05;
      foe.root.position.set(this.foeX + this.foeKnock, bob + this.foeLift, 0.4);
      foe.root.rotation.z = -this.foeSpin;
      foe.mats.forEach(m => m.emissive.setHex(hk > 0.72 ? 0xffffff : 0x000000));
      const blink = (t % 4.2) < 0.12 ? 0.1 : 1; foe.eyes.forEach(e => { e.scale.y = blink; });
      if (!reduce) foe.sways.forEach((s, i) => { s.rotation.z = s.userData.rz + Math.sin(t * 2.2 + i * 1.7) * 0.1 + hk * Math.sin(t * 30 + i) * 0.25; });
      if (this.foeAlpha < 1) foe.mats.forEach(m => { m.transparent = true; m.opacity = this.foeAlpha; });
      this.foeShadow.position.x = this.foeX + this.foeKnock; this.foeShadow.visible = this.foeLift < 2;
    }
    this.bits.forEach(d => {
      if (!d.m.visible) return;
      d.life -= gdt; if (d.life <= 0) { d.m.visible = false; return; }
      d.v.y -= 9 * gdt; d.m.position.addScaledVector(d.v, gdt); d.m.rotation.x += gdt * 6; d.m.rotation.y += gdt * 4;
      if (d.m.position.y < 0.08) { d.m.position.y = 0.08; d.v.multiplyScalar(0.4); d.v.y = Math.abs(d.v.y) * 0.5; }
      if (d.life < 0.3) d.m.scale.setScalar(d.life / 0.3);
    });
    this.renderer.render(this.scene, this.camera);
  }

  clearDrops() { this.bits.forEach(d => { d.m.visible = false; }); }
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
