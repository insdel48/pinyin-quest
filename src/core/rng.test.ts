import { describe, expect, it } from "vitest";
import { makeRng, pick, shuffle, weightedPick } from "./rng";

describe("种子随机数", () => {
  it("复现 mulberry32 序列且始终落在 [0, 1)", () => {
    const rng = makeRng(1);
    expect([rng(), rng(), rng()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    const first = makeRng(-1);
    const second = makeRng(0xffffffff);
    for (let i = 0; i < 1000; i++) {
      const value = first();
      expect(value).toBe(second());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("按区间抽取，洗牌保留原数组，零权重永不抽中", () => {
    const values = ["a", "b", "c"] as const;
    expect(pick(() => 0.99, values)).toBe("c");
    expect(shuffle(() => 0, values)).toEqual(["b", "c", "a"]);
    expect(values).toEqual(["a", "b", "c"]);
    const weight = (value: string) => ({ a: 0, b: 1, c: 3 })[value] ?? 0;
    expect(weightedPick(() => 0, values, weight)).toBe("b");
    expect(weightedPick(() => 0.25, values, weight)).toBe("c");
    expect(() => pick(() => 0, [])).toThrow();
    expect(() => weightedPick(() => 0, values, () => 0)).toThrow();
  });
});
