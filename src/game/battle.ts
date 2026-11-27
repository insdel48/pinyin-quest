// 一场战斗：放卡拼音、划声调、出招。一只怪物一道题；首领有好几道题。
import { classifyTone } from "../core/gesture";
import { analyze, compose, itemSyllables, makeCards } from "../core/pinyin";
import { battleMonsters, pickQuestion, recordAnswer, type AnswerResult } from "../core/progress";
import { bossQuestions, monsterDistance, onAnswer, startBattle, useHint } from "../core/run";
import type { HintId, Item, MonsterKind, Syllable, Tone } from "../core/types";
import { hasVoice, preload, say, sfx, stopVoice, wait } from "./audio";
import type { Game } from "./app";
import { picSvg } from "./pics";
import { h, HINT_INFO, ICON, mouthSvg, TONE_PATH } from "./ui";
import { foeFor } from "./world3d";

type Kind = "battle" | "elite" | "boss";

/** 一道题：一个字、一个词、一个成语，或者一句长句子里的几个重点字 */
export interface Question {
  id: string; // 记录对错用
  voice: string; // 整题读音
  chars: string[]; // 显示的字（长句子含标点）
  targets: number[]; // 要拼的字在 chars 里的位置
  syls: Syllable[]; // 每个要拼的字的音节
  pic?: string;
  sentence: boolean;
}
export function itemQuestion(item: Item): Question {
  const chars = [...item.hanzi];
  return { id: item.id, voice: "i:" + item.id, chars, targets: chars.map((_, i) => i), syls: itemSyllables(item), pic: item.pic, sentence: false };
}
export function sentenceQuestion(id: string, text: string, targets: number[], pinyin: string[]): Question {
  return { id, voice: "t:" + id, chars: [...text], targets, syls: pinyin.map(analyze), sentence: true };
}
/** 冒险故事里的一个敌人：用哪种怪物模型，出哪几道题 */
export interface StoryFoe { kind: MonsterKind; model: string; questions: Question[] }
type Phase = "intro" | "spell" | "tone" | "busy" | "done";
type Card = { text: string; used: boolean; gone: boolean; el: HTMLDivElement };

const CHECK_DELAY = 700; // 放满格子后等一会儿再判，期间还能点格子把卡拿回来

export class Battle {
  private root = h("div", "battle");
  private strip = h("div", "strip");
  private stripInner = h("div", "inner");
  private weakTag = h("div", "weak-tag");
  private bubble = h("button", "bubble");
  private seals = h("div", "seals");
  private bossHp = h("div", "bosshp");
  private slotsEl = h("div", "slots");
  private hand = h("div", "hand");
  private zone: HTMLDivElement | null = null;
  private stroke: SVGSVGElement | null = null;
  private guide: SVGSVGElement | null = null;
  private extras: Element[] = [];

  private monsters: MonsterKind[] = [];
  private bossQueue: { q: Question; weak: boolean }[] = [];
  private bossHpNow = 0; private bossHpMax = 0;
  private q!: Question; private weak = false;
  private syls: Syllable[] = []; private si = 0;
  private slots: (string | null)[] = [];
  private cards: Card[] = [];
  private distance = 2; private total = 2;
  private hits = 0; private totalHits = 1; // 打碎神兽护甲的进度
  private phase: Phase = "intro";
  private failed = false; private assisted = false; private wrongCalled = false;
  private teaching = false;
  private pendingTrace = false;
  private ghostAt: number | null = null;
  private checkTimer = 0;
  private alive = true;
  private tutorial: boolean;

  constructor(private g: Game, private kind: Kind, private onEnd: () => void, private story: StoryFoe | null = null) {
    // 跳过了新手关的孩子，第一道题还是给最基本的手指提示
    this.tutorial = !g.tips.tutorial && g.profile.runsCompleted === 0 && Object.keys(g.profile.items).length < 2;
    this.strip.append(this.stripInner);
    this.root.append(this.strip, this.seals, this.bossHp, this.weakTag, this.slotsEl, this.hand, this.bubble);
    this.bossHp.innerHTML = "<i></i>";
    this.bossHp.hidden = true;
    this.bubble.addEventListener("click", () => this.replay());
    g.screen.replaceChildren(this.root);
    g.hud.setHint(id => this.useHint(id));
    requestAnimationFrame(() => this.track());
    void this.start();
  }

