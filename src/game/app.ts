// 游戏外壳：舞台缩放、存档、顶部状态、各个画面（首页、路线、宝箱、奇遇、篝火、结算、营地、图鉴）。
import itemsData from "../data/items.json";
import { pairsEvent, statueEvent } from "../core/events";
import { compose } from "../core/pinyin";
import { buy, loadProfile, saveProfile, SHOP } from "../core/progress";
import { makeRng, pick, shuffle } from "../core/rng";
import { campHeal, chestChoices, endBattle, finishRun, moveTo, newRun, takeChoice, type RunState } from "../core/run";
import type { HintId, Item, MapNode, Profile, RobeId, Syllable } from "../core/types";
import { hasVoice, say, sfx, unlockAudio, wait } from "./audio";
import { Battle } from "./battle";
import { picSvg } from "./pics";
import { BOON_INFO, h, HINT_INFO, ICON, NODE_INFO } from "./ui";
import { STAGE_H, STAGE_W, World } from "./world3d";

const PROFILE_KEY = "pq-profile", RUN_KEY = "pq-run", NODE_KEY = "pq-node"; // NODE_KEY：进了还没打完的节点
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* 存不了就算了 */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* 同上 */ } },
};

class Hud {
  root = h("div", "hud");
  private hearts = h("div", "pill hearts");
  private stars = h("div", "pill stars");
  private route = h("div", "pill route");
  private items = h("div", "items");
  onHint: ((id: HintId) => boolean) | null = null;
  constructor(private g: Game) {
    const left = h("div", "hud-left"); left.append(this.hearts, this.stars);
    this.root.append(left, this.route, this.items);
  }
  update(heartLost = false, newHint: HintId | null = null) {
    const r = this.g.run;
    this.hearts.setAttribute("aria-label", `还剩 ${r.hearts} 颗心`);
    this.hearts.innerHTML = Array.from({ length: r.maxHearts }, (_, i) => `<i class="${i < r.hearts ? "" : "off"}${heartLost && i === r.hearts ? " lost" : ""}"></i>`).join("");
    this.stars.innerHTML = `${ICON.star}<span>${r.stars}</span>`;
    this.route.innerHTML = Array.from({ length: 8 }, (_, i) => `${i ? '<i class="l"></i>' : ""}<i class="n${i + 1 < r.layer ? " done" : i + 1 === r.layer ? " now" : i === 7 ? " boss" : ""}"></i>`).join("");
    this.route.setAttribute("aria-label", `第 ${Math.max(1, r.layer)} 层，共 8 层`);
    this.items.replaceChildren();
    for (let i = 0; i < r.hintCap; i++) {
      const id = r.hints[i];
      const b = h("button", "it" + (id ? "" : " empty") + (id && newHint === id && i === r.hints.length - 1 ? " new" : ""));
      if (id) {
        b.innerHTML = HINT_INFO[id].icon; b.setAttribute("aria-label", HINT_INFO[id].name);
        b.addEventListener("click", () => {
          const ok = this.onHint?.(id) ?? false;
          if (ok) this.update(); else { sfx("nope"); b.classList.remove("no"); void b.offsetWidth; b.classList.add("no"); }
        });
      } else b.disabled = true;
      this.items.append(b);
    }
  }
}

export class Game {
  readonly items: Item[];
  profile: Profile;
  run!: RunState;
  rng = makeRng(Date.now() % 2147483647);
  world: World;
  hud: Hud;
  screen: HTMLDivElement;
  scale = 1;
  private stage: HTMLDivElement;
  private battle: Battle | null = null;

