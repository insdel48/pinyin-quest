// 游戏外壳：舞台缩放、存档、顶部状态、各个画面（首页、路线、宝箱、小游戏、火堆、结算、换礼物、声音本）。
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

// NODE_KEY：进了还没打完的节点；PATH_KEY：这一局走过的节点
const PROFILE_KEY = "pq-profile", RUN_KEY = "pq-run", NODE_KEY = "pq-node", PATH_KEY = "pq-path";
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* 存不了就算了 */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* 同上 */ } },
};

class Hud {
  root = h("div", "hud");
  private hearts = h("div", "pill hearts");
  private stars = h("div", "pill stars");
  private boons = h("div", "boons");
  private route = h("div", "pill route");
  private right = h("div", "hud-right");
  private streak = h("div", "streak");
  private items = h("div", "items");
  private onHint: ((id: HintId) => boolean) | null = null;
  constructor(private g: Game) {
    const left = h("div", "hud-left"); left.append(this.hearts, this.stars, this.boons);
    this.right.append(this.streak, this.items);
    this.root.append(left, this.route, this.right);
  }
  /** 战斗里才能用道具；其他画面道具按钮变暗 */
  setHint(fn: ((id: HintId) => boolean) | null) { this.onHint = fn; this.items.classList.toggle("off", !fn); }
  update(heartLost = false, newHint: HintId | null = null) {
    const r = this.g.run;
    this.hearts.setAttribute("aria-label", `还剩 ${r.hearts} 颗心`);
    this.hearts.innerHTML = Array.from({ length: r.maxHearts }, (_, i) => `<i class="${i < r.hearts ? "" : "off"}${heartLost && i === r.hearts ? " lost" : ""}">${ICON.heart}</i>`).join("");
    this.stars.innerHTML = `${ICON.star}<span>${r.stars}</span>`;
    this.boons.innerHTML = r.boons.map(b => `<i title="${BOON_INFO[b].name}" class="${b === "shield" && r.shieldUsed ? "used" : ""}">${BOON_INFO[b].icon}</i>`).join("");
    this.route.innerHTML = Array.from({ length: 8 }, (_, i) => `${i ? '<i class="l"></i>' : ""}<i class="n${i + 1 < r.layer ? " done" : i + 1 === r.layer ? " now" : i === 7 ? " boss" : ""}"></i>`).join("");
    this.route.setAttribute("aria-label", `第 ${Math.max(1, r.layer)} 站，共 8 站`);
    const need = r.boons.includes("wick") ? 2 : 3;
    this.streak.innerHTML = Array.from({ length: need }, (_, i) => `<i class="${i < r.streak ? "on" : ""}"></i>`).join("");
    this.streak.hidden = r.hints.length >= r.hintCap;
    this.items.replaceChildren();
    for (let i = 0; i < r.hintCap; i++) {
      const id = r.hints[i];
      const b = h("button", "it" + (id ? "" : " empty") + (id && newHint === id && i === r.hints.length - 1 ? " new" : ""));
      if (id) {
        b.innerHTML = HINT_INFO[id].icon; b.setAttribute("aria-label", HINT_INFO[id].name);
        b.addEventListener("click", () => {
          const ok = this.onHint?.(id) ?? false;
          if (ok) this.update();
          else { b.classList.remove("no"); void b.offsetWidth; b.classList.add("no"); this.g.toast(`${HINT_INFO[id].icon} ${HINT_INFO[id].name}：${HINT_INFO[id].desc}`); }
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
  private path: string[] = [];
  private collectedAtStart = 0;

  constructor(root: HTMLElement) {
    this.items = (itemsData as Item[]).filter(i => hasVoice("i:" + i.id)); // 读音没核对通过的题不出、不进声音本
    this.profile = loadProfile(store.get(PROFILE_KEY));
    root.innerHTML = `<div id="vp"><div id="stage"><canvas id="gl" width="${STAGE_W}" height="${STAGE_H}" aria-label="战斗场景"></canvas>
      <svg class="paper" width="${STAGE_W}" height="${STAGE_H}" aria-hidden="true"><filter id="paperf"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .47  0 0 0 0 .33  0 0 0 .45 0"/></filter><filter id="brush" x="-20%" y="-50%" width="140%" height="200%"><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="7"/></filter><rect width="${STAGE_W}" height="${STAGE_H}" filter="url(#paperf)"/></svg>
      <div class="vignette"></div><div id="screen"></div></div></div><div class="rotate"><div><svg viewBox="0 0 64 64" width="96" height="96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><rect x="20" y="6" width="24" height="40" rx="4"/><path d="M10 54c10 6 34 6 44 0M48 50l6 4-4 6"/></svg><p>横过来玩</p></div></div>`;
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
    if (this.run && !this.run.over) { store.set(RUN_KEY, JSON.stringify(this.run)); store.set(PATH_KEY, JSON.stringify(this.path)); }
  }

  private toasts = h("div", "toast");
  toast(html: string) {
    if (!this.toasts.isConnected) this.stage.append(this.toasts);
    const t = h("span", "", html);
    this.toasts.append(t); setTimeout(() => t.remove(), 1900);
  }

  private show(...els: HTMLElement[]) { this.battle?.destroy(); this.battle = null; this.hud.setHint(null); this.screen.replaceChildren(...els); }
  private setNight() { this.stage.classList.toggle("night", this.world.night); }
  /** 点一下就锁住，防止孩子连点 */
  private once(b: HTMLButtonElement, fn: () => void) { b.addEventListener("click", () => { if (b.dataset.done) return; b.dataset.done = "1"; fn(); }); }

  // ---------- 首页 ----------
  home() {
    this.hud.root.hidden = true;
    this.world.setScene("shanye"); this.world.setMonster(null); this.setNight();
    const title = h("div", "home-title", `<h1>拼音闯关</h1><div class="seal">救回被偷走的声音</div>`);
    const saved = store.get(RUN_KEY);
    const go = h("button", "btn primary", `${ICON.play}<span>${saved ? "继续玩" : "出发"}</span>`);
    go.addEventListener("click", () => {
      void tryFullscreen();
      if (saved) {
        try {
          this.run = JSON.parse(saved) as RunState; this.rng = makeRng(this.run.seed + this.run.layer * 7919 + 1);
          try { this.path = JSON.parse(store.get(PATH_KEY) ?? "[]") as string[]; } catch { this.path = []; }
          this.collectedAtStart = this.profile.collected.length;
          return this.resume();
        } catch { store.del(RUN_KEY); }
      }
      this.startRun();
    });
    const actions = h("div", "home-actions"); actions.append(go);
    const shop = h("button", "btn", `${ICON.star}<span>换礼物</span>`); shop.addEventListener("click", () => this.shop());
    const book = h("button", "btn", `${BOOK_ICON}<span>声音本</span>`); book.addEventListener("click", () => this.book());
    actions.append(shop, book);
    const els: HTMLElement[] = [title, actions, h("div", "pill stars home-stars", `${ICON.star}<span>${this.profile.stars}</span>`)];
    if (saved) {
      // 从头玩要点两次，免得孩子误点把这一局清掉
      const fresh = h("button", "btn small fresh", "从头玩");
      fresh.addEventListener("click", () => {
        if (!fresh.classList.contains("sure")) { fresh.classList.add("sure"); fresh.textContent = "再点一次就从头开始"; sfx("nope"); return; }
        store.del(RUN_KEY); store.del(NODE_KEY); store.del(PATH_KEY); this.startRun();
      });
      els.push(fresh);
    }
    this.show(...els);
  }

  private startRun() {
    const seed = (Date.now() % 2147483646) + 1;
    this.run = newRun(this.profile, seed);
    this.rng = makeRng(seed + 17);
    this.path = [];
    this.collectedAtStart = this.profile.collected.length;
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
    const wrap = h("div", "panel mapwrap", `<h2>选下一站，点亮着的</h2>`);
    const grid = h("div", "mapgrid");
    const W = 1088, H = 440;
    const pos = (n: MapNode) => [40 + (n.layer - 1) * ((W - 80) / 7), 40 + n.lane * ((H - 80) / 2)] as const;
    const current = run.nodeId ? run.map.layers[run.layer - 1].find(n => n.id === run.nodeId) : null;
    const reachable = new Set(current ? current.next : run.map.layers[0].map(n => n.id));
    const walked = new Set(this.path.slice(1).map((id, i) => `${this.path[i]}>${id}`));
    let edges = "";
    for (const layer of run.map.layers) for (const n of layer) for (const nx of n.next) {
      const m = run.map.layers[n.layer].find(k => k.id === nx)!;
      const [x1, y1] = pos(n), [x2, y2] = pos(m);
      edges += `<path class="${walked.has(`${n.id}>${nx}`) ? "walked" : ""}" d="M${x1} ${y1} L${x2} ${y2}"/>`;
    }
    grid.innerHTML = `<svg class="edges" viewBox="0 0 ${W} ${H}">${edges}</svg>`;
    for (const layer of run.map.layers) for (const n of layer) {
      const [x, y] = pos(n);
      const can = reachable.has(n.id);
      const b = h("button", "node" + (n.layer < run.layer ? " past" : "") + (n.id === run.nodeId ? " here" : "") + (can ? " can" : n.layer > run.layer ? " locked" : ""), NODE_INFO[n.type].icon + `<span class="lbl">${NODE_INFO[n.type].name}</span>`);
      b.style.left = `${x}px`; b.style.top = `${y}px`;
      b.setAttribute("aria-label", NODE_INFO[n.type].name);
      if (can) this.once(b, () => this.enter(n)); else b.disabled = true;
      grid.append(b);
    }
    if (current) { const [x, y] = pos(current); const hat = h("div", "hatmark", ICON.hat); hat.style.left = `${x}px`; hat.style.top = `${y}px`; grid.append(hat); }
    wrap.append(grid);
    const home = h("button", "btn small homebtn", `${ICON.home}<span>回首页</span>`); home.addEventListener("click", () => this.home());
    this.show(wrap, home);
    if (this.profile.runsCompleted === 0 && run.layer <= 1) void say("v:map");
  }

  private enter(n: MapNode) {
    if (!moveTo(this.run, n.id)) return;
    sfx("step");
    this.path.push(n.id);
    store.set(NODE_KEY, n.id);
    this.save();
    this.open(n);
  }

  private open(n: MapNode) {
    this.hud.root.hidden = false; this.hud.update();
    this.world.setScene(this.run.map.scenes[n.layer - 1]); this.setNight();
    switch (n.type) {
      case "battle": case "elite": case "boss": return this.fight(n.type);
      case "chest": return this.chest(false);
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
      if (kind === "elite") return this.chest(true);
      this.toast(`${ICON.star} +2 打赢啦！`);
      setTimeout(() => this.map(), 1100);
    });
  }

  runLost() { this.result(false); }

  // ---------- 宝箱 ----------
  private chest(elite: boolean) {
    this.world.setMonster(null);
    const full = this.run.hints.length >= this.run.hintCap;
    // 道具栏满了，道具选项只留一张，换成两颗星
    const choices = chestChoices(this.run, this.rng).filter((c, i, all) => !(full && c.type === "hint" && all.findIndex(x => x.type === "hint") !== i));
    const box = h("div", "choose", `<h2>${elite ? "打赢大怪啦！挑一个宝贝" : "挑一个宝贝"}</h2>`);
    const row = h("div", "choices");
    const all: HTMLButtonElement[] = [];
    for (const c of choices) {
      // 道具栏满了，道具换成两颗星，不会卡在宝箱里
      const info = c.type === "boon" ? BOON_INFO[c.id] : full ? { name: "两颗星", desc: "道具装满了，换成星星", icon: ICON.star } : HINT_INFO[c.id];
      const b = h("button", "panel choice", `<span class="ic${c.type === "hint" && full ? " gold" : ""}">${info.icon}</span><b>${info.name}</b><span>${info.desc}</span>`);
      b.addEventListener("click", () => {
        if (all.some(x => x.dataset.done)) return;
        b.dataset.done = "1"; b.classList.add("picked");
        const ok = takeChoice(this.run, c);
        if (!ok) this.run.stars += 2;
        sfx("coin");
        this.hud.update(false, ok && c.type === "hint" ? c.id : null); this.save();
        setTimeout(() => this.map(), 700);
      });
      all.push(b); row.append(b);
    }
    box.append(row);
    this.show(box);
    sfx("chime");
    void say(elite ? "v:elite" : "v:chest");
  }

  // ---------- 小游戏：石像 ----------
  private statue() {
    let ev: { target: Syllable; options: string[] } | null = null;
    for (let k = 0; k < 8 && !ev; k++) { const e = statueEvent(this.items.filter(i => i.kind === "char"), this.rng); if (hasVoice("s:" + e.target.written)) ev = e; }
    if (!ev) return this.pairs();
    const target = ev.target;
    this.quiz("石像说话啦", "听一听，点对的拼音", "s:" + target.written, ev.options, target.written, ok => {
      if (ok) {
        const hint = pick(this.rng, ["slow", "sweep", "ghost", "trace"] as HintId[]);
        if (takeChoice(this.run, { type: "hint", id: hint })) { this.toast(`送你 ${HINT_INFO[hint].icon} ${HINT_INFO[hint].name}`); this.hud.update(false, hint); }
        else { this.run.stars += 2; this.toast(`${ICON.star} +2`); this.hud.update(); }
      }
      this.save();
    }, `<svg class="statue" viewBox="0 0 64 64" fill="none" stroke="#2b2a26" stroke-width="2.6" stroke-linejoin="round"><path d="M14 58V30c0-12 8-20 18-20s18 8 18 20v28z" fill="#b9b7b0"/><path d="M22 30h6M36 30h6M26 44q6 4 12 0"/><path d="M10 58h44"/></svg>`, "v:statue");
  }

  /** 听音选拼音（石像和火堆练错题共用） */
  private quiz(title: string, ask: string, voice: string, options: string[], answer: string, done: (ok: boolean) => void, art = "", intro = "") {
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
        await wait(500);
        cont.hidden = false;
      });
      row.append(b);
    }
    const cont = h("button", "btn primary", `${ICON.play}<span>继续</span>`); cont.hidden = true; this.once(cont, () => this.map());
    card.append(hear, row, cont);
    this.show(card);
    void (async () => { if (intro) { await wait(300); await say(intro); } await wait(300); await say(voice); })();
  }

  // ---------- 小游戏：左右配对 ----------
  private pairs() {
    this.world.setMonster(null);
    const ev = pairsEvent(this.rng, this.profile.level);
    const card = h("div", "panel center-card", `<h2>拼一拼</h2><p>左边点一个，右边点一个，拼出三个音</p>`);
    const dots = h("div", "dots", "<i></i><i></i><i></i>");
    const row = h("div", "row pairs");
    const left = h("div", "pair-col left"), right = h("div", "pair-col right");
    let selL: HTMLButtonElement | null = null, selR: HTMLButtonElement | null = null, made = 0;
    const cont = h("button", "btn primary", `${ICON.play}<span>继续</span>`); cont.hidden = true; this.once(cont, () => this.map());
    const leftBtns: HTMLButtonElement[] = [], rightBtns: HTMLButtonElement[] = [];
    const finish = () => { this.run.stars += made; this.hud.update(); this.save(); if (made) this.toast(`${ICON.star} +${made}`); cont.hidden = false; };
    const tryPair = async () => {
      if (!selL || !selR) return;
      const a = selL, b = selR; selL = selR = null;
      const s = compose([a.textContent!, b.textContent!], 1);
      a.classList.remove("sel"); b.classList.remove("sel");
      if (!s) { sfx("nope"); this.toast("拼不出来，换一个试试"); return; }
      sfx("coin"); a.classList.add("done"); b.classList.add("done"); made++;
      dots.children[made - 1]?.classList.add("on");
      this.toast(s);
      if (hasVoice("s:" + s)) await say("s:" + s);
      const restL = leftBtns.filter(x => !x.classList.contains("done")), restR = rightBtns.filter(x => !x.classList.contains("done"));
      const canMore = restL.some(x => restR.some(y => compose([x.textContent!, y.textContent!], 1)));
      if (made >= 3 || !canMore) finish(); // 剩下的拼不出来就结束，不会卡住
    };
    const mk = (text: string, side: "L" | "R") => {
      const b = h("button", "btn pair-btn", text);
      b.addEventListener("click", () => {
        if (b.classList.contains("done")) return;
        if (side === "L") { selL?.classList.remove("sel"); selL = b; } else { selR?.classList.remove("sel"); selR = b; }
        b.classList.add("sel"); sfx("snap");
        if (hasVoice("p:" + text)) void say("p:" + text);
        void tryPair();
      });
      return b;
    };
    ev.initials.forEach(t => { const b = mk(t, "L"); leftBtns.push(b); left.append(b); });
    ev.finals.forEach(t => { const b = mk(t, "R"); rightBtns.push(b); right.append(b); });
    row.append(left, h("span", "plus big", "+"), right);
    card.append(dots, row, cont);
    this.show(card);
    void say("v:pairs");
  }

  // ---------- 火堆 ----------
  private camp() {
    this.world.setMonster(null);
    const card = h("div", "panel center-card", `<h2>火堆</h2>`);
    const row = h("div", "row");
    const full = this.run.hearts >= this.run.maxHearts;
    const rest = h("button", "btn", full ? `${ICON.star}<span>心是满的，得两颗星</span>` : `${ICON.heart}<span>歇一歇，回一颗心</span>`);
    this.once(rest, () => {
      if (full) this.run.stars += 2; else campHeal(this.run);
      sfx("chime"); this.hud.update(); this.save();
      setTimeout(() => this.map(), 800); // 停一下，让孩子看到心回来了
    });
    row.append(rest);
    const errs = this.run.errors.map(id => this.items.find(i => i.id === id)).filter((i): i is Item => !!i && i.kind === "char");
    if (errs.length) {
      const learn = h("button", "btn", `${ICON.star}<span>练错题，得三颗星</span>`);
      this.once(learn, () => {
        const it = pick(this.rng, errs);
        const right = it.pinyin[0];
        const opts = shuffle(this.rng, [right, ...statueEvent([it], this.rng).options.filter(o => o !== right).slice(0, 2)]);
        this.quiz("练一练", "选对的拼音", "i:" + it.id, opts, right, ok => { if (ok) { this.run.stars += 3; this.hud.update(); this.toast(`${ICON.star} +3`); } this.save(); }, `<div class="big-han">${it.hanzi}</div>`);
      });
      row.append(learn);
    }
    card.append(row);
    this.show(card);
    void say("v:camp");
  }

  // ---------- 结算 ----------
  private result(won: boolean) {
    const run = this.run;
    const before = this.profile.level;
    finishRun(this.profile, run);
    store.del(RUN_KEY); store.del(NODE_KEY); store.del(PATH_KEY);
    store.set(PROFILE_KEY, saveProfile(this.profile));
    this.world.setMonster(null);
    this.hud.root.hidden = true;
    const fresh = this.profile.collected.slice(this.collectedAtStart).map(id => this.items.find(i => i.id === id)).filter((i): i is Item => !!i);
    const card = h("div", "panel center-card result", `<h2>${won ? "闯关成功！" : `走到第 ${run.layer} 站啦！`}</h2>
      <p>${won ? "声音都救回来啦" : "星星都带回家了"}${this.profile.level > before ? "，真厉害，升级啦！" : ""}</p>
      <div class="bigstars">${ICON.star}+${run.stars}</div>`);
    if (fresh.length) {
      const list = h("div", "newly", `<p>新救回 ${fresh.length} 个声音，点一点听听</p>`);
      const chips = h("div", "chips");
      for (const it of fresh.slice(0, 8)) { const c = h("button", "chip", it.hanzi); c.addEventListener("click", () => void say("i:" + it.id)); chips.append(c); }
      list.append(chips); card.append(list);
    }
    const row = h("div", "row");
    const again = h("button", "btn primary", `${ICON.play}<span>再来一局</span>`); this.once(again, () => this.startRun());
    const back = h("button", "btn", `${ICON.home}<span>回首页</span>`); back.addEventListener("click", () => this.home());
    row.append(again, back);
    card.append(row);
    this.show(card, h("div", "pill stars home-stars", `${ICON.star}<span>${this.profile.stars}</span>`));
    sfx("chime"); if (won) setTimeout(() => sfx("coin"), 300);
    void say(won ? "v:win" : "v:lose");
  }

  // ---------- 换礼物（用星星） ----------
  private shop() {
    const robe = (id: RobeId) => `<svg viewBox="0 0 64 64" width="130" height="130" fill="none" stroke="#2b2a26" stroke-width="2.4" stroke-linejoin="round"><path d="M24 22h16l10 36H14z" fill="${id === "zhuqing" ? "#3f6b5e" : "#d9d6cc"}"/><rect x="18" y="34" width="28" height="4" fill="#b44a36"/><circle cx="32" cy="16" r="7" fill="#f2e4cc"/><path d="M8 14L32 4l24 10c-14 3-34 3-48 0z" fill="#3a372f"/></svg>`;
    const m = this.profile.meta;
    const wares = [
      { id: "robe-yuebai" as const, name: "白衣裳", desc: "换一身新衣服", pv: robe("yuebai"), cost: SHOP[0].cost, owned: m.robesOwned.includes("yuebai") },
      { id: "extra-heart" as const, name: "多一颗心", desc: "开局多一颗心", pv: `<span class="pv-ic red">${ICON.heart}</span>`, cost: SHOP[1].cost, owned: m.extraHeart },
      { id: "extra-slot" as const, name: "多一格道具", desc: "多带一个道具", pv: `<span class="pv-ic">${BOON_INFO.bag.icon}</span>`, cost: SHOP[2].cost, owned: m.extraSlot },
    ];
    const back = h("button", "btn small back", `${ICON.back}<span>回去</span>`); back.addEventListener("click", () => this.home());
    const stars = h("div", "pill stars home-stars", `${ICON.star}<span>${this.profile.stars}</span>`);
    const row = h("div", "shop");
    for (const w of wares) {
      const isRobe = w.id === "robe-yuebai";
      const card = h("div", "panel ware" + (w.owned && !isRobe ? " owned" : ""), `<div class="pv">${w.pv}</div><b>${w.name}</b><span>${w.desc}</span>`);
      const label = !w.owned ? `<span class="cost">${ICON.star}${w.cost}</span>` : isRobe ? (m.robe === "yuebai" ? "换回绿衣裳" : "穿上白衣裳") : "已拿到";
      const btn = h("button", "btn small", label);
      btn.addEventListener("click", () => {
        if (w.owned) { if (isRobe) { this.wear(m.robe === "yuebai" ? "zhuqing" : "yuebai"); sfx("snap"); this.shop(); } return; }
        if (!buy(this.profile, w.id)) { sfx("nope"); this.toast(`还差 ${w.cost - this.profile.stars} 颗星`); return; }
        sfx("coin"); if (isRobe) this.wear("yuebai"); this.save(); this.shop();
      });
      card.append(btn); row.append(card);
    }
    this.show(back, stars, row);
  }

  private wear(id: RobeId) { this.profile.meta.robe = id; this.world.setRobe(id); this.save(); }

  // ---------- 声音本 ----------
  private book(tab: "char" | "word" | "idiom" = "char") {
    const got = new Set(this.profile.collected);
    const list = this.items.filter(i => i.kind === tab);
    const back = h("button", "btn small back", `${ICON.back}<span>回去</span>`); back.addEventListener("click", () => this.home());
    const panel = h("div", "panel book", `<h2>声音本 · 救回 ${this.items.filter(i => got.has(i.id)).length} / ${this.items.length}</h2>`);
    const tabs = h("div", "tabs");
    for (const [k, name, n] of [["char", "字", 1], ["word", "词语", 2], ["idiom", "成语", 4]] as const) {
      const b = h("button", "btn" + (k === tab ? " on" : ""), `${name}<span class="sq">${"<i></i>".repeat(n)}</span>`); b.addEventListener("click", () => this.book(k)); tabs.append(b);
    }
    const grid = h("div", "grid" + (tab === "idiom" ? " wide" : ""));
    for (const it of list) {
      const has = got.has(it.id);
      const e = h("button", `entry ${it.kind}` + (has ? "" : " locked"), has ? `${it.pic ? picSvg(it.pic, 40) : ""}<span class="p">${it.pinyin.join(" ")}</span><span class="h">${it.hanzi}</span>` : `<span class="h">？</span>`);
      if (has) e.addEventListener("click", () => { e.classList.remove("ping"); void e.offsetWidth; e.classList.add("ping"); void say("i:" + it.id); }); else e.disabled = true;
      grid.append(e);
    }
    panel.append(tabs, grid);
    this.show(back, panel);
  }
}

const BOOK_ICON = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M16 8c-3-2-7-3-12-2v19c5-1 9 0 12 2 3-2 7-3 12-2V6c-5-1-9 0-12 2zM16 8v19"/></svg>`;

async function tryFullscreen() {
  const standalone = matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
  if (standalone || document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen();
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
  } catch { /* 浏览器不让就算了 */ }
}