  destroy() { this.alive = false; clearTimeout(this.checkTimer); this.g.hud.setHint(null); stopVoice(); }

  // ---------- 流程 ----------
  private async start() {
    const { run, profile } = this.g;
    startBattle(run);
    if (this.story) {
      // 冒险故事：一个敌人，几句话打完它
      this.bossQueue = this.story.questions.map(q => ({ q, weak: false }));
      this.bossHpMax = this.bossHpNow = this.bossQueue.length;
      this.monsters = [this.story.kind];
      this.bossHp.hidden = this.bossHpMax < 2; this.updateBossHp();
      this.totalHits = this.story.questions.reduce((n, q) => n + q.syls.length, 0);
    } else if (this.kind === "boss") {
      this.bossQueue = bossQuestions(run, this.g.items, profile, this.g.rng).map(b => ({ q: itemQuestion(b.item), weak: b.weak }));
      this.bossHpMax = this.bossHpNow = this.bossQueue.length;
      this.monsters = ["ding"];
      this.bossHp.hidden = false; this.updateBossHp();
    } else {
      this.monsters = battleMonsters(profile.level, this.kind, this.g.rng);
    }
    await this.nextMonster();
  }

  private async nextMonster() {
    if (!this.alive) return;
    const kind = this.monsters.shift();
    if (!kind) return this.finish();
    this.g.world.setMonster(this.story?.model ?? foeFor(kind, this.g.world.sceneId));
    sfx("step");
    await wait(700);
    if (this.queued) return this.nextBossQuestion();
    const item = pickQuestion({ items: this.g.items, profile: this.g.profile, monster: kind, level: this.g.profile.level, rng: this.g.rng, exclude: new Set(this.g.run.usedItems), recycle: this.g.run.recycle, layer: this.g.run.layer });
    await this.beginItem(itemQuestion(item), false);
  }

  /** 首领和冒险故事的敌人：一只怪物连着出好几道题 */
  private get queued() { return !!this.story || this.kind === "boss"; }

  private async nextBossQuestion() {
    const q = this.bossQueue.shift();
    if (!q || this.bossHpNow <= 0) {
      this.phase = "busy";
      await new Promise<void>(r => this.g.world.defeat(r));
      this.g.world.cheer();
      return this.finish();
    }
    await this.beginItem(q.q, q.weak);
  }

  private targetEls: HTMLElement[] = [];
  private async beginItem(item: Question, weak: boolean) {
    this.q = item; this.weak = weak;
    if (!this.story) { this.hits = 0; this.totalHits = item.syls.length; } // 闯关模式一只怪一道题；首领按每道题重新算
    this.syls = item.syls; this.si = 0;
    this.failed = this.assisted = this.wrongCalled = false;
    this.weakTag.innerHTML = weak ? "<span>大招题！打中掉两格血</span>" : "";
    // 注音条：要拼的字放大、上面留拼音格；长句子里其他字小一号
    this.strip.classList.toggle("sentence", item.sentence);
    this.stripInner.innerHTML = item.chars.map((c, i) => item.targets.includes(i)
      ? `<div class="ch tgt ${i === item.targets[0] ? "cur" : "todo"}"><span class="p hide"></span><span class="h">${c}</span></div>`
      : `<div class="ch plain"><span class="p"></span><span class="h">${c}</span></div>`).join("");
    this.targetEls = [...this.stripInner.querySelectorAll<HTMLElement>(".ch.tgt")];
    this.seals.innerHTML = this.syls.map(() => "<i></i>").join("");
    const pic = picSvg(item.pic, 68);
    this.bubble.className = "bubble" + (pic ? "" : " nopic");
    this.bubble.setAttribute("aria-label", "再听一遍");
    this.bubble.innerHTML = `<svg class="frame" viewBox="0 0 168 104"><path d="M8 8H140V38L162 50 140 62V96H8Z" fill="#f8f2e3" stroke="#2b2a26" stroke-width="2.4" stroke-linejoin="round"/></svg>${pic ? `<span class="pic">${pic}</span>` : ""}<span class="spk">${ICON.speaker}</span>`;
    preload([item.voice, ...this.syls.map(s => "s:" + s.written), ...this.syls.flatMap(s => s.parts.map(p => "p:" + p))]);
    this.beginSyllable();
    await this.talk(() => say(item.voice));
    if (this.multi) { await wait(250); await this.sayCurrent(); }
    if (this.tutorial && this.si === 0 && this.phase === "spell" && this.slots.every(s => s === null)) { await wait(300); await say("v:spell"); }
    else if (this.phase === "spell") { await wait(400); this.g.teachHint(); }
  }