  constructor(root: HTMLElement) {
    this.items = (itemsData as Item[]).filter(i => hasVoice("i:" + i.id)); // 读音没核对通过的题不出、不进图鉴
    this.profile = loadProfile(store.get(PROFILE_KEY));
    root.innerHTML = `<div id="vp"><div id="stage"><canvas id="gl" width="${STAGE_W}" height="${STAGE_H}" aria-label="战斗场景"></canvas>
      <svg class="paper" width="${STAGE_W}" height="${STAGE_H}" aria-hidden="true"><filter id="paperf"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .47  0 0 0 0 .33  0 0 0 .45 0"/></filter><filter id="brush" x="-20%" y="-50%" width="140%" height="200%"><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="7"/></filter><rect width="${STAGE_W}" height="${STAGE_H}" filter="url(#paperf)"/></svg>
      <div class="vignette"></div><div id="screen"></div></div></div><div class="rotate">请把平板横过来玩</div>`;
    this.stage = root.querySelector("#stage")!;
    this.screen = root.querySelector("#screen")!;
    this.world = new World(root.querySelector("#gl")!);
    this.world.setRobe(this.profile.meta.robe);
    this.world.start();
    this.hud = new Hud(this);
    this.stage.append(this.hud.root);
    this.hud.root.hidden = true;
    const fit = () => {
      const s = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
      this.scale = s;
      this.stage.style.transform = `translate(${(innerWidth - STAGE_W * s) / 2}px, ${(innerHeight - STAGE_H * s) / 2}px) scale(${s})`;
    };
    addEventListener("resize", fit); fit();
    document.addEventListener("pointerdown", () => unlockAudio(), { capture: true });
    this.home();
  }

  toStage(e: { clientX: number; clientY: number }) {
    const r = this.stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
  }

  save() {
    store.set(PROFILE_KEY, saveProfile(this.profile));
    if (this.run && !this.run.over) store.set(RUN_KEY, JSON.stringify(this.run));
  }

  private toasts = h("div", "toast");
  toast(html: string) {
    if (!this.toasts.isConnected) this.stage.append(this.toasts);
    const t = h("span", "", html);
    this.toasts.append(t); setTimeout(() => t.remove(), 1700);
  }

  private show(...els: HTMLElement[]) { this.battle?.destroy(); this.battle = null; this.screen.replaceChildren(...els); }
  private setNight() { this.stage.classList.toggle("night", this.world.night); }

  // ---------- 首页 ----------
  home() {
    this.hud.root.hidden = true;
    this.world.setScene("shanye"); this.world.setMonster(null); this.setNight();
    const title = h("div", "home-title", `<h1>拼音闯关</h1><div class="seal">救回被偷走的声音</div>`);
    const saved = store.get(RUN_KEY);
    const go = h("button", "btn primary", saved ? "继续这一局" : "出发");
    go.addEventListener("click", () => {
      void tryFullscreen();
      if (saved) { try { this.run = JSON.parse(saved) as RunState; this.rng = makeRng(this.run.seed + this.run.layer * 7919 + 1); return this.resume(); } catch { store.del(RUN_KEY); } }
      this.startRun();
    });
    const actions = h("div", "home-actions"); actions.append(go);
    if (saved) {
      const fresh = h("button", "btn", "重新开始"); fresh.addEventListener("click", () => { store.del(RUN_KEY); store.del(NODE_KEY); this.startRun(); }); actions.append(fresh);
    }
    const shop = h("button", "btn", "营地"); shop.addEventListener("click", () => this.shop());
    const book = h("button", "btn", "图鉴"); book.addEventListener("click", () => this.book());
    actions.append(shop, book);
    const stars = h("div", "pill stars home-stars", `${ICON.star}<span>${this.profile.stars}</span>`);
    this.show(title, actions, stars);
  }

  private startRun() {
    const seed = (Date.now() % 2147483646) + 1;
    this.run = newRun(this.profile, seed);
    this.rng = makeRng(seed + 17);
    this.save();
    this.map();
  }

  /** 继续上次的局：上次进了没打完的节点，重新进；否则回路线图 */
  private resume() {
    const pending = store.get(NODE_KEY);
    const node = pending && pending === this.run.nodeId ? this.run.map.layers[this.run.layer - 1]?.find(n => n.id === pending) : undefined;
    if (node) return this.open(node);
    this.map();
  }

