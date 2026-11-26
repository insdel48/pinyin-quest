import { expect, it } from "vitest";
import { pairsEvent, statueEvent } from "./events";
import { analyze, compose, toneMark, VALID_SYLLABLES } from "./pinyin";
import { makeRng } from "./rng";
import type { Item } from "./types";

it("石像只出字，每题恰有一个正确选项和两个合法的不同音节写法", () => {
  const rng = makeRng(8);
  for (const base of VALID_SYLLABLES) {
    const char: Item = { id: "char", kind: "char", hanzi: "", pinyin: [toneMark(base, 2)] };
    const word: Item = { id: "word", kind: "word", hanzi: "妈妈", pinyin: ["mā", "ma"] };
    const { target, options } = statueEvent([char, word], rng);
    expect(target.written).toBe(char.pinyin[0]);
    expect(options).toHaveLength(3);
    expect(new Set(options).size).toBe(3);
    expect(options.filter((option) => option === target.written)).toHaveLength(1);
    for (const option of options) expect(analyze(option).written).toBe(option);
  }
});

it("优先用同声调的易混替换", () => {
  const char: Item = { id: "bao", kind: "char", hanzi: "包", pinyin: ["bāo"] };
  const { options } = statueEvent([char], makeRng(20));
  expect(options.every((option) => ["bāo", "dāo", "pāo"].includes(option))).toBe(true);
});

it("配对均可拼成音节，低等级只用简单韵母", () => {
  const rng = makeRng(19);
  for (let count = 0; count < 48; count++) {
    const level = count % 5 + 1;
    const { initials, finals, pairs } = pairsEvent(rng, level);
    expect(pairs).toHaveLength(3);
    expect(new Set(initials).size).toBe(3);
    expect(new Set(finals).size).toBe(3);
    for (const [initial, final] of pairs) {
      expect(initials).toContain(initial);
      expect(finals).toContain(final);
      expect(compose([initial, final], 0)).not.toBeNull();
      if (level <= 2) expect(["a", "o", "e", "i", "u"]).toContain(final);
    }
  }
});
