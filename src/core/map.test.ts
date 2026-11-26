import { expect, it } from "vitest";
import { generateMap } from "./map";
import { makeRng } from "./rng";

it("相同种子生成相同路线", () => {
  expect(generateMap(makeRng(88))).toEqual(generateMap(makeRng(88)));
  expect(generateMap(makeRng(88))).not.toEqual(generateMap(makeRng(89)));
});

it("跨种子检查房间、连线、可达性和场景", () => {
  const randomizers = [() => 0, () => 0.99, ...Array.from({ length: 128 }, (_, i) => makeRng(i))];
  for (const rng of randomizers) {
    const { layers, scenes } = generateMap(rng);
    expect(layers.map((nodes) => nodes.length)).toEqual([1, 3, 3, 3, 3, 3, 2, 1]);
    expect(layers[0][0]).toMatchObject({ type: "battle", lane: 1 });
    expect(layers[1].every((node) => node.type !== "elite")).toBe(true);
    expect(layers[6][0]).toMatchObject({ type: "camp", lane: 0 });
    expect(layers[6][1].lane).toBe(2);
    expect(["chest", "event"]).toContain(layers[6][1].type);
    expect(layers[7][0]).toMatchObject({ type: "boss", lane: 1, next: [] });
    expect(layers.flat().filter((node) => node.type === "elite").length).toBeLessThanOrEqual(2);
    expect(layers.flat().some((node) => node.type === "chest")).toBe(true);
    expect(scenes).toEqual([scenes[0], scenes[0], scenes[0], scenes[0], scenes[4], scenes[4], scenes[4], "denghui"]);
    expect(scenes[0]).not.toBe(scenes[4]);

    let reachable = new Set(["L1-1"]);
    for (const [i, nodes] of layers.entries()) {
      if (i >= 1 && i <= 5) {
        expect(nodes.map((node) => node.lane)).toEqual([0, 1, 2]);
        expect(nodes.some((node) => node.type === "battle")).toBe(true);
      }
      expect(reachable).toEqual(new Set(nodes.map((node) => node.id)));
      for (const node of nodes) {
        expect(node.id).toBe(`L${i + 1}-${node.lane}`);
        expect(node.layer).toBe(i + 1);
        const expected = (layers[i + 1] ?? []).filter((next) =>
          i === 0 || i >= 5 || Math.abs(node.lane - next.lane) <= 1);
        expect(node.next).toEqual(expected.map((next) => next.id));
      }
      reachable = new Set(nodes.flatMap((node) => node.next));
    }
  }
});