  // ---------- 路线图 ----------
  map() {
    store.del(NODE_KEY);
    const run = this.run;
    this.hud.root.hidden = false; this.hud.update();
    this.world.setScene(run.map.scenes[Math.min(run.layer, 7)]); this.world.setMonster(null); this.setNight();
    const wrap = h("div", "panel mapwrap", `<h2>选一条路往前走</h2>`);
    const grid = h("div", "mapgrid");
    const W = 1088, H = 440;
    const pos = (n: MapNode) => [40 + (n.layer - 1) * ((W - 80) / 7), 40 + n.lane * ((H - 80) / 2) + (n.layer === 1 || n.layer === 8 ? 0 : 0)] as const;
    const current = run.nodeId ? run.map.layers[run.layer - 1].find(n => n.id === run.nodeId) : null;
    const reachable = new Set(current ? current.next : run.map.layers[0].map(n => n.id));
    let edges = "";
    for (const layer of run.map.layers) for (const n of layer) for (const nx of n.next) {
      const m = run.map.layers[n.layer].find(k => k.id === nx)!;
      const [x1, y1] = pos(n), [x2, y2] = pos(m);
      const walked = n.id === run.nodeId && false;
      edges += `<path class="${walked ? "walked" : ""}" d="M${x1} ${y1} L${x2} ${y2}"/>`;
    }
    grid.innerHTML = `<svg class="edges" viewBox="0 0 ${W} ${H}">${edges}</svg>`;
    for (const layer of run.map.layers) for (const n of layer) {
      const [x, y] = pos(n);
      const can = reachable.has(n.id);
      const b = h("button", "node" + (n.layer < run.layer ? " past" : "") + (n.id === run.nodeId ? " here" : "") + (can ? " can" : n.layer > run.layer ? " locked" : ""), NODE_INFO[n.type].icon + `<span class="lbl">${NODE_INFO[n.type].name}</span>`);
      b.style.left = `${x}px`; b.style.top = `${y}px`;
      b.setAttribute("aria-label", NODE_INFO[n.type].name);
      if (can) b.addEventListener("click", () => this.enter(n));
      else b.disabled = true;
      grid.append(b);
    }
    if (current) { const [x, y] = pos(current); const hat = h("div", "hatmark", ICON.hat); hat.style.left = `${x}px`; hat.style.top = `${y}px`; grid.append(hat); }
    wrap.append(grid);
    this.show(wrap);
  }

  private enter(n: MapNode) {
    if (!moveTo(this.run, n.id)) return;
    sfx("step");
    store.set(NODE_KEY, n.id);
    this.save();
    this.open(n);
  }

  private open(n: MapNode) {
    this.hud.root.hidden = false; this.hud.update();
    this.world.setScene(this.run.map.scenes[n.layer - 1]); this.setNight();
    switch (n.type) {
      case "battle": case "elite": case "boss": return this.fight(n.type);
      case "chest": return this.chest("打开宝箱，挑一样");
      case "event": return this.rng() < 0.5 ? this.statue() : this.pairs();
      case "camp": return this.camp();
    }
  }

  private fight(kind: "battle" | "elite" | "boss") {
    this.show();
    this.battle = new Battle(this, kind, () => {
      this.battle = null;
      endBattle(this.run, kind);
      this.hud.update(); this.save();
      if (kind === "boss") return this.result(true);
      if (kind === "elite") return this.chest("打赢精英，挑一样奖励");
      this.toast(`${ICON.star} 打赢了`);
      setTimeout(() => this.map(), 900);
    });
  }

  runLost() { this.result(false); }

