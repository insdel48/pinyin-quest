// 3D 战斗场景（写实·东方神话）：每章一张写实远景、Blender 做的主角小乐和青铜神兽（带骨骼动画）、
// 拼对的字化成金光飞出去、打碎神兽身上的铜甲、净化时黑雾散开。
// 模型由 tools/blender-real/ 的流程生成，节点名和动作名是约定好的（见 HERO_ACTS / FOE_ACTS）；界面层只调用 World 的方法。
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { sfx } from "./audio";
import { castShadows, setupLights, setupRenderer } from "./look";
import type { MonsterKind, OutfitId, SceneId } from "../core/types";

export const STAGE_W = 1280, STAGE_H = 800;
export const SCENE_IDS: SceneId[] = ["c1", "c2", "c3", "c4", "c5"];
const HERO_X = -1.45, HERO_Z = 0.4, FOE_X = 1.75, FOE_Z = -1.8;
const BASE = import.meta.env.BASE_URL;
const CAM = new THREE.Vector3(0, 1.3, 6.6), LOOK = new THREE.Vector3(0, 1.25, 0);
const GOLD = 0xffc15a, MIST = 0x9a5cff;
const SHOW_X = 1.9; // 图鉴里神兽站的位置（左边是名单）

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

// ---------- 模型 ----------
const draco = new DRACOLoader(); draco.setDecoderPath(`${BASE}draco/`);
const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
const models = new Map<string, Promise<GLTF>>();
function loadModel(name: string) {
  let p = models.get(name);
  if (!p) { p = loader.loadAsync(`${BASE}models/${name}.glb`); models.set(name, p); p.catch(() => models.delete(name)); }
  return p;
}
const bgTex = new Map<SceneId, THREE.Texture>();
const texLoader = new THREE.TextureLoader();

/** 模型里叫 glow 的材质（护腕纹路、神兽的眼睛和裂缝）：收集起来控制亮度 */
function glowMats(root: THREE.Object3D) {
  const out = new Set<THREE.MeshStandardMaterial>();
  root.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if ((o as THREE.Mesh).isMesh && m?.name?.startsWith("glow")) out.add(m);
  });
  return [...out];
}
function allMats(root: THREE.Object3D) {
  const out = new Set<THREE.MeshStandardMaterial>();
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) for (const m of ([] as THREE.Material[]).concat((o as THREE.Mesh).material)) out.add(m as THREE.MeshStandardMaterial); });
  return [...out];
}

/** 一个带骨骼动画的角色：平时循环 Idle，play() 播一次别的动作再回到 Idle */
class Actor {
  readonly mixer: THREE.AnimationMixer;
  private acts = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private holds = new WeakSet<THREE.AnimationAction>();
  constructor(readonly root: THREE.Object3D, clips: THREE.AnimationClip[], private base = "Idle") {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) this.acts.set(c.name, this.mixer.clipAction(c));
    this.mixer.addEventListener("finished", e => { if (e.action === this.cur && this.cur.loop === THREE.LoopOnce && !this.holds.has(this.cur)) this.loop(this.base); });
    this.loop(base);
  }
  has(name: string) { return this.acts.has(name); }
  duration(name: string) { return this.acts.get(name)?.getClip().duration ?? 0; }
  /** 循环播放（Idle、Charge） */
  loop(name: string, fade = 0.25) { this.to(name, fade, true); }
  /** 播一次；hold = 停在最后一帧（被净化后伏下） */
  play(name: string, fade = 0.12, hold = false) { this.to(name, fade, false, hold); }
  private to(name: string, fade: number, loop: boolean, hold = false) {
    const a = this.acts.get(name);
    if (!a) return;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    if (hold) this.holds.add(a); else this.holds.delete(a);
    a.enabled = true; a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false);
    a.play();
    this.cur = a;
  }
}

// 主角外套的颜色（换礼物里的“红色外套”）
const OUTFITS: Record<OutfitId, number | null> = { tee: null, jacket: 0x8e2a22 };

