import { expect, it } from "vitest";
import { newProfile } from "./progress";
import { bossQuestions, campHeal, chestChoices, endBattle, finishRun, monsterDistance, moveTo,
  newRun, onAnswer, startBattle, takeChoice, useHint } from "./run";
import type { Item } from "./types";

const rng = () => 0;

it("开局读取档案加成并验证相邻路线", () => {
  const p = newProfile();
  p.runsCompleted = 2;
  p.meta.extraHeart = p.meta.extraSlot = true;
  const run = newRun(p, 45);
  expect(run).toEqual(newRun(p, 45));
  expect(run).toMatchObject({ runNo: 3, hearts: 5, maxHearts: 5, hintCap: 4, layer: 0, nodeId: null });
  expect(run.hints).toHaveLength(1);
  expect(moveTo(run, "L2-0")).toBe(false);
  expect(moveTo(run, "L1-1")).toBe(true);
  expect(moveTo(run, "L2-0")).toBe(true);
  expect(moveTo(run, "L3-2")).toBe(false);
  expect(run).toMatchObject({ layer: 2, nodeId: "L2-0" });
  expect(moveTo(run, "L3-1")).toBe(true);
});

it("处理连胜、提示容量、答错和竹盾", () => {
  const run = newRun(newProfile(), 26);
  run.hints = ["ghost", "trace", "trace"];
  expect(monsterDistance(run)).toBe(2);
  run.boons = ["wick", "gold", "shield", "calm"];
  run.layer = 2;
  expect(monsterDistance(run)).toBe(3);
  expect(onAnswer(run, "a", "correct", rng)).toEqual({ heartLost: false, hintGained: null, stars: 2 });
  expect(onAnswer(run, "b", "correct", rng).hintGained).toBeNull();
  expect(run.streak).toBe(2);
  expect(useHint(run, "trace")).toBe(true);
  expect(run.hints).toEqual(["ghost", "trace"]);
  expect(useHint(run, "sweep")).toBe(false);
  expect(onAnswer(run, "c", "correct", rng).hintGained).toBe("slow");
  expect(run.streak).toBe(0);
  expect(onAnswer(run, "d", "assisted", rng).stars).toBe(1);
  expect(onAnswer(run, "e", "wrong", rng).heartLost).toBe(false);
  expect(run.shieldUsed).toBe(true);
  expect(onAnswer(run, "e", "wrong", rng).heartLost).toBe(true);
  expect(run.hearts).toBe(3);
  expect(run.errors).toEqual(["e"]);
  expect(run.recycle).toEqual(["d", "e", "e"].map((itemId) => ({ itemId, layer: 2 })));
  expect(run.usedItems).toEqual(["a", "b", "c", "d", "e", "e"]);
  expect(run.stars).toBe(7);

  startBattle(run);
  expect(onAnswer(run, "f", "wrong", rng).heartLost).toBe(false);
  run.hearts = 1;
  expect(onAnswer(run, "g", "wrong", rng).heartLost).toBe(true);
  expect(run.over).toBe("lost");
});

it("发放宝箱、营地和战斗奖励并结算档案", () => {
  const p = newProfile();
  p.bestLayer = 7;
  const run = newRun(p, 26);
  run.boons = ["heal", "calm", "shield", "wick", "gold"];
  const choices = chestChoices(run, rng);
  expect(choices).toHaveLength(3);
  expect(choices[0]).toEqual({ type: "boon", id: "bag" });
  expect(choices.slice(1).every(({ type }) => type === "hint")).toBe(true);
  expect(takeChoice(run, choices[0])).toBe(true);
  expect(takeChoice(run, choices[0])).toBe(false);
  expect(run.hintCap).toBe(4);
  for (let i = 0; i < 3; i++) expect(takeChoice(run, { type: "hint", id: "trace" })).toBe(true);
  expect(takeChoice(run, { type: "hint", id: "trace" })).toBe(false);
  expect(chestChoices(run, rng).every(({ type }) => type === "hint")).toBe(true);

  run.hearts = 1;
  campHeal(run);
  expect(run.hearts).toBe(2);
  endBattle(run, "battle");
  expect(run.stars).toBe(2);
  expect(run.hearts).toBe(3);
  endBattle(run, "elite");
  expect(run.stars).toBe(6);
  expect(run.hearts).toBe(4);
  run.layer = 8;
  endBattle(run, "boss");
  expect(run.hearts).toBe(4);
  expect(run.over).toBe("won");
  finishRun(p, run);
  expect(p).toMatchObject({ stars: 16, runsCompleted: 1, bestLayer: 8 });
});

it("首领题和本局错题交替出现，短题库不插重复弱点", () => {
  const p = newProfile();
  const run = newRun(p, 26);
  const items: Item[] = [
    { id: "w1", kind: "word", hanzi: "妈妈", pinyin: ["mā", "ma"] },
    { id: "w2", kind: "word", hanzi: "爷爷", pinyin: ["yé", "ye"] },
    { id: "c1", kind: "char", hanzi: "山", pinyin: ["shān"] },
    { id: "c2", kind: "char", hanzi: "水", pinyin: ["shuǐ"] },
  ];
  run.errors = ["missing", "c1", "c2", "w1", "w2"];
  run.usedItems = ["c1", "c2"];
  const questions = bossQuestions(run, items, p, rng);
  expect(questions.map(({ weak }) => weak)).toEqual([false, true, false, true]);
  expect(questions.filter(({ weak }) => !weak).map(({ item }) => item.id)).toEqual(["w1", "w2"]);
  expect(new Set(questions.map(({ item }) => item.id))).toEqual(new Set(["w1", "w2", "c1", "c2"]));
  expect(bossQuestions(run, items.slice(0, 2), p, rng)).toHaveLength(2);
});