  // ---------- 宝箱 ----------
  private chest(title: string) {
    this.world.setMonster(null);
    const choices = chestChoices(this.run, this.rng);
    const box = h("div", "choose", `<h2>${title}</h2>`);
    const row = h("div", "choices");
    for (const c of choices) {
      const info = c.type === "boon" ? BOON_INFO[c.id] : { name: HINT_INFO[c.id].name, desc: "提示道具", icon: HINT_INFO[c.id].icon };
      const b = h("button", "panel choice", `<span class="ic">${info.icon}</span><b>${info.name}</b><span>${info.desc}</span>`);
      b.addEventListener("click", () => {
        const ok = takeChoice(this.run, c);
        sfx(ok ? "coin" : "nope");
        if (!ok) { this.toast("道具栏满了，换一个吧"); return; }
        this.hud.update(false, c.type === "hint" ? c.id : null); this.save();
        setTimeout(() => this.map(), 500);
      });
      row.append(b);
    }
    box.append(row);
    this.show(box);
    sfx("chime");
  }

  // ---------- 奇遇：石像 ----------
  private statue() {
    let ev: { target: Syllable; options: string[] } | null = null;
    for (let k = 0; k < 8 && !ev; k++) { const e = statueEvent(this.items.filter(i => i.kind === "char"), this.rng); if (hasVoice("s:" + e.target.written)) ev = e; }
    if (!ev) return this.pairs();
    const target = ev.target;
    this.quiz("石像在说话", "它说的是哪一个？", "s:" + target.written, ev.options, target.written, ok => {
      if (ok) {
        const hint = pick(this.rng, ["slow", "sweep", "ghost", "trace"] as HintId[]);
        if (takeChoice(this.run, { type: "hint", id: hint })) { this.toast(`石像送你一个道具：${HINT_INFO[hint].name}`); this.hud.update(false, hint); }
        else { this.run.stars += 2; this.toast(`${ICON.star} +2`); this.hud.update(); }
      }
      this.save();
    }, `<svg class="statue" viewBox="0 0 64 64" fill="none" stroke="#2b2a26" stroke-width="2.6" stroke-linejoin="round"><path d="M14 58V30c0-12 8-20 18-20s18 8 18 20v28z" fill="#b9b7b0"/><path d="M22 30h6M36 30h6M26 44q6 4 12 0"/><path d="M10 58h44"/></svg>`);
  }

  /** 听音选拼音（石像和篝火复习共用） */
  private quiz(title: string, ask: string, voice: string, options: string[], answer: string, done: (ok: boolean) => void, art = "") {
    this.world.setMonster(null);
    const card = h("div", "panel center-card", `<h2>${title}</h2>${art}<p>${ask}</p>`);
    const hear = h("button", "btn small", `${ICON.speaker}<span>再听一遍</span>`);
    hear.addEventListener("click", () => void say(voice));
    const row = h("div", "row");
    let answered = false;
    for (const o of options) {
      const b = h("button", "btn opt", o);
      b.addEventListener("click", async () => {
        if (answered) return; answered = true;
        const ok = o === answer;
        b.classList.add(ok ? "right" : "wrong");
        row.querySelectorAll("button").forEach(x => { if (x.textContent === answer) x.classList.add("right"); });
        sfx(ok ? "coin" : "nope");
        done(ok);
        await say(voice);
        await wait(600);
        cont.hidden = false;
      });
      row.append(b);
    }
    const cont = h("button", "btn primary", "继续"); cont.hidden = true; cont.addEventListener("click", () => this.map());
    card.append(hear, row, cont);
    this.show(card);
    setTimeout(() => void say(voice), 500);
  }

