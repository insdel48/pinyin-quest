import { expect, it } from "vitest";
import { classifyTone } from "./gesture";

const points = (coords: [number, number][], spacing = 70) =>
  coords.map(([x, y], index) => ({ x, y, t: index * spacing }));

it("识别直线、抖动和反方向划线", () => {
  expect(classifyTone(points([[0, 10], [25, 10], [50, 10]]))).toBe(1);
  expect(classifyTone(points([[0, 10], [10, 8], [20, 12], [40, 11]]))).toBe(1);
  expect(classifyTone(points([[40, 10], [20, 10], [0, 10]]))).toBe(1);
  expect(classifyTone(points([[40, 40], [20, 20], [0, 0]]))).toBe(2);
  expect(classifyTone(points([[0, 0], [20, 20], [40, 40]]))).toBe(4);
});

it("在斜划前识别 √ 和 V 形三声", () => {
  expect(classifyTone(points([[0, 35], [10, 52], [50, 0]]))).toBe(3);
  expect(classifyTone(points([[50, 0], [25, 40], [0, 0]]))).toBe(3);
});

it("区分轻点、长按、点数不足、认不出的轨迹和放大输入", () => {
  expect(classifyTone(points([[0, 0], [2, 2]]))).toBe(0);
  expect(classifyTone(points([[0, 0], [2, 2]], 350))).toBeNull();
  expect(classifyTone(points([[0, 0], [24, 0]]))).toBeNull();
  expect(classifyTone(points([[0, 20], [20, 0], [30, 22], [40, 20]]))).toBeNull();
  expect(classifyTone(points([[0, 0], [12, 0], [24, 0]]), 2)).toBe(0);
  expect(classifyTone(points([[0, 0], [24, 0], [48, 0]]), 2)).toBe(1);
  expect(classifyTone([])).toBeNull();
});