  private beginSyllable() {
    const syl = this.syls[this.si];
    this.teaching = false;
    this.total = this.distance = monsterDistance(this.g.run);
    this.g.world.setApproach(this.distance, this.total);
    this.slots = syl.parts.map(() => null);
    const texts = makeCards(syl, this.g.rng, syl.kind === "three" ? 6 : 5);
    this.hand.replaceChildren();
    this.cards = texts.map(text => {
      const el = h("div", "card", text);
      el.setAttribute("role", "button"); el.setAttribute("aria-label", `卡片 ${text}`);
      const c: Card = { text, used: false, gone: false, el };
      this.bindCard(c);
      this.hand.append(el);
      return c;
    });
    this.targetEls.forEach((el, i) => {
      el.classList.toggle("cur", i === this.si); el.classList.toggle("todo", i > this.si);
      if (i === this.si && this.si > 0) { el.classList.remove("bounce"); void (el as HTMLElement).offsetWidth; el.classList.add("bounce"); }
    });
    this.clearExtras();
    this.renderSlots();
    this.phase = "spell";
    if (this.tutorial && this.si === 0) void this.demoTap();
  }

  /** 读当前这个音（词语里逐字读；没有单字读音就读整个词） */
  private sayCurrent(rate = 1) {
    const syl = this.syls[this.si];
    return this.talk(() => hasVoice("s:" + syl.written) ? say("s:" + syl.written, rate) : say(this.q.voice, rate));
  }

  private replay() {
    if (this.phase === "intro" || this.phase === "done" || !this.q) return;
    void this.talk(async () => { await say(this.q.voice); if (this.multi) { await wait(200); await this.sayCurrent(); } });
  }

  /** 不止一个字要拼（词语、成语、长句子）：整题读完再单读当前这个字 */
  private get multi() { return this.q.chars.length > 1;
  }

  private async talk(fn: () => Promise<void>) {
    this.bubble.classList.add("talk");
    try { await fn(); } finally { this.bubble.classList.remove("talk"); }
  }

  // ---------- 拼音格和卡片 ----------
  /** state：每格的样子，ok / bad / hl / toned / ghost:字母 */
  private renderSlots(state: Record<number, string> = this.ghostState()) {
    const syl = this.syls[this.si];
    this.slotsEl.replaceChildren();
    syl.parts.forEach((part, i) => {
      if (i) this.slotsEl.append(h("span", "plus", "+"));
      const w = 72 + 30 * Math.max(part.length, (this.slots[i] ?? "").length, 1);
      const st = state[i] ?? "";
      const toned = st === "toned";
      const val = this.slots[i];
      const text = toned ? syl.lastToned : val;
      const ghost = !text && st.startsWith("ghost:") ? st.slice(6) : "";
      const el = h("div", "slot" + (st && !st.startsWith("ghost:") && !toned ? " " + st : "") + (toned ? " ok" : ""));
      el.dataset.i = String(i);
      const lines = [26, 56, 86, 116].map(y => `<line class="ln" x1="10" x2="${w - 10}" y1="${y}" y2="${y}"/>`).join("");
      el.innerHTML = `<svg width="${w}" height="132" viewBox="0 0 ${w} 132"><rect class="bgr" x="1" y="1" width="${w - 2}" height="130" rx="6"/>${lines}${text ? `<text class="${toned ? "toned placed" : "placed"}" x="${w / 2}" y="86">${text}</text>` : ""}${ghost ? `<text class="ghost" x="${w / 2}" y="86">${ghost}</text>` : ""}</svg>`;
      el.addEventListener("click", () => this.tapSlot(i));
      this.slotsEl.append(el);
    });
  }