  // ---------- 奇遇：声母韵母配对 ----------
  private pairs() {
    this.world.setMonster(null);
    const ev = pairsEvent(this.rng, this.profile.level);
    const card = h("div", "panel center-card", `<h2>拼一拼</h2><p>点一个声母，再点一个韵母，拼出 3 个音</p>`);
    const row = h("div", "row");
    const left = h("div", "pair-col"), right = h("div", "pair-col");
    let sel: HTMLButtonElement | null = null, made = 0;
    const cont = h("button", "btn primary", "继续"); cont.hidden = true; cont.addEventListener("click", () => this.map());
    for (const ini of ev.initials) {
      const b = h("button", "btn pair-btn", ini);
      b.addEventListener("click", () => { sel?.classList.remove("sel"); sel = b; b.classList.add("sel"); sfx("snap"); if (hasVoice("p:" + ini)) void say("p:" + ini); });
      left.append(b);
    }
    for (const fin of ev.finals) {
      const b = h("button", "btn pair-btn", fin);
      b.addEventListener("click", async () => {
        if (!sel) { if (hasVoice("p:" + fin)) void say("p:" + fin); return; }
        const s = compose([sel.textContent!, fin], 1);
        if (!s) { sfx("nope"); sel.classList.remove("sel"); sel = null; return; }
        sfx("coin"); sel.classList.add("done"); sel.classList.remove("sel"); b.classList.add("done"); sel = null; made++;
        this.toast(s);
        if (hasVoice("s:" + s)) await say("s:" + s);
        if (made >= 3) { this.run.stars += 3; this.hud.update(); this.save(); this.toast(`${ICON.star} +3`); cont.hidden = false; }
      });
      right.append(b);
    }
    row.append(left, right);
    card.append(row, cont);
    this.show(card);
  }

  // ---------- 篝火 ----------
  private camp() {
    this.world.setMonster(null);
    const card = h("div", "panel center-card", `<h2>篝火</h2><p>歇一歇，或者把错过的题再练一遍</p>`);
    const row = h("div", "row");
    const rest = h("button", "btn", `${ICON.heart}<span>歇一歇，回一颗心</span>`);
    rest.addEventListener("click", () => { campHeal(this.run); sfx("chime"); this.hud.update(); this.save(); this.map(); });
    row.append(rest);
    const errs = this.run.errors.map(id => this.items.find(i => i.id === id)).filter((i): i is Item => !!i && i.kind === "char");
    if (errs.length) {
      const learn = h("button", "btn", `${ICON.star}<span>练一练，得三颗星</span>`);
      learn.addEventListener("click", () => {
        const it = pick(this.rng, errs);
        const right = it.pinyin[0];
        const opts = shuffle(this.rng, [right, ...statueEvent([it], this.rng).options.filter(o => o !== right).slice(0, 2)]);
        this.quiz("练一练", "听一听，选出对的拼音", "i:" + it.id, opts, right, ok => { if (ok) { this.run.stars += 3; this.hud.update(); this.toast(`${ICON.star} +3`); } this.save(); }, `<div style="font-size:72px;font-weight:700">${it.hanzi}</div>`);
      });
      row.append(learn);
    }
    card.append(row);
    this.show(card);
  }

  // ---------- 结算 ----------
  private result(won: boolean) {
    const run = this.run;
    const before = this.profile.level;
    finishRun(this.profile, run);
    store.del(RUN_KEY); store.del(NODE_KEY);
    store.set(PROFILE_KEY, saveProfile(this.profile));
    this.world.setMonster(null);
    this.hud.root.hidden = true;
    const card = h("div", "panel center-card", `<h2>${won ? "打败首领，这一局赢了！" : "这一局到这里"}</h2>
      <p>走到第 ${run.layer} 层${won ? "，所有怪物身上的音都救回来了" : "，星星照样带回营地"}</p>
      <div class="bigstars">${ICON.star}+${run.stars}</div>
      <p>营地里一共有 ${this.profile.stars} 颗星${this.profile.level > before ? "，题目变难了一点" : ""}</p>`);
    const back = h("button", "btn primary", "回到首页"); back.addEventListener("click", () => this.home());
    card.append(back);
    this.show(card);
    sfx(won ? "chime" : "nope");
  }

