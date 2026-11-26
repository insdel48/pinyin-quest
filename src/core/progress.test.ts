import { describe, expect, it } from "vitest";
import { battleMonsters, buy, loadProfile, mastery, newProfile, pickQuestion, recordAnswer,
  saveProfile, SHOP, starsFor } from "./progress";
import { makeRng } from "./rng";
import type { Item } from "./types";

const items: Item[] = [
  { id: "a", kind: "char", hanzi: "啊", pinyin: ["ā"] },
  { id: "pen", kind: "char", hanzi: "盆", pinyin: ["pén"] },
  { id: "water", kind: "char", hanzi: "水", pinyin: ["shuǐ"] },
  { id: "shine", kind: "char", hanzi: "光", pinyin: ["guāng"] },
  { id: "steal", kind: "char", hanzi: "偷", pinyin: ["tōu"] },
  { id: "mother", kind: "word", hanzi: "妈妈", pinyin: ["mā", "ma"] },
  { id: "watermelon", kind: "word", hanzi: "西瓜", pinyin: ["xī", "guā"] },
  { id: "ordinary", kind: "idiom", hanzi: "大大咧咧", pinyin: ["dà", "da", "liē", "liē"] },
  { id: "learning", kind: "idiom", hanzi: "举一反三", pinyin: ["jǔ", "yī", "fǎn", "sān"] },
];

describe("长期档案", () => {
  it("保存并载入档案，坏数据返回新档案", () => {
    const profile = newProfile();
    expect(profile).toMatchObject({ level: 1, stars: 0, meta: {
      extraHeart: false, extraSlot: false, robe: "zhuqing", robesOwned: ["zhuqing"],
    } });
    recordAnswer(profile, "a", "correct", 1);
    expect(loadProfile(saveProfile(profile))).toEqual(profile);
    for (const bad of [null, "invalid", "null", '{"version":2}', '{"version":1}']) {
      expect(loadProfile(bad)).toEqual(newProfile());
    }
  });

  it("记录每种作答结果，首次连续答对三次才升级", () => {
    const p = newProfile();
    for (const result of ["correct", "assisted", "wrong", "correct", "correct"] as const) {
      recordAnswer(p, "a", result, 1);
    }
    expect(p.level).toBe(1);
    expect(p.recent).toEqual([true, false, false, true, true]);
    recordAnswer(p, "a", "correct", 1);
    expect(p.items.a).toEqual({ seen: 6, correct: 4, assisted: 1, wrong: 1, lastRun: 1 });
    expect(mastery(p.items.a)).toBeCloseTo(4.5 / 7);
    expect(mastery()).toBe(0);
    expect(p.collected).toEqual(["a"]);
    expect(p.level).toBe(2);
    expect(p.recent).toEqual([]);
  });

  it("后续用满八条或六条再调级，并限制等级与历史长度", () => {
    const p = newProfile();
    p.runsCompleted = 1;
    recordAnswer(p, "a", "wrong", 2);
    for (let count = 0; count < 6; count++) recordAnswer(p, "a", "correct", 2);
    expect(p.level).toBe(1);
    recordAnswer(p, "a", "correct", 2);
    expect(p.level).toBe(2);
    recordAnswer(p, "a", "correct", 2);
    for (let count = 0; count < 5; count++) recordAnswer(p, "a", "assisted", 2);
    expect(p.level).toBe(1);
    expect(p.recent).toEqual([]);
    p.level = 5;
    for (let count = 0; count < 15; count++) recordAnswer(p, "a", "correct", 2);
    expect(p.level).toBe(5);
    expect(p.recent).toHaveLength(12);
  });

  it("结算星星并且每件商品只买一次", () => {
    expect([starsFor("correct", []), starsFor("assisted", []), starsFor("wrong", [])]).toEqual([1, 0, 0]);
    expect([starsFor("correct", ["gold"]), starsFor("assisted", ["gold"]), starsFor("wrong", ["gold"])]).toEqual([2, 1, 0]);
    const p = newProfile();
    expect(buy(p, "robe-yuebai")).toBe(false);
    p.stars = 170;
    for (const { id } of SHOP) {
      expect(buy(p, id)).toBe(true);
      expect(buy(p, id)).toBe(false);
    }
    expect(p.stars).toBe(0);
    expect(p.meta).toMatchObject({ robesOwned: ["zhuqing", "yuebai"], extraHeart: true, extraSlot: true });
  });
});

describe("战斗出题", () => {
  function question(overrides: Partial<Parameters<typeof pickQuestion>[0]> = {}) {
    return pickQuestion({
      items, profile: newProfile(), monster: "blob", level: 1, layer: 5, rng: () => 0,
      exclude: new Set(), recycle: [], ...overrides,
    }).id;
  }

  it("按怪物和等级选题", () => {
    expect(question()).toBe("a");
    expect(question({ monster: "kite", level: 2, exclude: new Set(["pen"]) })).toBe("water");
    expect(question({ monster: "lion" })).toBe("pen");
    expect(question({ monster: "lion", level: 2 })).toBe("shine");
    expect(question({ monster: "lion", level: 3, exclude: new Set(["shine"]) })).toBe("mother");
    expect(question({ monster: "lantern" })).toBe("a");
    expect(question({ monster: "lantern", level: 2 })).toBe("mother");
    expect(question({ monster: "ding", level: 2 })).toBe("mother");
    expect(question({ monster: "ding", level: 3, rng: () => 0.6 })).toBe("ordinary");
    expect(question({ monster: "ding", level: 3, rng: () => 0.9 })).toBe("learning");
  });

  it("优先取间隔两层又符合题型的复习题，放宽难度后才忽略排除", () => {
    const recycle = [{ itemId: "mother", layer: 2 }, { itemId: "pen", layer: 4 }, { itemId: "water", layer: 3 }];
    expect(question({ level: 2, recycle, exclude: new Set(["water"]) })).toBe("water");
    expect(recycle.map(({ itemId }) => itemId)).toEqual(["mother", "pen"]);
    expect(question({ exclude: new Set(["a"]) })).toBe("pen");
    expect(question({ monster: "lantern", level: 2, exclude: new Set(["mother"]) })).toBe("watermelon");
    expect(question({ monster: "lantern", level: 2, exclude: new Set(["mother", "watermelon"]) })).toBe("mother");
    expect(question({ monster: "ding", level: 3, items: [items[0]] })).toBe("a");
    expect(() => question({ items: [] })).toThrow();
  });

  it("较少掌握的旧题比生题有更高抽中权重", () => {
    const profile = newProfile();
    recordAnswer(profile, "pen", "wrong", 1);
    expect(question({ items: items.slice(0, 2), profile, level: 2, rng: () => 0.4 })).toBe("pen");
  });

  it("低等级没有灯笼怪，高等级灯笼权重最高", () => {
    expect(battleMonsters(1, "boss", () => 0)).toEqual(["ding"]);
    expect(battleMonsters(1, "elite", () => 0)).toEqual(["lion", "kite"]);
    expect(battleMonsters(1, "elite", () => 0.9)).toEqual(["lion", "lantern"]);
    const rng = makeRng(62);
    const draw = (level: number) => Array.from({ length: 300 }, () => battleMonsters(level, "battle", rng)).flat();
    expect(new Set(draw(1))).toEqual(new Set(["blob", "kite"]));
    expect(draw(2)).toContain("lantern");
    const high = draw(4);
    const count = (kind: string) => high.filter((monster) => monster === kind).length;
    expect(count("lantern")).toBeGreaterThan(count("blob"));
    expect(count("lantern")).toBeGreaterThan(count("kite"));
  });
});
