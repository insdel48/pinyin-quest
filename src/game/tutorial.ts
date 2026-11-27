// 新手关：第一次玩时，手把手教听、拼、四个声调和轻声，最后划出声调打败墨团。
import { classifyTone } from "../core/gesture";
import type { Tone } from "../core/types";
import { say, sfx, stopVoice, wait } from "./audio";
import type { Game } from "./app";
import { picSvg } from "./pics";
import { h, ICON, TONE_PATH } from "./ui";

const SVG_NS = "http://www.w3.org/2000/svg";
// 四个声调的例字：韵母都是 a，孩子只要注意声调
const TONES: { tone: Tone; han: string; base: string; written: string }[] = [
  { tone: 1, han: "八", base: "ba", written: "bā" },
  { tone: 2, han: "爬", base: "pa", written: "pá" },
  { tone: 3, han: "马", base: "ma", written: "mǎ" },
  { tone: 4, han: "怕", base: "pa", written: "pà" },
];
// 大号声调示范框：TONE_PATH 的 340×64 放大两倍
const GUIDE = { x: 300, y: 214, k: 2 };

export class Tutorial {
  private root = h("div", "battle tutorial");
  private steps = h("div", "tsteps");
  private strip = h("div", "strip");
  private stripInner = h("div", "inner");
  private bubble = h("button", "bubble");
  private slotsEl = h("div", "slots");
  private hand = h("div", "hand");
  private finger = h("div", "tfinger", ICON.finger);
  private skip = h("button", "btn small skip", "跳过");
  private alive = true;
  private waiter: ((v: unknown) => void) | null = null;

  constructor(private g: Game, private onDone: () => void) {
    this.strip.append(this.stripInner);
    this.steps.innerHTML = ["听", "拼", "声调", "出招"].map(s => `<span>${s}</span>`).join("");
    this.finger.hidden = true;
    this.root.append(this.steps, this.strip, this.slotsEl, this.hand, this.bubble, this.finger, this.skip);
    this.skip.addEventListener("click", () => {
      if (!this.skip.classList.contains("sure")) { this.skip.classList.add("sure"); this.skip.textContent = "再点一次跳过"; return; }
      this.end();
    });
    g.screen.replaceChildren(this.root);
    void this.run();
  }

  destroy() { this.alive = false; stopVoice(); this.waiter?.(null); }

  private end() { if (!this.alive) return; this.destroy(); this.onDone(); }

  private step(i: number) { [...this.steps.children].forEach((el, k) => { el.classList.toggle("on", k === i); el.classList.toggle("done", k < i); }); }

