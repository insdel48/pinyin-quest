// 界面小工具：建元素、舞台坐标、各种图标和名字。
import type { BoonId, HintId, NodeType, Tone } from "../core/types";

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
}

const svg = (body: string, vb = "0 0 32 32") => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const HINT_INFO: Record<HintId, { name: string; desc: string; icon: string }> = {
  slow: { name: "慢慢读", desc: "拆开慢慢读给你听", icon: svg(`<path d="M4 16c4-7 8-10 12-10s8 3 12 10c-4 7-8 10-12 10S8 23 4 16z"/><path d="M10 16c2 2 4 3 6 3s4-1 6-3"/>`) },
  sweep: { name: "扫错卡", desc: "扫走两张错卡", icon: svg(`<path d="M21 4l-7 13"/><path d="M8 17h12l3 11H5z"/><path d="M11 22v6M16 22v6"/>`) },
  ghost: { name: "看影子", desc: "格子里显出字母影子", icon: svg(`<rect x="5" y="5" width="22" height="22" rx="3" stroke-dasharray="3 3"/><path d="M12 13q4-4 8 0v8"/>`) },
  trace: { name: "看声调", desc: "画出声调线照着划", icon: svg(`<path d="M4 10l9 13L28 6" stroke-dasharray="3 3"/>`) },
};

export const BOON_INFO: Record<BoonId, { name: string; desc: string; icon: string }> = {
  shield: { name: "竹盾", desc: "每场挡住一次咬", icon: svg(`<path d="M16 3l10 4v8c0 7-5 12-10 14C11 27 6 22 6 15V7z" fill="#9fbf8f"/><path d="M12 9v14M16 8v16M20 9v14"/>`) },
  heal: { name: "补心草", desc: "打完怪回一颗心", icon: svg(`<path d="M16 27S5 20 5 12a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 8-11 15-11 15z" fill="#e8a6aa"/><path d="M16 13v8M12 17h8"/>`) },
  calm: { name: "定身符", desc: "多错一次才被咬", icon: svg(`<rect x="9" y="3" width="14" height="26" rx="2" fill="#f0d27a"/><path d="M13 9h6M16 9v14M13 15h6M12 21l4 3 4-3"/>`) },
  wick: { name: "好运灯", desc: "连对两题就送道具", icon: svg(`<path d="M16 4c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" fill="#f0b04a"/><path d="M16 21v7M11 28h10"/>`) },
  bag: { name: "小布袋", desc: "能多带一个道具", icon: svg(`<path d="M11 9h10l4 6c2 5 0 13-9 13S5 20 7 15z" fill="#c0533c"/><path d="M11 9l-2-5h14l-2 5M12 9h8"/>`) },
  gold: { name: "聚宝盆", desc: "答对多得一颗星", icon: svg(`<path d="M4 16h24c0 7-5 12-12 12S4 23 4 16z" fill="#b8913a"/><circle cx="12" cy="11" r="4" fill="#f0d27a"/><circle cx="20" cy="10" r="4" fill="#f0d27a"/><circle cx="16" cy="6" r="3.5" fill="#f0d27a"/>`) },
};

