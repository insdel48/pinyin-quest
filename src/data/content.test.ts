// 题库守卫：配图都画了、每道题都能按课本拆卡、读音齐全的题够多。
import { describe, expect, test } from "vitest";
import { analyze } from "../core/pinyin";
import type { Item } from "../core/types";
import { PICS } from "../game/pics";
import audio from "./audio.json";
import items from "./items.json";

const all = items as Item[];
const voices = audio as Record<string, string>;

describe("题库", () => {
  test("每个配图名都有对应的画（缺了就去 src/game/pics.ts 补一个）", () => {
    const missing = all.filter(i => i.pic && !PICS[i.pic]).map(i => `${i.hanzi}:${i.pic}`);
    expect(missing).toEqual([]);
  });
  test("每个字的拼音都能按课本拼读法拆成卡片（拆不开说明注音写错了，改 tools/content.py）", () => {
    const bad = all.flatMap(i => i.pinyin.filter(p => { try { analyze(p); return false; } catch { return true; } }).map(p => `${i.hanzi}:${p}`));
    expect(bad).toEqual([]);
  });
  test("题目 id 不重复，字数和音节数一致", () => {
    expect(new Set(all.map(i => i.id)).size).toBe(all.length);
    expect(all.filter(i => [...i.hanzi].length !== i.pinyin.length)).toEqual([]);
  });
  test("读音核对通过、能出题的至少 300 道，五档都有题", () => {
    const playable = all.filter(i => voices["i:" + i.id]);
    expect(playable.length).toBeGreaterThanOrEqual(300);
    for (const k of ["char", "word", "idiom"]) expect(playable.some(i => i.kind === k)).toBe(true);
  });
});