  private bindCard(c: Card) {
    let start: { x: number; y: number } | null = null, ghost: HTMLDivElement | null = null, moved = false;
    const s = () => this.g.scale;
    c.el.addEventListener("pointerdown", e => {
      if (this.phase !== "spell" || c.used || c.gone) return;
      start = { x: e.clientX, y: e.clientY }; moved = false;
      try { c.el.setPointerCapture(e.pointerId); } catch { /* 有的浏览器不支持 */ }
    });
    c.el.addEventListener("pointermove", e => {
      if (!start) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) {
        moved = true;
        ghost = c.el.cloneNode(true) as HTMLDivElement; ghost.classList.add("drag");
        ghost.style.width = `${100 * s()}px`; ghost.style.height = `${116 * s()}px`; ghost.style.fontSize = `${44 * s()}px`;
        document.body.append(ghost);
      }
      // 卡片显示在手指上方，不被手指挡住
      if (ghost) { ghost.style.left = `${e.clientX - 50 * s()}px`; ghost.style.top = `${e.clientY - 150 * s()}px`; }
    });
    const up = (e: PointerEvent) => {
      if (!start) return;
      start = null;
      ghost?.remove(); ghost = null;
      if (this.phase !== "spell" || c.used || c.gone) return;
      if (!moved) return this.place(c, null);
      const target = this.nearestSlot(e);
      if (target !== null) this.place(c, target); else sfx("back");
    };
    c.el.addEventListener("pointerup", up);
    c.el.addEventListener("pointercancel", () => { start = null; ghost?.remove(); ghost = null; });
  }

  /** 拖着的卡片（在手指上方）离哪个格子最近；离得太远返回 null */
  private nearestSlot(e: PointerEvent): number | null {
    const p = this.g.toStage(e); p.y -= 92; // 卡片中心在手指上方
    let best: number | null = null, bestD = 110;
    this.slotsEl.querySelectorAll<HTMLElement>(".slot").forEach(el => {
      const r = el.getBoundingClientRect();
      const c = this.g.toStage({ clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 });
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bestD) { bestD = d; best = Number(el.dataset.i); }
    });
    return best;
  }

  private place(c: Card, at: number | null) {
    const i = at ?? this.slots.findIndex(s => s === null);
    if (i < 0) return;
    const prev = this.slots[i];
    if (prev !== null) this.returnCard(prev);
    this.slots[i] = c.text; c.used = true; c.el.classList.add("used");
    if (this.ghostAt === i) this.ghostAt = null;
    sfx("snap");
    if (hasVoice("p:" + c.text)) void say("p:" + c.text);
    this.renderSlots();
    this.hideDemo();
    this.scheduleCheck();
  }

  private scheduleCheck() {
    clearTimeout(this.checkTimer);
    if (this.slots.every(s => s !== null)) this.checkTimer = window.setTimeout(() => { if (this.phase === "spell") { this.phase = "busy"; void this.checkParts(); } }, CHECK_DELAY);
  }

  private tapSlot(i: number) {
    if (this.phase !== "spell" || this.slots[i] === null) return;
    clearTimeout(this.checkTimer);
    this.returnCard(this.slots[i]!); this.slots[i] = null; sfx("back");
    this.renderSlots();
  }

  private returnCard(text: string) {
    const c = this.cards.find(k => k.used && !k.gone && k.text === text);
    if (c) { c.used = false; c.el.classList.remove("used"); }
  }

  private ghostState(): Record<number, string> {
    const syl = this.syls[this.si];
    return this.ghostAt !== null && this.slots[this.ghostAt] === null ? { [this.ghostAt]: "ghost:" + syl.parts[this.ghostAt] } : {};
  }

  private allState(v: string, lastToned = false): Record<number, string> {
    const st: Record<number, string> = {};
    this.syls[this.si].parts.forEach((_, i) => { st[i] = v; });
    if (lastToned) st[this.syls[this.si].parts.length - 1] = "toned";
    return st;
  }

  // ---------- 判断 ----------
  private async checkParts() {
    const syl = this.syls[this.si];
    const chosen = this.slots as string[];
    if (chosen.every((p, i) => p === syl.parts[i])) {
      this.renderSlots(this.allState("ok"));
      sfx("chime");
      await wait(300);
      return this.enterTone();
    }
    // 拼错了：对的格子亮一下，错的抖一下；读出孩子拼的这个音，墨打偏，再读一遍正确的
    const spelled = compose(chosen, syl.tone);
    const st: Record<number, string> = {};
    chosen.forEach((p, i) => { st[i] = p === syl.parts[i] ? "ok" : "bad"; });
    this.renderSlots(st);
    sfx("nope");
    this.g.world.attack(false, () => sfx("miss"));
    if (spelled && spelled !== syl.written) {
      this.echo(spelled, true);
      if (hasVoice("s:" + spelled)) await say("s:" + spelled); else await wait(500);
    } else await wait(500);
    await wait(300);
    chosen.forEach((p, i) => { if (p !== syl.parts[i]) { this.returnCard(p); this.slots[i] = null; } });
    this.renderSlots();
    const bitten = await this.wrongStep();
    if (!bitten && this.alive) { this.phase = "spell"; await wait(200); void this.sayCurrent(); }
  }

  private async enterTone() {
    if (!this.alive) return;
    this.phase = "tone";
    const syl = this.syls[this.si];
    const neutral = syl.tone === 0;
    const zone = h("div", "tonezone");
    const tip = neutral ? "这是轻声，点一下就行" : "听一听，划出声调：ˉ ˊ ˇ ˋ";
    zone.innerHTML = `<div class="tip">${tip}</div>${this.tutorial || neutral ? `<span class="finger">${ICON.finger}</span>` : ""}`;
    const stroke = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    stroke.setAttribute("class", "stroke"); stroke.setAttribute("viewBox", "0 0 1280 800");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); stroke.append(path);
    this.root.insertBefore(zone, this.bubble); this.root.insertBefore(stroke, this.bubble); // 喇叭气泡保持在最上层
    this.zone = zone; this.stroke = stroke;
    if (this.pendingTrace || this.teaching) this.showGuide();
    let pts: { x: number; y: number; t: number }[] = [];
    zone.addEventListener("pointerdown", e => {
      if (this.phase !== "tone") return;
      try { zone.setPointerCapture(e.pointerId); } catch { /* 同上 */ }
      pts = [{ ...this.g.toStage(e), t: e.timeStamp }];
      path.setAttribute("d", "");
    });
    zone.addEventListener("pointermove", e => {
      if (!pts.length || this.phase !== "tone") return;
      pts.push({ ...this.g.toStage(e), t: e.timeStamp });
      path.setAttribute("d", "M" + pts.map(p => `${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join(" L"));
    });
    zone.addEventListener("pointerup", e => {
      if (!pts.length || this.phase !== "tone") return;
      pts.push({ ...this.g.toStage(e), t: e.timeStamp });
      const tone = classifyTone(pts);
      pts = [];
      void this.onTone(tone, path);
    });
    // 进入划声调时再读一遍，孩子听着声调来划（教的时候 teach() 已经读过了）
    if (this.teaching) return;
    await wait(150);
    if (this.tutorial || neutral) await say(neutral ? "v:neutral" : "v:tone");
    if (this.phase === "tone") await this.sayCurrent();
  }

  private async onTone(tone: Tone | null, path: SVGPathElement) {
    const syl = this.syls[this.si];
    if (tone === null) {
      sfx("nope"); this.zone?.classList.remove("again"); void this.zone?.offsetWidth; this.zone?.classList.add("again");
      const tip = this.zone?.querySelector(".tip"); if (tip) tip.textContent = "再划大一点";
      void say("v:again");
      setTimeout(() => path.setAttribute("d", ""), 400);
      return;
    }
    if (tone === syl.tone) {
      this.phase = "busy";
      sfx("swish");
      path.setAttribute("d", "");
      this.closeTone();
      this.drawTrail(tone);
      this.renderSlots(this.allState("ok", true));
      await wait(450);
      return this.hit();
    }
    // 声调错了：读出这个调，再读一遍正确的
    this.phase = "busy";
    const spelled = compose(syl.parts, tone);
    this.g.world.attack(false, () => sfx("miss"));
    if (spelled) {
      this.echo(spelled, true);
      if (hasVoice("s:" + spelled)) await say("s:" + spelled); else await wait(500);
    }
    setTimeout(() => path.setAttribute("d", ""), 200);
    if (this.teaching) { await wait(200); await this.sayCurrent(); this.phase = "tone"; return; } // 教的时候划错不再扣
    const bitten = await this.wrongStep();
    if (!bitten && this.alive) { this.phase = "tone"; await wait(200); void this.sayCurrent(); }
  }

  private closeTone() { this.zone?.remove(); this.stroke?.remove(); this.guide?.remove(); this.zone = this.stroke = this.guide = null; this.pendingTrace = false; }

  private drawTrail(tone: Tone) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    t.setAttribute("class", "trail"); t.setAttribute("viewBox", "0 0 340 64");
    t.innerHTML = `<path d="${TONE_PATH[tone]}"/>`;
    this.root.append(t); this.extras.push(t);
    setTimeout(() => t.remove(), 1400);
  }

  private showGuide() {
    this.guide?.remove();
    const syl = this.syls[this.si];
    const t = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    t.setAttribute("class", "trail guide"); t.setAttribute("viewBox", "0 0 340 64");
    t.innerHTML = syl.tone === 0 ? `<circle cx="170" cy="32" r="14"/>` : `<path d="${TONE_PATH[syl.tone]}"/>`;
    this.root.insertBefore(t, this.zone ?? this.bubble); this.guide = t;
  }

  /** 怪物往前走一步；走到面前就咬一口（返回 true），然后把这个音教一遍 */
  private async wrongStep(): Promise<boolean> {
    this.distance--;
    this.g.world.setApproach(this.distance, this.total);
    sfx("step");
    if (this.distance > 0) { await wait(300); return false; }
    this.phase = "busy";
    this.closeTone();
    let blocked = false;
    await new Promise<void>(res => this.g.world.lunge(() => {
      sfx("bite");
      let hurt = false;
      if (!this.wrongCalled) {
        this.wrongCalled = true; this.failed = true;
        const r = onAnswer(this.g.run, this.q.id, "wrong", this.g.rng);
        recordAnswer(this.g.profile, this.q.id, "wrong", this.g.run.runNo);
        this.g.hud.update(r.heartLost);
        this.g.save();
        hurt = r.heartLost; blocked = !r.heartLost && this.g.run.boons.includes("shield");
      }
      setTimeout(res, 0);
      return hurt;
    }));
    if (blocked) { sfx("chime"); this.g.toast("竹盾挡住啦！"); void say("v:shield"); }
    if (this.g.run.over === "lost") { this.phase = "done"; await wait(900); this.alive = false; this.g.runLost(); return true; }
    await wait(700);
    await this.teach();
    return true;
  }

  /** 咬过之后，把卡片一张张放好给孩子看，最后照着虚线自己划声调 */
  private async teach() {
    const syl = this.syls[this.si];
    this.phase = "busy"; this.teaching = true;
    this.distance = this.total; this.g.world.setApproach(this.distance, this.total);
    this.g.toast("看我怎么拼");
    await say("v:teach");
    this.slots = syl.parts.map(() => null);
    this.cards.forEach(c => { c.used = false; c.el.classList.remove("used"); });
    this.renderSlots({});
    for (let i = 0; i < syl.parts.length; i++) {
      this.slots[i] = syl.parts[i];
      const c = this.cards.find(k => !k.used && k.text === syl.parts[i]); if (c) { c.used = true; c.el.classList.add("used"); }
      this.renderSlots({ [i]: "hl" });
      if (hasVoice("p:" + syl.parts[i])) await say("p:" + syl.parts[i]); else await wait(500);
      await wait(250);
    }
    this.renderSlots(this.allState("ok"));
    await this.sayCurrent();
    await this.enterTone();
  }

  private async hit() {
    if (!this.alive) return;
    const syl = this.syls[this.si];
    // 一个音打一下；整题最后一个音出大招（冲上去连打再挑飞）
    const last = this.si === this.syls.length - 1;
    await new Promise<void>(res => this.g.world.attack(true, () => {
      sfx("seal");
      this.seals.children[this.si]?.classList.add("broken");
      const p = this.targetEls[this.si]?.querySelector(".p");
      if (p) { p.classList.remove("hide"); p.textContent = syl.written; p.classList.add("reveal"); }
      res();
      this.hits++; this.g.world.setDamage(this.hits / this.totalHits);
    }, last && (!this.queued || this.bossHpNow <= (this.weak && !this.failed && !this.assisted ? 2 : 1)) ? "finisher" : last ? "heavy" : "light", syl.written, this.q.chars[this.q.targets[this.si]] ?? ""));
    void this.sayCurrent();
    await wait(1000);
    this.si++;
    if (this.si < this.syls.length) { this.beginSyllable(); if (this.multi) await this.sayCurrent(); return; }
    await this.finishItem();
  }

  private async finishItem() {
    const { run, profile } = this.g;
    const result: AnswerResult = this.failed ? "wrong" : this.assisted ? "assisted" : "correct";
    if (!this.wrongCalled) {
      const r = onAnswer(run, this.q.id, result, this.g.rng);
      recordAnswer(profile, this.q.id, result, run.runNo);
      if (r.stars > 0) this.g.toast(`${ICON.star} +${r.stars}`);
      if (r.hintGained) { const got = r.hintGained; setTimeout(() => { this.g.toast(`连对啦！送你 ${HINT_INFO[got].icon} ${HINT_INFO[got].name}`); void say("v:streak"); }, 700); }
      this.g.hud.update(false, r.hintGained);
    }
    this.g.save();
    if (this.multi) { await wait(300); await say(this.q.voice); }
    await wait(400);
    if (this.queued) {
      this.bossHpNow -= this.weak && result === "correct" ? 2 : 1;
      this.updateBossHp();
      return this.nextBossQuestion();
    }
    this.phase = "busy";
    await new Promise<void>(r => this.g.world.defeat(r));
    this.g.world.clearDrops();
    this.g.world.cheer();
    await this.nextMonster();
  }

  private updateBossHp() { (this.bossHp.firstElementChild as HTMLElement).style.width = `${Math.max(0, this.bossHpNow / this.bossHpMax) * 100}%`; }

  private finish() {
    if (!this.alive) return;
    this.phase = "done"; this.alive = false;
    this.g.hud.setHint(null);
    this.onEnd();
  }

  // ---------- 提示道具 ----------
  useHint(id: HintId): boolean {
    const syl = this.syls[this.si];
    if (!syl || this.teaching || (this.phase !== "spell" && this.phase !== "tone")) return false;
    if ((id === "sweep" || id === "ghost") && this.phase !== "spell") return false;
    if (id === "trace" && (this.pendingTrace || this.guide)) return false;
    if (id === "sweep" && !this.cards.some(c => !c.used && !c.gone && !syl.parts.includes(c.text))) return false;
    if (!useHint(this.g.run, id)) return false;
    this.assisted = true;
    sfx("chime");
    if (id === "slow") void this.slowRead();
    if (id === "sweep") {
      this.cards.filter(c => !c.used && !c.gone && !syl.parts.includes(c.text)).slice(0, 2).forEach(c => { c.gone = true; c.el.classList.add("gone"); });
    }
    if (id === "ghost") {
      clearTimeout(this.checkTimer);
      const i = this.slots.findIndex((s, k) => s === null || s !== syl.parts[k]);
      if (i >= 0) { if (this.slots[i] !== null) { this.returnCard(this.slots[i]!); this.slots[i] = null; } this.ghostAt = i; this.renderSlots(); }
    }
    if (id === "trace") {
      if (this.phase === "tone") this.showGuide();
      else { this.pendingTrace = true; this.g.toast(`${HINT_INFO.trace.icon} 划声调时会画出线`); }
    }
    return true;
  }

  private async slowRead() {
    const syl = this.syls[this.si];
    const last = syl.parts[syl.parts.length - 1];
    const mouth = h("div", "mouth", mouthSvg(syl.kind === "whole" ? syl.base.replace(/^(zh|ch|sh|[rzcsyw])/, "") : last));
    mouth.style.left = "598px"; mouth.style.top = "400px"; // 拼音格上方
    this.root.append(mouth); this.extras.push(mouth);
    const inSpell = () => this.phase === "spell";
    for (let i = 0; i < syl.parts.length; i++) {
      if (!this.alive) return;
      if (inSpell()) this.renderSlots({ ...this.ghostState(), [i]: "hl" });
      if (hasVoice("p:" + syl.parts[i])) await say("p:" + syl.parts[i], 0.9); else await wait(400);
      await wait(250);
    }
    if (inSpell()) this.renderSlots();
    await this.sayCurrent(0.85);
    setTimeout(() => mouth.remove(), 1500);
  }

  // ---------- 小效果 ----------
  private echo(text: string, grey: boolean) {
    const [x, y] = this.g.world.foeTopAnchor();
    const e = h("div", "echo" + (grey ? " grey" : ""), text);
    e.style.left = `${Math.min(1160, Math.max(120, x))}px`; e.style.top = `${Math.max(150, y - 70)}px`; // 用 left/top，transform 留给飘起动画
    this.root.append(e);
    setTimeout(() => e.remove(), 1700);
  }

  private clearExtras() { this.extras.forEach(e => e.remove()); this.extras = []; this.ghostAt = null; }

  private demoEl: HTMLElement | null = null;
  private async demoTap() {
    await wait(1800);
    if (!this.alive || this.phase !== "spell" || this.slots.some(s => s !== null)) return;
    const f = h("div", "demo-finger", ICON.finger);
    this.root.append(f); this.demoEl = f;
    for (let n = 0; n < 6 && this.demoEl; n++) {
      f.style.transition = "none"; f.style.transform = "translate(620px, 700px)";
      await wait(60);
      f.style.transition = "transform 1s ease-in-out"; f.style.transform = "translate(560px, 560px)";
      await wait(1600);
    }
    this.hideDemo();
  }
  private hideDemo() { this.demoEl?.remove(); this.demoEl = null; }

  /** 气泡、封印、血条跟着怪物走 */
  private track() {
    if (!this.alive) return;
    const w = this.g.world;
    const [bx] = w.foeAnchor(0.7);
    const bubX = Math.min(1100, Math.max(560, bx - 280)); // 气泡跟着怪物在它左边，高度固定在拼音格上方
    this.bubble.style.transform = `translate(${bubX}px, 196px)`;
    const [sx, sy] = w.foeTopAnchor();
    const top = Math.max(150, sy + 4);
    this.seals.style.transform = `translate(${sx - this.seals.offsetWidth / 2}px, ${top}px)`;
    this.bossHp.style.transform = `translate(${sx - 110}px, ${top - 22}px)`;
    this.weakTag.style.transform = `translate(${sx - 120}px, ${top + 34}px)`;
    requestAnimationFrame(() => this.track());
  }
}