/** 发光的圆点贴图（火花、金光、黑雾都用它） */
function dotTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.7)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** 金色发光的汉字（拼对的字化成金光打出去） */
function glyphTexture(ch: string) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.font = `900 176px "Noto Serif SC", "Songti SC", serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = "rgba(255,190,80,1)"; g.shadowBlur = 36; g.fillStyle = "#ffe3a0";
  g.fillText(ch, 128, 136); g.shadowBlur = 12; g.fillText(ch, 128, 136);
  g.shadowBlur = 0; g.fillStyle = "#fff8e6"; g.fillText(ch, 128, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

interface Particle { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; size: number; grav: number; drag: number }
interface Shard { m: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; life: number }
interface Foe { actor: Actor; root: THREE.Group; armor: THREE.Object3D[]; glow: THREE.MeshStandardMaterial[]; mats: THREE.MeshStandardMaterial[]; core: THREE.Object3D | null; top: number; hitY: number }

export class World {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, STAGE_W / STAGE_H, 0.1, 400);
  private composer: EffectComposer;
  private bg: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  sceneId: SceneId = "c1";
  // 怪物
  private foe: Foe | null = null;
  private foeWant: string | null = null;
  private broken = 0;
  private show = false; // 图鉴里展示：神兽站在中间慢慢转，已经净化（金光、不冒黑雾），主角不出场
  // 主角
  private hero = new THREE.Group();
  private heroActor: Actor | null = null;
  private heroMats: THREE.MeshStandardMaterial[] = [];
  private bracerGlow: THREE.MeshStandardMaterial[] = [];
  private muzzleNode: THREE.Object3D | null = null;
  private jacket: THREE.MeshStandardMaterial | null = null;
  private jacketColor = new THREE.Color();
  private outfit: OutfitId = "tee";
  private heroDX = 0; private heroFlash = 0; private charge = 0;
  // 特效
  private dot = dotTexture();
  private glyphs = new Map<string, THREE.Texture>();
  private parts: Particle[] = [];
  private shards: Shard[] = [];
  private shardMat = new THREE.MeshStandardMaterial({ color: 0x7a5a2a, metalness: 0.9, roughness: 0.45 });
  private ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private bracerLight = new THREE.PointLight(GOLD, 0, 4, 2);
  private hitLight = new THREE.PointLight(GOLD, 0, 7, 2);
  // 动画用“游戏时间”：顿帧时停住，慢动作时变慢
  private anims: { start: number; dur: number; fn: (k: number) => void; done?: () => void }[] = [];
  private gt = 0; private stopUntil = 0; private slowUntil = 0; private slowScale = 1;
  private hitT = -1; private hitPower = 0;
  private shakeAmp = 0; private shakeLeft = 0; private zoom = 0;
  private foeX = FOE_X; private foeXTarget = FOE_X; private foeKnock = 0; private foeFade = 1; private foeGlow = 1;
  private last = performance.now();
  private running = false;
  private proj = new THREE.Vector3();
  private fxLayer: HTMLDivElement;
  private flashEl: HTMLDivElement;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(STAGE_W, STAGE_H, false);
    setupRenderer(this.renderer);
    setupLights(this.renderer, this.scene);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(STAGE_W, STAGE_H), 0.5, 0.45, 1.15)); // 只让比白还亮的发光材质泛光，背景不泛光
    this.composer.addPass(new OutputPass());

    // 伤害字、闪屏叠在画布上
    this.fxLayer = document.createElement("div"); this.fxLayer.className = "fx3d";
    this.flashEl = document.createElement("div"); this.flashEl.className = "flash3d";
    canvas.after(this.fxLayer, this.flashEl);

    this.bg = this.makeBackdrop();
    // 地面不画出来，只接影子：远景图里本来就有地面
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.ShadowMaterial({ opacity: 0.42 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);

    this.scene.add(this.hero);
    this.hero.position.set(HERO_X, 0, HERO_Z); this.hero.rotation.y = -0.2; // 模型面朝 +X，侧身对着神兽、脸稍微转向镜头
    this.scene.add(this.bracerLight, this.hitLight);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 48), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.scene.add(this.ring);
    void this.loadHero();
    this.setScene("c1");
    document.addEventListener("visibilitychange", () => { this.last = performance.now(); });
  }

  /** 写实远景挂在远处一块大板上：跟镜头的基准姿势对齐，震屏时背景动得比角色少，有纵深感 */
  private makeBackdrop() {
    const c0 = this.camera.clone(); c0.position.copy(CAM); c0.lookAt(LOOK); c0.updateMatrixWorld();
    const D = 60, H = 2 * D * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const Ph = H * 1.12, Pw = Ph * 1.6;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(Pw, Ph), new THREE.MeshBasicMaterial({ fog: false, depthWrite: false, toneMapped: false }));
    bg.position.copy(V(0, 0, -D).applyMatrix4(c0.matrixWorld)); bg.quaternion.copy(c0.quaternion);
    bg.renderOrder = -1;
    this.scene.add(bg);
    return bg;
  }

  private async loadHero() {
    const g = await loadModel("hero");
    const root = g.scene; castShadows(root);
    this.hero.add(root);
    this.heroActor = new Actor(root, g.animations);
    this.heroMats = allMats(root);
    this.bracerGlow = glowMats(root);
    this.muzzleNode = root.getObjectByName("Muzzle") ?? null;
    this.jacket = this.heroMats.find(m => m.name.startsWith("jacket")) ?? null;
    if (this.jacket) this.jacketColor.copy(this.jacket.color);
    this.setOutfit(this.outfit);
  }

  setScene(id: SceneId) {
    if (!SCENE_IDS.includes(id)) id = "c1";
    this.sceneId = id;
    const show = (t: THREE.Texture) => { if (this.sceneId === id) { this.bg.material.map = t; this.bg.material.needsUpdate = true; } };
    const t = bgTex.get(id);
    if (t) show(t);
    else texLoader.load(`${BASE}bg/${id}.jpg`, tex => { tex.colorSpace = THREE.SRGBColorSpace; bgTex.set(id, tex); show(tex); });
    for (let i = 1; i <= 4; i++) void loadModel(`foes/${id}e${i}`).catch(() => {}); // 这一章的神兽先下载好
  }

  setOutfit(id: OutfitId) {
    this.outfit = id;
    const c = OUTFITS[id];
    if (this.jacket) this.jacket.color.copy(c === null ? this.jacketColor : new THREE.Color(c));
  }

  /** 打赢了：小乐做胜利动作 */
  cheer() { this.heroActor?.play("Victory"); }

  /** 图鉴里展示一只净化过的神兽；null = 回到战斗场景 */
  showcase(model: string | null) {
    this.show = !!model;
    this.hero.visible = !model;
    this.loadFoe(model);
  }

  /** 换神兽（模型编号，如 c1e2）；null = 没有。神兽从右边走进来、仰头怒吼 */
  setMonster(model: string | null) {
    this.show = false; this.hero.visible = true;
    this.loadFoe(model);
  }

  private loadFoe(model: string | null) {
    if (this.foe) this.scene.remove(this.foe.root);
    this.foe = null; this.foeWant = model; this.broken = 0;
    this.foeKnock = 0; this.foeFade = 1; this.foeGlow = 1;
    if (!model) return;
    void loadModel(`foes/${model}`).then(g => {
      if (this.foeWant !== model || this.foe) return;
      const root = cloneSkinned(g.scene) as THREE.Group;
      castShadows(root);
      const mats = allMats(root).map(m => { const c = m.clone(); c.transparent = true; return c; });
      const byName = new Map(mats.map(m => [m.name, m]));
      const swap = (m: THREE.Material) => byName.get(m.name) ?? m;
      root.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material); });
      const box = new THREE.Box3().setFromObject(root);
      const armor: THREE.Object3D[] = [];
      for (let i = 1; i <= 12; i++) { const a = root.getObjectByName(`Armor${i}`); if (a) armor.push(a); }
      const holder = new THREE.Group(); holder.add(root);
      holder.rotation.y = 0.5; // 模型面朝 -X，再稍微转向镜头
      const foe: Foe = { actor: new Actor(root, g.animations), root: holder, armor, glow: glowMats(root), mats, core: root.getObjectByName("Core") ?? null, top: box.max.y, hitY: (box.min.y + box.max.y) * 0.55 };
      this.foe = foe;
      this.scene.add(holder);
      if (this.show) {
        this.foeGlow = 0; this.foeX = this.foeXTarget = SHOW_X;
        foe.glow.forEach(m => m.emissive.set(GOLD));
        return;
      }
      this.foeXTarget = FOE_X; this.foeX = FOE_X + 5;
      sfx("step");
      this.anim(900, k => { this.foeX = FOE_X + 5 * (1 - k) ** 2; }, () => {
        if (this.foe !== foe) return;
        foe.actor.play("Roar"); this.shake(0.06, 0.5); this.mist(this.foeCore(), 26, 1.6);
      });
    }).catch(() => {});
  }

  /** 怪物离主角还剩几步（distance / total），越近越往左走 */
  setApproach(distance: number, total: number) { this.foeXTarget = FOE_X - (total - distance) * (0.8 / Math.max(1, total)); }

  /** 打掉多少护甲：0~1（整只神兽的进度），按比例把 Armor1…ArmorN 一块块打飞 */
  setDamage(frac: number) {
    const foe = this.foe;
    if (!foe) return;
    const want = Math.min(foe.armor.length, Math.floor(frac * foe.armor.length + 1e-6));
    while (this.broken < want) this.breakArmor(foe.armor[this.broken++]);
  }

  private breakArmor(plate: THREE.Object3D) {
    const at = plate.getWorldPosition(new THREE.Vector3());
    this.scene.attach(plate); // 从骨骼上取下来，保留当前位置
    this.shards.push({ m: plate, v: V(1.8 + rnd() * 2.2, 3 + rnd() * 2.5, 1 + rnd() * 1.5), w: V(rnd() * 8 - 4, rnd() * 8 - 4, rnd() * 8 - 4), life: 2.2 });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05 + rnd() * 0.07), this.shardMat);
      s.position.copy(at); s.castShadow = true; this.scene.add(s);
      this.shards.push({ m: s, v: V(rnd() * 5 - 1, 2 + rnd() * 4, rnd() * 3 - 1), w: V(rnd() * 14, rnd() * 14, rnd() * 14), life: 1.6 + rnd() });
    }
    this.sparks(at, 22, 1.2);
    sfx("seal");
  }

  /** 3D 点 → 舞台坐标 */
  toStage(x: number, y: number, z: number): [number, number] {
    this.proj.set(x, y, z).project(this.camera);
    return [(this.proj.x + 1) / 2 * STAGE_W, (1 - this.proj.y) / 2 * STAGE_H];
  }
  private foeCore() {
    const foe = this.foe;
    if (foe?.core) return foe.core.getWorldPosition(new THREE.Vector3());
    return V(this.foeX + this.foeKnock, foe?.hitY ?? 1.4, FOE_Z);
  }
  foeAnchor(dy = 0): [number, number] { const p = this.foeCore(); return this.toStage(p.x, p.y + dy, p.z); }
  foeTopAnchor(): [number, number] { return this.toStage(this.foeX - 0.6, (this.foe?.top ?? 2.6) * 0.92, FOE_Z); }

  private anim(dur: number, fn: (k: number) => void, done?: () => void) { this.anims.push({ start: this.gt, dur: dur / 1000, fn, done }); }

  // ---------- 出招 ----------
  /** 护腕前方发招的位置 */
  private muzzle() {
    if (this.muzzleNode) return this.muzzleNode.getWorldPosition(new THREE.Vector3());
    return V(HERO_X + this.heroDX + 0.5, 1.0, HERO_Z + 0.2);
  }
  private glyph(ch: string) {
    let t = this.glyphs.get(ch);
    if (!t) { t = glyphTexture(ch); this.glyphs.set(ch, t); }
    return t;
  }

  /**
   * 主角出招：左手护腕推向前方，拼对的字化成金光飞出去。hit = false 打偏。
   * power：light 拼对一个部分；heavy 一个字拼完；finisher 整题打完（蓄力后放出巨大的金字，净化神兽）。
   * label 是打中时飘起来的拼音，ch 是化成金光飞出去的字。onLand 在打中（或落空）那一刻调用。
   */
  attack(hit: boolean, onLand: () => void, power: Power = "light", label = "", ch = "") {
    if (hit && power === "finisher") { void this.finisher(onLand, label, ch); return; }
    this.heroActor?.play("Cast");
    const lead = (this.heroActor?.duration("Cast") ?? 0.7) * 0.5;
    this.glowPulse(0.9);
    this.anim(lead * 1000, () => {}, () => {
      sfx("whoosh");
      const A = this.muzzle();
      const B = hit ? this.foeCore().add(V(-0.2, 0, 0.6)) : V(this.foeX - 1.6, 0.3, 1.2);
      this.fly(A, B, hit ? 230 : 330, power === "heavy" ? 0.9 : 0.65, ch || "", () => {
        if (hit) this.impact(power === "heavy" ? 1 : 0.6, label);
        else { this.sparks(B, 8, 0.4, 0xbfd4ff); this.shake(0.04, 0.12); sfx("miss"); }
        onLand();
      });
    });
  }

  /** 一团金光（里面是那个字）从 A 飞到 B，拖着金色火花 */
  private fly(A: THREE.Vector3, B: THREE.Vector3, ms: number, size: number, ch: string, land: () => void) {
    const mat = new THREE.SpriteMaterial({ map: ch ? this.glyph(ch) : this.dot, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(mat); s.scale.setScalar(size); this.scene.add(s);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color: GOLD, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(size * 1.8); this.scene.add(halo);
    const p = new THREE.Vector3();
    this.anim(ms, k => {
      const e = k * k * (3 - 2 * k);
      p.lerpVectors(A, B, e); p.y += Math.sin(e * Math.PI) * 0.35;
      s.position.copy(p); halo.position.copy(p);
      s.scale.setScalar(size * (0.7 + 0.5 * e));
      if (rnd() < 0.8) this.emit(p, V(rnd() - 0.5, rnd() * 0.6, rnd() - 0.5), 0.35, 0.12 + rnd() * 0.1, GOLD, 0);
    }, () => { this.scene.remove(s, halo); mat.dispose(); land(); });
  }

  /** 打中的那一下：顿帧、震屏、推近、金色冲击波、火花、神兽受击后仰、飘拼音 */
  private impact(power: number, label: string) {
    const at = this.foeCore();
    this.hitT = this.gt; this.hitPower = power;
    this.hitStop(50 + power * 70);
    this.shake(0.06 + power * 0.1, 0.2 + power * 0.12);
    this.punchZoom(0.03 + power * 0.03);
    this.foeKnock = 0.25 + power * 0.35;
    this.foe?.actor.play("Hit", 0.05);
    this.shockwave(at, 0.8 + power * 0.8);
    this.sparks(at, Math.round(18 + power * 22), 0.8 + power * 0.8);
    this.mist(at, 8, 0.8);
    this.hitLight.position.copy(at).add(V(-0.4, 0.2, 0.8)); this.hitLight.intensity = 6 + power * 10;
    const [x, y] = this.toStage(at.x, at.y, at.z);
    if (label) this.floatText(x - 20, y - 110, label);
    sfx("punch");
  }

  private async finisher(onLand: () => void, label: string, ch: string) {
    // 往前踏一步、护腕举在胸前蓄力：金光往护腕里收
    const step = 0.6;
    this.heroActor?.loop("Charge", 0.15);
    sfx("whoosh");
    await new Promise<void>(r => this.anim(200, k => { this.heroDX = step * (1 - (1 - k) ** 3); }, r));
    await new Promise<void>(r => this.anim(650, k => {
      this.charge = k; this.zoom = Math.max(this.zoom, 0.05 * k);
      const A = this.muzzle();
      if (rnd() < 0.9) { const d = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(1.2); this.emit(A.clone().add(d), d.multiplyScalar(-2.2), 0.45, 0.1 + rnd() * 0.08, GOLD, 0, 0); }
    }, r));
    // 放出巨大的金字
    this.heroActor?.play("Cast", 0.05);
    this.charge = 0;
    this.flash(0.25, "#ffe6b0"); this.shake(0.1, 0.15);
    await new Promise<void>(r => this.fly(this.muzzle(), this.foeCore().add(V(-0.3, 0.1, 0.7)), 260, 2.2, ch, r));
    const at = this.foeCore();
    this.flash(0.75, "#fff3d6");
    this.hitT = this.gt; this.hitPower = 1.4;
    this.hitStop(180); this.slow(700, 0.3);
    this.shake(0.3, 0.55); this.punchZoom(0.1);
    this.shockwave(at, 2.6); this.shockwave(at, 1.6);
    this.sparks(at, 70, 2.2);
    this.hitLight.position.copy(at).add(V(-0.4, 0.2, 0.8)); this.hitLight.intensity = 30;
    this.foeKnock = 0.9;
    this.foe?.actor.play("Hit", 0.05);
    this.setDamage(1);
    const [x, y] = this.toStage(at.x, at.y, at.z);
    if (label) this.floatText(x - 20, y - 130, label);
    sfx("boom");
    onLand();
    this.anim(500, k => { this.heroDX = step * (1 - k); });
  }

  /** 大怪蓄力要反击：仰头怒吼，身上紫光大盛、黑雾翻涌 */
  bossCharge() {
    const foe = this.foe;
    if (!foe) return;
    foe.actor.play("Roar");
    sfx("whoosh");
    this.shake(0.12, 0.9);
    this.mist(this.foeCore(), 40, 2.4);
    this.anim(1400, k => { this.foeGlow = 1 + Math.sin(k * Math.PI) * 1.5; }, () => { this.foeGlow = 1; });
  }

  /** 神兽扑过来挥爪，小乐被打得后仰。onBite 返回 false 表示被挡住 */
  lunge(onBite: () => boolean) {
    const from = this.foeX, foe = this.foe;
    const reach = (foe?.actor.duration("Attack") ?? 1) * 0.5;
    foe?.actor.play("Attack");
    sfx("whoosh");
    this.anim(reach * 1000, k => { this.foeX = from + (HERO_X + 2.4 - from) * (k * k); }, () => {
      const hurt = onBite();
      const [hx, hy] = this.toStage(HERO_X, 1.4, HERO_Z);
      if (hurt) {
        this.heroActor?.play("Hit", 0.05);
        this.heroFlash = 1; this.hitStop(110); this.shake(0.22, 0.4); this.flash(0.3, "#ff5a48");
        this.mist(V(HERO_X + 0.4, 1, HERO_Z), 14, 1);
        this.anim(320, k => { this.heroDX = -0.35 * Math.sin((1 - k) * Math.PI / 2) * (1 - k); });
      } else {
        this.floatText(hx + 80, hy - 40, "挡住！"); this.shockwave(V(HERO_X + 0.6, 1, HERO_Z), 1.2); this.shake(0.08, 0.2);
      }
      this.anim(520, k => { this.foeX = HERO_X + 2.4 + (from - HERO_X - 2.6) * (1 - (1 - k) ** 3); });
    });
  }

  /** 净化神兽：黑雾散开、紫光熄灭变成金光，神兽伏下后慢慢隐去（大招打完后调用） */
  defeat(onDone: () => void) {
    const foe = this.foe;
    if (!foe) { onDone(); return; }
    foe.actor.play("Defeat", 0.2, true);
    const dur = Math.max(1.6, foe.actor.duration("Defeat"));
    this.mist(this.foeCore(), 60, 2.2);
    const gold = new THREE.Color(GOLD);
    this.anim(dur * 1000, k => {
      this.foeGlow = 1 - k;
      foe.glow.forEach(m => m.emissive.lerp(gold, 0.04));
      if (rnd() < 0.5) { const p = this.foeCore().add(V(rnd() * 2 - 1, rnd() * 1.5 - 0.5, rnd() - 0.5)); this.emit(p, V(0, 0.6 + rnd(), 0), 1.4, 0.08 + rnd() * 0.08, GOLD, 0, -0.2); }
    }, () => {
      this.anim(700, k => { this.foeFade = 1 - k; }, () => { if (this.foe === foe) this.setMonster(null); onDone(); });
    });
  }

  // ---------- 效果 ----------
  private emit(at: THREE.Vector3, v: THREE.Vector3, life: number, size: number, color: number, grav = 6, drag = 1.5, additive = true) {
    if (this.parts.length > 260) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.position.copy(at); s.scale.setScalar(size); this.scene.add(s);
    this.parts.push({ s, v, life, max: life, size, grav, drag });
  }
  private sparks(at: THREE.Vector3, n: number, power: number, color = GOLD) {
    if (reduce) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) this.emit(at, V((rnd() * 2 - 0.6) * 4 * power, (rnd() * 1.6 - 0.3) * 3.5 * power, (rnd() * 2 - 1) * 2.5 * power), 0.4 + rnd() * 0.5, 0.05 + rnd() * 0.07, color);
  }
  /** 紫黑色的雾（神兽身上冒出来、被打散） */
  private mist(at: THREE.Vector3, n: number, spread: number) {
    for (let i = 0; i < n; i++) {
      const c = rnd() < 0.5 ? MIST : 0x2a1640;
      this.emit(at.clone().add(V((rnd() - 0.5) * spread, (rnd() - 0.3) * spread, (rnd() - 0.5) * spread * 0.6)), V((rnd() - 0.3) * 1.2, 0.3 + rnd() * 0.8, (rnd() - 0.5) * 0.6), 1 + rnd() * 1.2, 0.35 + rnd() * 0.45, c, -0.1, 0.8, c === MIST);
    }
  }
  private shockwave(at: THREE.Vector3, size: number) {
    const r = this.ring.clone(); r.material = this.ring.material.clone();
    r.position.copy(at); r.lookAt(this.camera.position); this.scene.add(r);
    this.anim(380, k => { r.scale.setScalar(0.3 + size * k); r.material.opacity = 0.9 * (1 - k); }, () => { this.scene.remove(r); r.material.dispose(); });
  }
  private glowPulse(to: number) { this.anim(500, k => { this.charge = Math.max(this.charge, to * Math.sin(k * Math.PI)); }); }

  private shake(amp: number, sec: number) { if (reduce) return; this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeLeft = Math.max(this.shakeLeft, sec); }
  private punchZoom(z: number) { if (!reduce) this.zoom = Math.max(this.zoom, z); }
  private hitStop(ms: number) { if (!reduce) this.stopUntil = Math.max(this.stopUntil, performance.now() + ms); }
  private slow(ms: number, scale: number) { if (!reduce) { this.slowUntil = performance.now() + ms; this.slowScale = scale; } }
  private flash(alpha: number, color = "#ffffff") {
    this.flashEl.style.transition = "none"; this.flashEl.style.background = color; this.flashEl.style.opacity = String(alpha);
    void this.flashEl.offsetWidth; this.flashEl.style.transition = "opacity .4s ease-out"; this.flashEl.style.opacity = "0";
  }
  private floatText(x: number, y: number, text: string) {
    const el = document.createElement("div");
    el.className = "dmg"; el.textContent = text;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    this.fxLayer.append(el);
    setTimeout(() => el.remove(), 1200);
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

    // 镜头：慢慢呼吸 + 震屏 + 推近
    const sway = reduce ? 0 : Math.sin(t * 0.17);
    let sx = 0, sy = 0;
    if (this.shakeLeft > 0) { this.shakeLeft -= dt; const a = this.shakeAmp * Math.min(1, this.shakeLeft * 4); sx = (rnd() - 0.5) * 2 * a; sy = (rnd() - 0.5) * 2 * a * 0.7; if (this.shakeLeft <= 0) this.shakeAmp = 0; }
    this.zoom *= Math.pow(0.004, dt);
    this.camera.position.set(CAM.x + sway * 0.25 + sx, CAM.y + (reduce ? 0 : Math.sin(t * 0.13) * 0.04) + sy, CAM.z * (1 - this.zoom));
    this.camera.lookAt(LOOK.x + sx * 0.4, LOOK.y + sy * 0.4, LOOK.z);

    const list = this.anims; this.anims = [];
    const keep = list.filter(a => { const k = Math.min(1, (t - a.start) / a.dur); a.fn(k); if (k >= 1) { a.done?.(); return false; } return true; });
    this.anims = keep.concat(this.anims);

    // 主角
    this.heroActor?.mixer.update(gdt);
    this.hero.position.x = HERO_X + this.heroDX;
    const glow = 0.6 + this.charge * 5 + (reduce ? 0 : Math.sin(t * 2.2) * 0.15);
    this.bracerGlow.forEach(m => { m.emissiveIntensity = glow; });
    this.bracerLight.position.copy(this.muzzle()); this.bracerLight.intensity = this.charge * 14;
    if (this.heroFlash > 0) {
      this.heroFlash = Math.max(0, this.heroFlash - dt * 2.5);
      const on = this.heroFlash > 0.4;
      this.heroMats.forEach(m => { if (!m.name.startsWith("glow")) m.emissive?.setHex(on ? 0x5a120c : 0x000000); });
    }

    const foe = this.foe;
    if (foe) {
      foe.actor.mixer.update(gdt);
      if (this.foeFade === 1) this.foeX += (this.foeXTarget - this.foeX) * Math.min(1, gdt * 2.5);
      this.foeKnock *= Math.pow(0.03, gdt);
      foe.root.position.set(this.foeX + this.foeKnock, 0, FOE_Z);
      if (this.show) foe.root.rotation.y += gdt * 0.35;
      const hk = this.hitT >= 0 ? Math.max(0, 1 - (t - this.hitT) / 0.35) : 0;
      foe.glow.forEach(m => { m.emissiveIntensity = this.show ? 1.2 : (1.4 + (reduce ? 0 : Math.sin(t * 3) * 0.4)) * this.foeGlow + hk * 2 * this.hitPower; });
      if (this.foeFade < 1) foe.mats.forEach(m => { m.opacity = this.foeFade; m.depthWrite = this.foeFade > 0.5; });
      if (!reduce && this.foeGlow > 0.5 && rnd() < gdt * 6) this.mist(this.foeCore().add(V(0, 0.3, 0)), 1, 1.6); // 身上一直冒着黑雾
    }
    this.hitLight.intensity *= Math.pow(0.002, gdt);

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= gdt;
      if (p.life <= 0) { this.scene.remove(p.s); p.s.material.dispose(); this.parts.splice(i, 1); continue; }
      p.v.y -= p.grav * gdt; p.v.multiplyScalar(Math.pow(1 / (1 + p.drag), gdt));
      p.s.position.addScaledVector(p.v, gdt);
      const k = p.life / p.max;
      p.s.material.opacity = Math.min(1, k * 2.2);
      p.s.scale.setScalar(p.size * (0.6 + 0.4 * k) * (p.grav < 0.5 ? 1.8 - k : 1));
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const d = this.shards[i];
      d.life -= gdt;
      if (d.life <= 0) { this.scene.remove(d.m); this.shards.splice(i, 1); continue; }
      d.v.y -= 9.8 * gdt; d.m.position.addScaledVector(d.v, gdt);
      d.m.rotation.x += d.w.x * gdt; d.m.rotation.y += d.w.y * gdt; d.m.rotation.z += d.w.z * gdt;
      if (d.m.position.y < 0.04) { d.m.position.y = 0.04; d.v.multiplyScalar(0.45); d.v.y = Math.abs(d.v.y) * 0.4; d.w.multiplyScalar(0.6); }
      if (d.life < 0.4) d.m.scale.setScalar(Math.max(0.001, d.life / 0.4));
    }
    this.composer.render();
  }

  clearDrops() {
    this.parts.forEach(p => { this.scene.remove(p.s); p.s.material.dispose(); }); this.parts = [];
    this.shards.forEach(d => this.scene.remove(d.m)); this.shards = [];
  }
}