  private async run() {
    const w = this.g.world;
    w.setScene("shanye"); w.setMonster("blob"); w.setApproach(2, 2);
    this.stripInner.innerHTML = `<div class="ch cur"><span class="p hide"></span><span class="h">猫</span></div>`;
    this.bubble.className = "bubble";
    this.bubble.innerHTML = `<svg class="frame" viewBox="0 0 168 104"><path d="M8 8H140V38L162 50 140 62V96H8Z" fill="#f8f2e3" stroke="#2b2a26" stroke-width="2.4" stroke-linejoin="round"/></svg><span class="pic">${picSvg("cat", 68)}</span><span class="spk">${ICON.speaker}</span>`;
    this.bubble.style.transform = "translate(760px, 196px)";
    this.bubble.hidden = true;
    await wait(900); if (!this.alive) return;

    // 1. 听：点喇叭
    this.step(0);
    w.cheer();
    await say("v:t-hello");
    this.bubble.hidden = false;
    this.point(900, 250);
    await this.waitFor(this.bubble, "click", async () => { await say("v:t-listen"); });
    if (!this.alive) return;
    this.hideFinger(); sfx("chime");
    await say("i:c-猫"); await wait(300);

    // 2. 拼：跟着手指放卡片
    this.step(1);
    const parts = ["m", "ao"], filled: string[] = [];
    this.renderSlots(parts.map(() => ""), {});
    this.hand.innerHTML = ["b", "m", "n", "ou", "ao"].map(t => `<div class="card" data-k="${t}">${t}</div>`).join("");
    void say("v:t-spell");
    while (this.alive && filled.length < parts.length) {
      const want = parts[filled.length];
      const card = this.hand.querySelector<HTMLElement>(`.card[data-k="${want}"]`)!;
      const r = this.stageRect(card);
      this.point(r.x + r.w / 2, r.y + 30);
      const tapped = await this.waitCard();
      if (!this.alive) return;
      if (tapped.dataset.k !== want) { sfx("nope"); tapped.classList.remove("shake"); void tapped.offsetWidth; tapped.classList.add("shake"); void say("p:" + tapped.dataset.k); continue; }
      sfx("snap"); tapped.classList.add("used"); filled.push(want);
      this.renderSlots(parts.map((_, i) => filled[i] ?? ""), {});
      await say("p:" + want);
    }
    this.hideFinger();
    this.renderSlots(parts, { 0: "ok", 1: "ok" });
    sfx("chime"); await wait(500);

    // 3. 声调：四个声调各示范一遍，再自己划；最后学轻声
    this.step(2);
    this.hand.replaceChildren();
    this.bubble.hidden = true; // 练声调时先收起猫的气泡，免得和例字搞混
    await say("v:t-tones");
    for (const t of TONES) {
      if (!this.alive) return;
      this.stripInner.innerHTML = `<div class="ch cur"><span class="p hide"></span><span class="h">${t.han}</span></div>`;
      this.renderSlots([t.base], {});
      await this.learnTone(t.tone, "v:t-tone" + t.tone, "s:" + t.written, t.written);
    }
    // 轻声：妈妈的第二个“妈”
    if (!this.alive) return;
    this.stripInner.innerHTML = `<div class="ch done"><span class="p">mā</span><span class="h">妈</span></div><div class="ch cur"><span class="p hide"></span><span class="h">妈</span></div>`;
    this.renderSlots(["ma"], {});
    await this.learnTone(0, "v:t-neutral", "i:w-妈妈", "ma");

    // 4. 出招：回到“猫”，自己划出一声打败墨团
    if (!this.alive) return;
    this.step(3);
    this.bubble.hidden = false;
    this.stripInner.innerHTML = `<div class="ch cur"><span class="p hide"></span><span class="h">猫</span></div>`;
    this.renderSlots(parts, { 0: "ok", 1: "ok" });
    await say("v:t-back");
    await say("s:māo");
    const ok = await this.swipe(1, false);
    if (!this.alive) return;
    void ok;
    this.renderSlots(["m", "āo"], { 0: "ok", 1: "toned" });
    await new Promise<void>(res => w.attack(true, () => { sfx("seal"); res(); }, "finisher", "māo"));
    const p = this.stripInner.querySelector(".p"); if (p) { p.classList.remove("hide"); p.textContent = "māo"; p.classList.add("reveal"); }
    await say("s:māo");
    await new Promise<void>(res => w.defeat(res));
    w.clearDrops();
    w.cheer();
    await say("v:t-done");
    this.end();
  }

  /** 示范一个声调，再让孩子划；连错 3 次就帮他划完 */
  private async learnTone(tone: Tone, intro: string, sound: string, written: string) {
    const demo = this.showGuide(tone);
    await say(intro);
    await say(sound);
    if (!this.alive) return;
    await say("v:t-try");
    const ok = await this.swipe(tone, true);
    demo.remove();
    if (!this.alive) return;
    this.renderSlots([written], { 0: "toned" });
    const p = this.stripInner.querySelector(".ch.cur .p"); if (p) { p.classList.remove("hide"); p.textContent = written; p.classList.add("reveal"); }
    sfx("chime");
    await say(sound);
    if (ok) await say("v:t-good");
    await wait(300);
  }

