// 冒险故事守卫：每句的重点字都标对位置、拼音能拆成卡片，旁白和整句朗读都有核对通过的读音。
// 故事改了要重跑 tools/story.py 和 tools/audio_jobs.py + tools/tts_batch.py。
import { describe, expect, test } from "vitest";
import { analyze } from "../core/pinyin";
import audio from "./audio.json";
import story from "./story.json";

const voices = audio as Record<string, string>;
const enemies = story.chapters.flatMap(c => c.enemies);
const assets = new Set(Object.keys(import.meta.glob(["/public/bg/*.jpg", "/public/models/**/*.glb"])));

describe("冒险故事", () => {
  test("5 章，每章 3 个小怪 + 1 个大怪，每个敌人 3 句", () => {
    expect(story.chapters.length).toBe(5);
    for (const c of story.chapters) expect(c.enemies.map(e => e.boss)).toEqual([false, false, false, true]);
    expect(enemies.filter(e => e.sentences.length !== 3).map(e => e.name)).toEqual([]);
  });
  test("重点字位置在句子里、个数和拼音对得上，拼音都能拆成卡片（拆不开去 tools/story.py 的 OVERRIDE 改）", () => {
    const bad = enemies.flatMap(e => e.sentences.filter(s => {
      const chars = [...s.text];
      if (!s.targets.length || s.targets.length !== s.pinyin.length) return true;
      if (s.targets.some(t => t < 0 || t >= chars.length || /[，。！？、]/.test(chars[t]))) return true;
      return s.pinyin.some(p => { try { analyze(p); return false; } catch { return true; } });
    }).map(s => s.text));
    expect(bad).toEqual([]);
  });
  test("章节名、神兽称号和名字、神兽来历的注音和汉字一一对上（对不上重跑 tools/story.py）", () => {
    const han = (t: string) => [...t].filter(ch => /\p{Script=Han}/u.test(ch)).length;
    const pairs: [string, string][] = [
      ...story.chapters.map(c => [c.title, c.titlePy] as [string, string]),
      ...enemies.flatMap(e => [[e.title, e.titlePy], [e.name, e.namePy], [e.defeat, e.defeatPy]] as [string, string][]),
    ];
    expect(pairs.filter(([t, py]) => !py || py.split(" ").length !== han(t)).map(([t]) => t)).toEqual([]);
  });
  test("章节旁白、敌人口头禅、每句朗读都有读音", () => {
    const keys = [
      ...story.chapters.flatMap(c => [`n:${c.id}-intro`, `n:${c.id}-outro`]),
      ...enemies.flatMap(e => [`n:${e.id}-says`, ...e.sentences.map((_, i) => `t:${e.id}-${i}`)]),
    ];
    expect(keys.filter(k => !voices[k])).toEqual([]);
  });
  test("每章有背景图、每个敌人有 3D 模型（缺了去 tools/blender/foes/ 补，或让 Codex 画背景）", () => {
    const need = [
      ...story.chapters.map(c => `/public/bg/${c.id}.jpg`),
      ...enemies.map(e => `/public/models/foes/${e.id}.glb`),
      "/public/models/kid.glb", "/public/models/foes/didi.glb", "/public/models/foes/fist.glb",
    ];
    expect(need.filter(f => !assets.has(f))).toEqual([]);
  });
});