  // ---------- 营地（用星星换东西） ----------
  private shop() {
    const robe = (id: RobeId) => `<svg viewBox="0 0 64 64" width="130" height="130" fill="none" stroke="#2b2a26" stroke-width="2.4" stroke-linejoin="round"><path d="M24 22h16l10 36H14z" fill="${id === "zhuqing" ? "#3f6b5e" : "#d9d6cc"}"/><rect x="18" y="34" width="28" height="4" fill="#b44a36"/><circle cx="32" cy="16" r="7" fill="#f2e4cc"/><path d="M8 14L32 4l24 10c-14 3-34 3-48 0z" fill="#3a372f"/></svg>`;
    const wares: { id: string; name: string; desc: string; pv: string; cost: number; owned: boolean; act: () => void }[] = [
      { id: "robe-yuebai", name: "月白长袍", desc: "换一身衣服", pv: robe("yuebai"), cost: SHOP[0].cost, owned: this.profile.meta.robesOwned.includes("yuebai"), act: () => this.wear("yuebai") },
      { id: "extra-heart", name: "多一颗心", desc: "每局开始多一颗心", pv: `<span style="width:110px;color:#b44a36">${ICON.heart}</span>`, cost: SHOP[1].cost, owned: this.profile.meta.extraHeart, act: () => {} },
      { id: "extra-slot", name: "多一格道具", desc: "能多带一个提示道具", pv: `<span style="width:110px">${BOON_INFO.bag.icon}</span>`, cost: SHOP[2].cost, owned: this.profile.meta.extraSlot, act: () => {} },
    ];
    const back = h("button", "btn small back", `${ICON.back}<span>回去</span>`); back.addEventListener("click", () => this.home());
    const stars = h("div", "pill stars home-stars", `${ICON.star}<span>${this.profile.stars}</span>`);
    const row = h("div", "shop");
    for (const w of wares) {
      const card = h("div", "panel ware" + (w.owned ? " owned" : ""), `<div class="pv">${w.pv}</div><b>${w.name}</b><span>${w.desc}</span>`);
      const btn = h("button", "btn small", w.owned ? (w.id === "robe-yuebai" ? (this.profile.meta.robe === "yuebai" ? "换回竹青" : "穿上") : "已经有了") : `<span class="cost">${ICON.star}${w.cost}</span>`);
      btn.addEventListener("click", () => {
        if (w.owned) { if (w.id === "robe-yuebai") { this.wear(this.profile.meta.robe === "yuebai" ? "zhuqing" : "yuebai"); this.shop(); } return; }
        if (!buy(this.profile, w.id as (typeof SHOP)[number]["id"])) { sfx("nope"); this.toast(`星星还不够，还差 ${w.cost - this.profile.stars} 颗`); return; }
        sfx("coin"); w.act(); this.save(); this.shop();
      });
      card.append(btn); row.append(card);
    }
    this.show(back, stars, row);
  }

  private wear(id: RobeId) { this.profile.meta.robe = id; this.world.setRobe(id); this.save(); }

  // ---------- 图鉴 ----------
  private book(tab: "char" | "word" | "idiom" = "char") {
    const got = new Set(this.profile.collected);
    const list = this.items.filter(i => i.kind === tab);
    const back = h("button", "btn small back", `${ICON.back}<span>回去</span>`); back.addEventListener("click", () => this.home());
    const panel = h("div", "panel book", `<h2>图鉴 · 已经救回 ${this.items.filter(i => got.has(i.id)).length} / ${this.items.length} 个音</h2>`);
    const tabs = h("div", "tabs");
    for (const [k, name] of [["char", "字"], ["word", "词语"], ["idiom", "成语"]] as const) {
      const b = h("button", "btn" + (k === tab ? " on" : ""), name); b.addEventListener("click", () => this.book(k)); tabs.append(b);
    }
    const grid = h("div", "grid");
    for (const it of list) {
      const has = got.has(it.id);
      const e = h("button", `entry ${it.kind}` + (has ? "" : " locked"), has ? `${it.pic ? picSvg(it.pic, 40) : ""}<span class="p">${it.pinyin.join(" ")}</span><span class="h">${it.hanzi}</span>` : `<span class="h">？</span>`);
      if (has) e.addEventListener("click", () => void say("i:" + it.id)); else e.disabled = true;
      grid.append(e);
    }
    panel.append(tabs, grid);
    this.show(back, panel);
  }
}

async function tryFullscreen() {
  const standalone = matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
  if (standalone || document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen();
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
  } catch { /* 浏览器不让就算了 */ }
}