export const NODE_INFO: Record<NodeType, { name: string; icon: string }> = {
  battle: { name: "打怪", icon: svg(`<path d="M8 21c0-8 4-14 9-14s8 5 8 12c0 5-3 8-8 8-6 0-9-2-9-6z" fill="#2b2a26"/><circle cx="14" cy="17" r="2" fill="#f3ead8" stroke="none"/><circle cx="20" cy="17" r="2" fill="#f3ead8" stroke="none"/>`) },
  elite: { name: "大怪", icon: svg(`<circle cx="16" cy="16" r="11" fill="#a19e95"/><circle cx="16" cy="17" r="6" fill="#d2cfc6"/><path d="M13 15h0M19 15h0" stroke-width="3"/><path d="M12 12l3 1M20 12l-3 1"/>`) },
  chest: { name: "宝箱", icon: svg(`<rect x="5" y="13" width="22" height="13" rx="2" fill="#b8913a"/><path d="M5 13c0-5 4-7 11-7s11 2 11 7"/><rect x="13" y="15" width="6" height="5" rx="1" fill="#f0d27a"/>`) },
  event: { name: "小游戏", icon: svg(`<circle cx="16" cy="16" r="12" fill="#f8f2e3"/><path d="M12 12a4 4 0 1 1 6 3c-1.5 1-2 2-2 4M16 23v.5"/>`) },
  camp: { name: "火堆", icon: svg(`<path d="M16 4c3 5 8 8 8 14a8 8 0 0 1-16 0c0-4 2-6 4-8 0 3 2 5 3 5-1-4 0-8 1-11z" fill="#c0533c"/><path d="M8 28l16-4M24 28L8 24"/>`) },
  boss: { name: "大怪王", icon: svg(`<path d="M7 11h18l-2 11H9z" fill="#5c7563"/><path d="M9 22l-1 6M23 22l1 6M16 22v6M10 11a3 3 0 0 1 0-6M22 11a3 3 0 0 0 0-6"/><circle cx="13" cy="16" r="1.5" fill="#f0b04a" stroke="none"/><circle cx="19" cy="16" r="1.5" fill="#f0b04a" stroke="none"/>`) },
};

export const ICON = {
  speaker: svg(`<path d="M5 12h5l7-6v20l-7-6H5z" fill="currentColor"/><path d="M21 11q3 5 0 10M25 7q6 9 0 18"/>`),
  heart: svg(`<path d="M16 27S5 20 5 12a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 8-11 15-11 15z" fill="currentColor"/>`),
  star: svg(`<path d="M16 3l3.6 8 8.4.7-6.4 5.6 2 8.4L16 21l-7.6 4.7 2-8.4L4 11.7l8.4-.7z" fill="currentColor"/>`),
  back: svg(`<path d="M20 6L10 16l10 10"/>`),
  home: svg(`<path d="M5 15L16 5l11 10"/><path d="M8 13v13h16V13"/><path d="M13 26v-7h6v7"/>`),
  play: svg(`<path d="M10 6l15 10-15 10z" fill="currentColor"/>`),
  finger: svg(`<path d="M13 28c-3-2-6-7-7-10-.5-2 2-3 3.5-1.5L12 19V6.5a2 2 0 0 1 4 0V15v-3a2 2 0 0 1 4 0v4-2a2 2 0 0 1 4 0v8c0 4-2 6-3 6z" fill="#f8f2e3"/>`),
  hat: svg(`<path d="M2 20L16 9l14 11c-8 2-20 2-28 0z" fill="#3a372f"/><circle cx="16" cy="22" r="4" fill="#f2e4cc"/>`),
};

/** 四种声调的标准划法，画在 340×64 的框里 */
export const TONE_PATH: Record<Tone, string> = {
  0: "M170 32 L171 32",
  1: "M30 32 C110 29 230 35 310 32",
  2: "M50 56 L290 8",
  3: "M40 10 Q150 96 300 8",
  4: "M50 8 L290 56",
};

/** 慢读时的口型：按韵母的第一个元音 */
export function mouthSvg(final: string): string {
  const v = final.replace(/^[iuü](?=[aoe])/, "")[0] ?? "a";
  const shape = v === "a" ? `<ellipse cx="32" cy="34" rx="16" ry="13" fill="#7a2a22"/><path d="M16 30q16-10 32 0"/>`
    : "oü".includes(v) || v === "u" ? `<ellipse cx="32" cy="33" rx="8" ry="9" fill="#7a2a22"/><ellipse cx="32" cy="33" rx="12" ry="13"/>`
    : v === "e" ? `<ellipse cx="32" cy="33" rx="15" ry="7" fill="#7a2a22"/><path d="M16 31q16-6 32 0"/>`
    : `<ellipse cx="32" cy="33" rx="17" ry="4" fill="#7a2a22"/><path d="M14 33q18-10 36 0q-18 10-36 0"/>`;
  return `<svg viewBox="0 0 64 64" width="84" height="84" fill="none" stroke="#2b2a26" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="#f2e4cc"/>${shape}</svg>`;
}
