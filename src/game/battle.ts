// 一场战斗：放卡拼音、划声调、出招。一只怪物一道题；首领有好几道题。
import { classifyTone } from "../core/gesture";
import { compose, itemSyllables, makeCards } from "../core/pinyin";
import { battleMonsters, pickQuestion, recordAnswer, type AnswerResult } from "../core/progress";
import { bossQuestions, monsterDistance, onAnswer, startBattle, useHint } from "../core/run";
import type { HintId, Item, MonsterKind, Syllable, Tone } from "../core/types";
import { hasVoice, preload, say, sfx, stopVoice, wait } from "./audio";
import type { Game } from "./app";
import { picSvg } from "./pics";
import { h, ICON, mouthSvg, TONE_PATH } from "./ui";

type Kind = "battle" | "elite" | "boss";
type Phase = "intro" | "spell" | "tone" | "busy" | "done";

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
  private extras: HTMLElement[] = [];

  private monsters: MonsterKind[] = [];
  private bossQueue: { item: Item; weak: boolean }[] = [];
  private bossHpNow = 0; private bossHpMax = 0;
  private item!: Item; private weak = false;
  private syls: Syllable[] = []; private si = 0;
  private slots: (string | null)[] = [];
  private cards: { text: string; used: boolean; gone: boolean; el: HTMLDivElement }[] = [];
  private distance = 2; private total = 2;
  private phase: Phase = "intro";
  private failed = false; private assisted = false; private wrongCalled = false;
  private pendingTrace = false;
  private alive = true;
  private tutorial: boolean;

  constructor(private g: Game, private kind: Kind, private onEnd: () => void) {
    this.tutorial = g.profile.runsCompleted === 0 && Object.keys(g.profile.items).length < 2;
    this.strip.append(this.stripInner);
    this.root.append(this.strip, this.weakTag, this.seals, this.bossHp, this.bubble, this.slotsEl, this.hand);
    this.bossHp.innerHTML = "<i></i>";
    this.bossHp.hidden = true;
    this.bubble.addEventListener("click", () => this.replay());
    g.screen.replaceChildren(this.root);
    g.hud.onHint = id => this.useHint(id);
    requestAnimationFrame(() => this.track());
    void this.start();
  }

  destroy() { this.alive = false; this.g.hud.onHint = null; stopVoice(); }

  // ---------- 流程 ----------
  private async start() {
    const { run, profile } = this.g;
    startBattle(run);
    if (this.kind === "boss") {
      this.bossQueue = bossQuestions(run, this.g.items, profile, this.g.rng);
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
    this.g.world.setMonster(kind);
    sfx("step");
    await wait(700);
    if (this.kind === "boss") return this.nextBossQuestion();
    const item = pickQuestion({ items: this.g.items, profile: this.g.profile, monster: kind, level: this.g.profile.level, rng: this.g.rng, exclude: new Set(this.g.run.usedItems), recycle: this.g.run.recycle, layer: this.g.run.layer });
    await this.beginItem(item, false);
  }

  private async nextBossQuestion() {
    const q = this.bossQueue.shift();
    if (!q || this.bossHpNow <= 0) {
      this.phase = "busy";
      await new Promise<void>(r => this.g.world.defeat(r));
      return this.finish();
    }
    await this.beginItem(q.item, q.weak);
  }

  private async beginItem(item: Item, weak: boolean) {
    this.item = item; this.weak = weak;
    this.syls = itemSyllables(item); this.si = 0;
    this.failed = this.assisted = this.wrongCalled = false;
    this.weakTag.innerHTML = weak ? "<span>弱点 · 打中伤害翻倍</span>" : "";
    this.stripInner.innerHTML = [...item.hanzi].map((c, i) => `<div class="ch ${i === 0 ? "cur" : "todo"}"><span class="p hide"></span><span class="h">${c}</span></div>`).join("");
    this.seals.innerHTML = this.syls.map(() => "<i></i>").join("");
    const pic = picSvg(item.pic, 68);
    this.bubble.className = "bubble" + (pic ? "" : " nopic");
    this.bubble.setAttribute("aria-label", "再听一遍");
    this.bubble.innerHTML = `<svg class="frame" viewBox="0 0 168 104"><path d="M8 8H140V38L162 50 140 62V96H8Z" fill="#f8f2e3" stroke="#2b2a26" stroke-width="2.4" stroke-linejoin="round"/></svg>${pic ? `<span class="pic">${pic}</span>` : ""}<span class="spk">${ICON.speaker}</span>`;
    preload(["i:" + item.id, ...this.syls.map(s => "s:" + s.written), ...this.syls.flatMap(s => s.parts.map(p => "p:" + p))]);
    this.beginSyllable();
    await this.talk(() => say("i:" + item.id));
    if (item.kind !== "char") { await wait(250); await this.sayCurrent(); }
  }

  private beginSyllable() {
    const syl = this.syls[this.si];
    this.total = this.distance = monsterDistance(this.g.run);
    this.g.world.setApproach(this.distance, this.total);
    this.slots = syl.parts.map(() => null);
    const texts = makeCards(syl, this.g.rng, syl.kind === "three" ? 6 : 5);
    this.hand.replaceChildren();
    this.cards = texts.map(text => {
      const el = h("div", "card", text);
      el.setAttribute("role", "button"); el.setAttribute("aria-label", `卡片 ${text}`);
      const c = { text, used: false, gone: false, el };
      this.bindCard(c);
      this.hand.append(el);
      return c;
    });
    [...this.stripInner.children].forEach((el, i) => { el.classList.toggle("cur", i === this.si); el.classList.toggle("todo", i > this.si); });
    this.renderSlots();
    this.clearExtras();
    this.phase = "spell";
    if (this.tutorial && this.si === 0) void this.demoTap();
  }

  /** 读当前这个音（词语里逐字读；没有单字读音就读整个词） */
  private sayCurrent() {
    const syl = this.syls[this.si];
    return this.talk(() => hasVoice("s:" + syl.written) ? say("s:" + syl.written) : say("i:" + this.item.id));
  }

  private replay() {
    if (this.phase === "intro" || this.phase === "done") return;
    void this.talk(async () => { await say("i:" + this.item.id); if (this.item.kind !== "char") { await wait(200); await this.sayCurrent(); } });
  }

  private async talk(fn: () => Promise<void>) {
    this.bubble.classList.add("talk");
    try { await fn(); } finally { this.bubble.classList.remove("talk"); }
  }

  // ---------- 拼音格和卡片 ----------
  private renderSlots(state: Record<number, string> = {}) {
    const syl = this.syls[this.si];
    this.slotsEl.replaceChildren();
    syl.parts.forEach((part, i) => {
      if (i) this.slotsEl.append(h("span", "plus", "+"));
      const w = 72 + 30 * Math.max(part.length, (this.slots[i] ?? "").length, 1);
      const last = i === syl.parts.length - 1;
      const val = this.slots[i];
      const toned = last && state[i] === "toned";
      const text = toned ? syl.lastToned : val;
      const cls = state[i] && !state[i].startsWith("ghost:") && state[i] !== "toned" ? " " + state[i] : "";
      const el = h("div", "slot" + cls + (toned ? " ok" : ""));
      el.dataset.i = String(i);
      const lines = [26, 56, 86, 116].map(y => `<line class="ln" x1="10" x2="${w - 10}" y1="${y}" y2="${y}"/>`).join("");
      el.innerHTML = `<svg width="${w}" height="132" viewBox="0 0 ${w} 132"><rect class="bgr" x="1" y="1" width="${w - 2}" height="130" rx="6"/>${lines}${text ? `<text class="${toned ? "toned placed" : "placed"}" x="${w / 2}" y="86">${text}</text>` : ""}${!text && state[i]?.startsWith("ghost:") ? `<text class="ghost" x="${w / 2}" y="86">${state[i].slice(6)}</text>` : ""}</svg>`;
      el.addEventListener("click", () => this.tapSlot(i));
      this.slotsEl.append(el);
    });
  }
  private ghostAt: number | null = null;

  private bindCard(c: { text: string; used: boolean; gone: boolean; el: HTMLDivElement }) {
    let start: { x: number; y: number } | null = null, ghost: HTMLDivElement | null = null, moved = false;
    c.el.addEventListener("pointerdown", e => {
      if (this.phase !== "spell" || c.used) return;
      start = { x: e.clientX, y: e.clientY }; moved = false;
      try { c.el.setPointerCapture(e.pointerId); } catch { /* 有的浏览器不支持 */ }
    });
    c.el.addEventListener("pointermove", e => {
      if (!start) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) {
        moved = true;
        ghost = c.el.cloneNode(true) as HTMLDivElement; ghost.classList.add("drag");
        const s = this.g.scale; ghost.style.width = `${100 * s}px`; ghost.style.height = `${116 * s}px`; ghost.style.fontSize = `${44 * s}px`;
        document.body.append(ghost);
      }
      if (ghost) { const s = this.g.scale; ghost.style.left = `${e.clientX - 50 * s}px`; ghost.style.top = `${e.clientY - 58 * s}px`; }
    });
    const up = (e: PointerEvent) => {
      if (!start) return;
      start = null;
      ghost?.remove(); ghost = null;
      if (this.phase !== "spell" || c.used) return;
      if (!moved) return this.place(c, null);
      const hit = document.elementsFromPoint(e.clientX, e.clientY).find(el => (el as HTMLElement).dataset?.i !== undefined && el.classList.contains("slot")) as HTMLElement | undefined;
      if (hit) this.place(c, Number(hit.dataset.i));
    };
    c.el.addEventListener("pointerup", up);
    c.el.addEventListener("pointercancel", () => { start = null; ghost?.remove(); ghost = null; });
  }

  private place(c: { text: string; used: boolean; el: HTMLDivElement }, at: number | null) {
    let i = at ?? this.slots.findIndex(s => s === null);
    if (i < 0) return;
    const prev = this.slots[i];
    if (prev !== null) this.returnCard(prev);
    this.slots[i] = c.text; c.used = true; c.el.classList.add("used");
    if (this.ghostAt === i) this.ghostAt = null;
    sfx("snap");
    if (hasVoice("p:" + c.text)) void say("p:" + c.text);
    this.renderSlots(this.ghostState());
    this.hideDemo();
    if (this.slots.every(s => s !== null)) { this.phase = "busy"; setTimeout(() => void this.checkParts(), 350); }
  }

  private tapSlot(i: number) {
    if (this.phase !== "spell" || this.slots[i] === null) return;
    this.returnCard(this.slots[i]!); this.slots[i] = null; sfx("back");
    this.renderSlots(this.ghostState());
  }

  private returnCard(text: string) {
    const c = this.cards.find(k => k.used && !k.gone && k.text === text);
    if (c) { c.used = false; c.el.classList.remove("used"); }
  }

  private ghostState(): Record<number, string> {
    const syl = this.syls[this.si];
    return this.ghostAt !== null && this.slots[this.ghostAt] === null ? { [this.ghostAt]: "ghost:" + syl.parts[this.ghostAt] } : {};
  }

  // ---------- 判断 ----------
  private async checkParts() {
    const syl = this.syls[this.si];
    const chosen = this.slots as string[];
    if (chosen.every((p, i) => p === syl.parts[i])) {
      const ok: Record<number, string> = {}; chosen.forEach((_, i) => { ok[i] = "ok"; });
      this.renderSlots(ok);
      sfx("chime");
      await wait(300);
      return this.enterTone();
    }
    // 拼错了：读出孩子拼的这个音，墨打偏
    const spelled = compose(chosen, syl.tone);
    const bad: Record<number, string> = {};
    chosen.forEach((p, i) => { if (p !== syl.parts[i]) bad[i] = "bad"; });
    this.renderSlots(bad);
    sfx("nope");
    this.g.world.attack(false, () => sfx("miss"));
    if (spelled && spelled !== syl.written) {
      this.echo(spelled, true);
      if (hasVoice("s:" + spelled)) await say("s:" + spelled); else await wait(500);
    } else await wait(500);
    await wait(350);
    chosen.forEach((p, i) => { if (p !== syl.parts[i]) { this.returnCard(p); this.slots[i] = null; } });
    this.renderSlots(this.ghostState());
    const bitten = await this.wrongStep();
    if (!bitten && this.alive) this.phase = "spell";
  }

  private async enterTone() {
    if (!this.alive) return;
    this.phase = "tone";
    const zone = h("div", "tonezone");
    zone.innerHTML = `<div class="tip">听一听，用手指划出声调</div>${this.tutorial ? `<span class="finger">${ICON.finger}</span>` : ""}`;
    const stroke = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    stroke.setAttribute("class", "stroke"); stroke.setAttribute("viewBox", "0 0 1280 800");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); stroke.append(path);
    this.root.append(zone, stroke);
    this.zone = zone; this.stroke = stroke;
    if (this.pendingTrace) this.showGuide();
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
  }

  private async onTone(tone: Tone | null, path: SVGPathElement) {
    const syl = this.syls[this.si];
    if (tone === null) {
      sfx("nope"); this.zone?.classList.remove("again"); void this.zone?.offsetWidth; this.zone?.classList.add("again");
      setTimeout(() => path.setAttribute("d", ""), 400);
      return;
    }
    if (tone === syl.tone) {
      this.phase = "busy";
      sfx("swish");
      path.setAttribute("d", "");
      this.closeTone();
      this.drawTrail(tone);
      const ok: Record<number, string> = {}; syl.parts.forEach((_, i) => { ok[i] = "ok"; }); ok[syl.parts.length - 1] = "toned";
      this.renderSlots(ok);
      await wait(450);
      return this.hit();
    }
    // 声调错了：读出这个调
    this.phase = "busy";
    const spelled = compose(syl.parts, tone);
    this.g.world.attack(false, () => sfx("miss"));
    if (spelled) {
      this.echo(spelled, true);
      if (hasVoice("s:" + spelled)) await say("s:" + spelled); else await wait(500);
    }
    setTimeout(() => path.setAttribute("d", ""), 200);
    const bitten = await this.wrongStep();
    if (!bitten && this.alive) this.phase = "tone";
  }

  private closeTone() { this.zone?.remove(); this.stroke?.remove(); this.guide?.remove(); this.zone = this.stroke = this.guide = null; this.pendingTrace = false; }

  private drawTrail(tone: Tone) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    t.setAttribute("class", "trail"); t.setAttribute("viewBox", "0 0 340 64");
    t.innerHTML = `<path d="${TONE_PATH[tone]}"/>`;
    this.root.append(t); this.extras.push(t as unknown as HTMLElement);
    setTimeout(() => t.remove(), 1400);
  }

  private showGuide() {
    const syl = this.syls[this.si];
    const t = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    t.setAttribute("class", "trail guide"); t.setAttribute("viewBox", "0 0 340 64");
    t.innerHTML = `<path d="${TONE_PATH[syl.tone]}"/>`;
    this.root.append(t); this.guide = t;
  }

  /** 怪物往前走一步；走到面前就咬一口（返回 true），然后把这个音教一遍 */
  private async wrongStep(): Promise<boolean> {
    this.distance--;
    this.g.world.setApproach(this.distance, this.total);
    sfx("step");
    if (this.distance > 0) { await wait(300); return false; }
    this.phase = "busy";
    this.closeTone();
    await new Promise<void>(res => this.g.world.lunge(() => {
      sfx("bite");
      if (!this.wrongCalled) {
        this.wrongCalled = true; this.failed = true;
        const r = onAnswer(this.g.run, this.item.id, "wrong", this.g.rng);
        recordAnswer(this.g.profile, this.item.id, "wrong", this.g.run.runNo);
        this.g.hud.update(r.heartLost);
        this.g.save();
      }
      res();
    }));
    if (this.g.run.over === "lost") { this.phase = "done"; await wait(900); this.alive = false; this.g.runLost(); return true; }
    await wait(600);
    await this.teach();
    return true;
  }

  /** 咬过之后，把这个音慢慢拼给孩子看，然后照样出招 */
  private async teach() {
    const syl = this.syls[this.si];
    this.phase = "busy";
    this.distance = this.total; this.g.world.setApproach(this.distance, this.total);
    this.slots = syl.parts.map(() => null);
    this.cards.forEach(c => { c.used = false; c.el.classList.remove("used"); });
    this.renderSlots();
    for (let i = 0; i < syl.parts.length; i++) {
      this.slots[i] = syl.parts[i];
      const c = this.cards.find(k => !k.used && k.text === syl.parts[i]); if (c) { c.used = true; c.el.classList.add("used"); }
      const st: Record<number, string> = {}; st[i] = "hl"; this.renderSlots(st);
      if (hasVoice("p:" + syl.parts[i])) await say("p:" + syl.parts[i]); else await wait(500);
      await wait(250);
    }
    this.drawTrail(syl.tone);
    const ok: Record<number, string> = {}; syl.parts.forEach((_, i) => { ok[i] = "ok"; }); ok[syl.parts.length - 1] = "toned";
    this.renderSlots(ok);
    await this.sayCurrent();
    await wait(300);
    await this.hit();
  }

  private async hit() {
    if (!this.alive) return;
    const syl = this.syls[this.si];
    await new Promise<void>(res => this.g.world.attack(true, () => {
      sfx("hit"); sfx("seal");
      this.seals.children[this.si]?.classList.add("broken");
      const p = this.stripInner.children[this.si]?.querySelector(".p");
      if (p) { p.classList.remove("hide"); p.textContent = syl.written; p.classList.add("reveal"); }
      this.echo(syl.written, false);
      res();
    }));
    if (!this.failed || this.wrongCalled) void this.sayCurrent();
    await wait(1000);
    this.si++;
    if (this.si < this.syls.length) { this.beginSyllable(); if (this.item.kind !== "char") await this.sayCurrent(); return; }
    await this.finishItem();
  }

  private async finishItem() {
    const { run, profile } = this.g;
    const result: AnswerResult = this.failed ? "wrong" : this.assisted ? "assisted" : "correct";
    if (!this.wrongCalled) {
      const r = onAnswer(run, this.item.id, result, this.g.rng);
      recordAnswer(profile, this.item.id, result, run.runNo);
      if (r.stars > 0) this.g.toast(`${ICON.star} +${r.stars}`);
      if (r.hintGained) setTimeout(() => this.g.toast(`连对奖励一个道具`), 900);
      this.g.hud.update(false, r.hintGained);
    }
    this.g.save();
    if (this.item.kind !== "char") { await wait(300); await say("i:" + this.item.id); }
    await wait(400);
    if (this.kind === "boss") {
      this.bossHpNow -= this.weak && result === "correct" ? 2 : 1;
      this.updateBossHp();
      return this.nextBossQuestion();
    }
    this.phase = "busy";
    await new Promise<void>(r => this.g.world.defeat(r));
    this.g.world.clearDrops();
    await this.nextMonster();
  }

  private updateBossHp() { (this.bossHp.firstElementChild as HTMLElement).style.width = `${Math.max(0, this.bossHpNow / this.bossHpMax) * 100}%`; }

  private finish() {
    if (!this.alive) return;
    this.phase = "done"; this.alive = false;
    this.g.hud.onHint = null;
    this.onEnd();
  }

  // ---------- 提示道具 ----------
  useHint(id: HintId): boolean {
    const syl = this.syls[this.si];
    if (!syl || (this.phase !== "spell" && this.phase !== "tone")) return false;
    if (id === "sweep" && this.phase !== "spell") return false;
    if (id === "ghost" && this.phase !== "spell") return false;
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
      const i = this.slots.findIndex((s, k) => s === null || s !== syl.parts[k]);
      if (i >= 0) { if (this.slots[i] !== null) { this.returnCard(this.slots[i]!); this.slots[i] = null; } this.ghostAt = i; this.renderSlots(this.ghostState()); }
    }
    if (id === "trace") { if (this.phase === "tone") this.showGuide(); else this.pendingTrace = true; }
    return true;
  }

  private async slowRead() {
    const syl = this.syls[this.si];
    const last = syl.parts[syl.parts.length - 1];
    const mouth = h("div", "mouth", mouthSvg(syl.kind === "whole" ? syl.base.replace(/^(zh|ch|sh|[rzcsyw])/, "") : last));
    mouth.style.left = "598px"; mouth.style.top = "206px"; // 注音条和拼音格之间
    this.root.append(mouth); this.extras.push(mouth);
    const prevPhase = this.phase;
    for (let i = 0; i < syl.parts.length; i++) {
      if (!this.alive) return;
      const st: Record<number, string> = { ...this.ghostState() }; st[i] = "hl";
      if (prevPhase === "spell") this.renderSlots(st);
      if (hasVoice("p:" + syl.parts[i])) await say("p:" + syl.parts[i], 0.9); else await wait(400);
      await wait(250);
    }
    if (prevPhase === "spell" && this.phase === "spell") this.renderSlots(this.ghostState());
    await this.talk(() => hasVoice("s:" + syl.written) ? say("s:" + syl.written, 0.85) : say("i:" + this.item.id, 0.85));
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
      f.style.transition = "transform 1s ease-in-out"; f.style.transform = "translate(560px, 380px)";
      await wait(1600);
    }
    this.hideDemo();
  }
  private hideDemo() { this.demoEl?.remove(); this.demoEl = null; }

  /** 气泡、封印跟着怪物走 */
  private track() {
    if (!this.alive) return;
    const w = this.g.world;
    const [bx] = w.foeAnchor(0.7);
    const bubX = Math.min(1100, Math.max(560, bx - 280)), bubY = 196; // 气泡跟着怪物在它左边，高度固定在拼音格上方
    this.bubble.style.transform = `translate(${bubX}px, ${bubY}px)`;
    const [sx, sy] = w.foeTopAnchor();
    this.seals.style.transform = `translate(${sx - this.seals.offsetWidth / 2}px, ${Math.max(150, sy + 4)}px)`;
    this.bossHp.style.transform = `translate(${sx - 110}px, ${Math.max(150, sy + 4) + 34}px)`;
    requestAnimationFrame(() => this.track());
  }
}

