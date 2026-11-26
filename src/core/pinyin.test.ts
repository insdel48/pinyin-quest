import { describe, expect, it } from "vitest";
import { analyze, compose, FINALS, INITIALS, itemDifficulty, itemSyllables, makeCards, stripTone,
  toneMark, VALID_SYLLABLES, WHOLE } from "./pinyin";
import { makeRng } from "./rng";
import type { Item } from "./types";

describe("课本拼音", () => {
  it("包含课本的三张表", () => {
    expect(INITIALS).toHaveLength(23);
    expect(FINALS).toHaveLength(24);
    expect(WHOLE).toHaveLength(16);
  });

  it.each([
    ["jú", "ju", 2], ["lǜ", "lü", 4], ["liang", "liang", 0],
  ] as const)("去掉 %s 的调号", (written, base, tone) => {
    expect(stripTone(written)).toEqual({ base, tone });
  });

  it.each([
    ["hao", 3, "hǎo"], ["dui", 4, "duì"], ["liu", 4, "liù"], ["guo", 3, "guǒ"],
    ["xue", 2, "xué"], ["nü", 3, "nǚ"], ["lüe", 4, "lüè"], ["ju", 2, "jú"],
    ["qu", 1, "qū"], ["yue", 4, "yuè"], ["bi", 3, "bǐ"], ["liang", 0, "liang"],
    ["lü", 1, "lǖ"], ["lü", 2, "lǘ"], ["lü", 4, "lǜ"], ["ye", 4, "yè"],
  ] as const)("给 %s 标第 %i 声", (base, tone, written) => {
    expect(toneMark(base, tone)).toBe(written);
  });

  it.each([
    ["ā", ["a"], "ā", "single", 1], ["ài", ["ai"], "ài", "single", 2],
    ["ér", ["er"], "ér", "single", 2], ["ān", ["an"], "ān", "single", 2],
    ["ōu", ["ou"], "ōu", "single", 2], ["jú", ["j", "ü"], "ú", "two", 3],
    ["què", ["q", "üe"], "uè", "two", 3], ["xūn", ["x", "ün"], "ūn", "two", 3],
    ["juān", ["j", "ü", "an"], "ān", "three", 3], ["ya", ["y", "a"], "a", "two", 1],
    ["yáng", ["y", "ang"], "áng", "two", 2], ["yǒu", ["y", "ou"], "ǒu", "two", 2],
    ["yǒng", ["y", "ong"], "ǒng", "two", 2], ["yān", ["y", "an"], "ān", "two", 2],
    ["wǒ", ["w", "o"], "ǒ", "two", 1], ["wài", ["w", "ai"], "ài", "two", 2],
    ["wèi", ["w", "ei"], "èi", "two", 2], ["wǎn", ["w", "an"], "ǎn", "two", 2],
    ["wēn", ["w", "en"], "ēn", "two", 2], ["wáng", ["w", "ang"], "áng", "two", 2],
    ["wēng", ["w", "eng"], "ēng", "two", 2], ["liú", ["l", "iu"], "iú", "two", 2],
    ["guì", ["g", "ui"], "uì", "two", 2], ["lún", ["l", "un"], "ún", "two", 2],
    ["nǚ", ["n", "ü"], "ǚ", "two", 1], ["lüè", ["l", "üe"], "üè", "two", 2],
    ["xué", ["x", "üe"], "ué", "two", 3], ["jūn", ["j", "ün"], "ūn", "two", 3],
    ["shuǐ", ["sh", "ui"], "uǐ", "two", 2], ["xiàng", ["x", "i", "ang"], "àng", "three", 3],
    ["guó", ["g", "u", "o"], "ó", "three", 3], ["huā", ["h", "u", "a"], "ā", "three", 3],
    ["liang", ["l", "i", "ang"], "ang", "three", 3], ["yuè", ["yue"], "yuè", "whole", 2],
    ["yī", ["yi"], "yī", "whole", 1], ["wǔ", ["wu"], "wǔ", "whole", 1],
    ["yú", ["yu"], "yú", "whole", 1], ["zhī", ["zhi"], "zhī", "whole", 2],
    ["zāng", ["z", "ang"], "āng", "two", 3], ["rén", ["r", "en"], "én", "two", 2],
    ["zhè", ["zh", "e"], "è", "two", 2], ["jiā", ["j", "i", "a"], "ā", "three", 3],
    ["miáo", ["m", "i", "ao"], "áo", "three", 3], ["tiān", ["t", "i", "an"], "ān", "three", 3],
    ["jiǒng", ["j", "i", "ong"], "ǒng", "three", 3], ["kuài", ["k", "u", "ai"], "ài", "three", 3],
    ["duǎn", ["d", "u", "an"], "ǎn", "three", 3], ["guāng", ["g", "u", "ang"], "āng", "three", 3],
  ] as const)("按课本拆 %s", (written, parts, lastToned, kind, difficulty) => {
    const syllable = analyze(written);
    expect(syllable).toMatchObject({ written, parts, lastToned, kind, difficulty });
    expect(compose(syllable.parts, syllable.tone)).toBe(written);
  });

  it("按卡片边界验收拼读", () => {
    expect(compose(["b", "ao"], 1)).toBe("bāo");
    expect(compose(["x", "i", "ang"], 4)).toBe("xiàng");
    expect(compose(["j", "ü"], 2)).toBe("jú");
    expect(compose(["y", "a"], 0)).toBe("ya");
    expect(compose(["y", "ü"], 2)).toBe("yú");
    expect(compose(["b", "ang", "i"], 1)).toBeNull();
    expect(compose(["b", "a", "o"], 1)).toBeNull();
    expect(compose(["j", "u"], 2)).toBeNull();
    expect(compose(["z", "hi"], 1)).toBeNull();
  });

  it.each(["", "biong", "lüan", "jǚ", "liù́", "líu", "x1", "fa fā"])("拒绝不合法的音节 %s", (input) => {
    expect(() => analyze(input)).toThrow();
  });

  it("按题目中最难音节分级", () => {
    const item: Item = { id: "sun", kind: "word", hanzi: "太阳", pinyin: ["tài", "yáng"] };
    expect(itemSyllables(item)).toEqual([analyze("tài"), analyze("yáng")]);
    expect(itemDifficulty(item)).toBe(2);
    expect(itemDifficulty({ ...item, pinyin: ["liang", "ā"] })).toBe(3);
  });

  it("所有表内音节的五种标调形式都可拆开再拼回，并能生成无重复卡片", () => {
    expect(VALID_SYLLABLES.size).toBe(410);
    const rng = makeRng(26);
    for (const base of VALID_SYLLABLES) {
      for (const tone of [0, 1, 2, 3, 4] as const) {
        const written = toneMark(base, tone);
        expect(stripTone(written)).toEqual({ base, tone });
        const syl = analyze(written);
        expect(compose(syl.parts, tone)).toBe(written);
      }
      const syl = analyze(base);
      const cards = makeCards(syl, rng);
      expect(cards).toHaveLength(syl.kind === "three" ? 6 : 5);
      expect(new Set(cards).size).toBe(cards.length);
      expect(cards).toEqual(expect.arrayContaining(syl.parts));
      if (syl.kind === "whole") expect(cards.every((card) => WHOLE.includes(card))).toBe(true);
    }
    expect(makeCards(analyze("bā"), rng)).toEqual(expect.arrayContaining(["b", "d", "p", "q", "a"]));
    expect(makeCards(analyze("xiàng"), rng, 3)).toHaveLength(6);
    expect(makeCards(analyze("xiàng"), rng, 9)).toHaveLength(9);
  });
});