  /** 大号虚线示范这一笔，手指沿着它走 */
  private showGuide(tone: Tone): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "tguide"); svg.setAttribute("viewBox", "0 0 340 64");
    if (tone === 0) {
      svg.innerHTML = `<circle cx="170" cy="32" r="16"/>`;
      this.point(GUIDE.x + 170 * GUIDE.k, GUIDE.y + 32 * GUIDE.k);
    } else {
      svg.innerHTML = `<path d="${TONE_PATH[tone]}"/>`;
      const path = svg.querySelector("path")!;
      this.finger.hidden = false;
      const len = () => path.getTotalLength();
      const t0 = performance.now();
      const move = (now: number) => {
        if (!svg.isConnected || !this.alive) return;
        const k = ((now - t0) % 1800) / 1400;
        if (k <= 1) { const pt = path.getPointAtLength(len() * k); this.placeFinger(GUIDE.x + pt.x * GUIDE.k, GUIDE.y + pt.y * GUIDE.k); }
        requestAnimationFrame(move);
      };
      requestAnimationFrame(move);
    }
    this.root.insertBefore(svg, this.finger);
    return svg;
  }

  /** 等孩子划一笔：划对返回 true；teach 时连错 3 次自动算过（返回 false） */
  private async swipe(tone: Tone, teach: boolean): Promise<boolean> {
    const zone = h("div", "tonezone", `<div class="tip">${tone === 0 ? "轻轻点一下" : "用手指划出声调"}</div>`);
    const stroke = document.createElementNS(SVG_NS, "svg");
    stroke.setAttribute("class", "stroke"); stroke.setAttribute("viewBox", "0 0 1280 800");
    const path = document.createElementNS(SVG_NS, "path"); stroke.append(path);
    this.root.insertBefore(zone, this.bubble); this.root.insertBefore(stroke, this.bubble);
    let fails = 0;
    const result = await new Promise<boolean>(resolve => {
      this.waiter = () => resolve(false);
      let pts: { x: number; y: number; t: number }[] = [];
      zone.addEventListener("pointerdown", e => { try { zone.setPointerCapture(e.pointerId); } catch { /* 有的浏览器不支持 */ } pts = [{ ...this.g.toStage(e), t: e.timeStamp }]; path.setAttribute("d", ""); this.hideFinger(); });
      zone.addEventListener("pointermove", e => { if (!pts.length) return; pts.push({ ...this.g.toStage(e), t: e.timeStamp }); path.setAttribute("d", "M" + pts.map(p => `${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join(" L")); });
      zone.addEventListener("pointerup", e => {
        if (!pts.length) return;
        pts.push({ ...this.g.toStage(e), t: e.timeStamp });
        const got = classifyTone(pts); pts = [];
        if (got === tone) { sfx("swish"); resolve(true); return; }
        sfx("nope"); fails++;
        setTimeout(() => path.setAttribute("d", ""), 400);
        zone.classList.remove("again"); void zone.offsetWidth; zone.classList.add("again");
        if (teach && fails >= 3) { resolve(false); return; }
        void say(tone === 0 ? "v:t-neutral" : "v:t-tone" + tone);
      });
    });
    this.waiter = null;
    zone.remove(); stroke.remove();
    return result;
  }

  // ---------- 小工具 ----------
  private renderSlots(texts: string[], state: Record<number, string>) {
    this.slotsEl.replaceChildren();
    texts.forEach((t, i) => {
      if (i) this.slotsEl.append(h("span", "plus", "+"));
      const w = 72 + 30 * Math.max(1, t.length);
      const st = state[i] ?? "";
      const el = h("div", "slot" + (st === "toned" ? " ok" : st ? " " + st : ""));
      const lines = [26, 56, 86, 116].map(y => `<line class="ln" x1="10" x2="${w - 10}" y1="${y}" y2="${y}"/>`).join("");
      el.innerHTML = `<svg width="${w}" height="132" viewBox="0 0 ${w} 132"><rect class="bgr" x="1" y="1" width="${w - 2}" height="130" rx="6"/>${lines}${t ? `<text class="${st === "toned" ? "toned placed" : "placed"}" x="${w / 2}" y="86">${t}</text>` : ""}</svg>`;
      this.slotsEl.append(el);
    });
  }

  private stageRect(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const a = this.g.toStage({ clientX: r.left, clientY: r.top }), b = this.g.toStage({ clientX: r.right, clientY: r.bottom });
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }

  private point(x: number, y: number) { this.finger.hidden = false; this.finger.classList.add("pulse"); this.placeFinger(x, y); }
  private placeFinger(x: number, y: number) { this.finger.style.transform = `translate(${x - 18}px, ${y - 6}px)`; }
  private hideFinger() { this.finger.hidden = true; this.finger.classList.remove("pulse"); }

  /** 等某个元素被点；每过 6 秒提醒一次 */
  private waitFor(el: HTMLElement, ev: string, remind: () => Promise<void>) {
    return new Promise<void>(resolve => {
      let timer = 0;
      const tick = () => { timer = window.setTimeout(async () => { if (!this.alive) return; await remind(); tick(); }, 6000); };
      void remind(); tick();
      this.waiter = () => { clearTimeout(timer); resolve(); };
      el.addEventListener(ev, () => { clearTimeout(timer); this.waiter = null; resolve(); }, { once: true });
    });
  }

  private waitCard(): Promise<HTMLElement> {
    return new Promise(resolve => {
      const on = (e: Event) => {
        const c = (e.target as HTMLElement).closest<HTMLElement>(".card");
        if (!c || c.classList.contains("used")) return;
        this.hand.removeEventListener("click", on); this.waiter = null; resolve(c);
      };
      this.waiter = () => { this.hand.removeEventListener("click", on); resolve(this.hand.firstElementChild as HTMLElement); };
      this.hand.addEventListener("click", on);
    });
  }
}
