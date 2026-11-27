import { shuffle, weightedPick } from "./rng";
import type { MapNode, NodeType, RunMap, SceneId } from "./types";

export function generateMap(rng: () => number): RunMap {
  const node = (layer: number, lane: number, type: NodeType): MapNode =>
    ({ id: `L${layer}-${lane}`, layer, lane, type, next: [] });
  const layers: MapNode[][] = [[node(1, 1, "battle")]];
  const weights = { battle: 50, elite: 20, chest: 15, event: 15 } as const;
  const roomTypes = ["battle", "elite", "chest", "event"] as const;
  let elites = 0;
  let hasChest = false;

  for (let layer = 2; layer <= 6; layer++) {
    const rooms = [0, 1, 2].map((lane) => {
      const type = weightedPick(rng, roomTypes, (kind) =>
        kind === "elite" && (layer === 2 || elites >= 2) ? 0 : weights[kind]);
      if (type === "elite") elites++;
      return node(layer, lane, type);
    });
    if (rooms.every((room) => room.type !== "battle")) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === "elite") elites--;
      room.type = "battle";
    }
    hasChest ||= rooms.some((room) => room.type === "chest");
    layers.push(rooms);
  }

  layers.push([node(7, 0, "camp"), node(7, 2, !hasChest || rng() < 0.5 ? "chest" : "event")]);
  layers.push([node(8, 1, "boss")]);

  for (const [index, rooms] of layers.slice(0, -1).entries()) {
    const next = layers[index + 1];
    for (const room of rooms) {
      room.next = next.filter((target) => room.layer === 1 || room.layer >= 6
        || Math.abs(target.lane - room.lane) <= 1).map((target) => target.id);
    }
  }

  const scenes: SceneId[] = ["c1", "c2", "c3", "c4"];
  const [a, b] = shuffle(rng, scenes);
  return { layers, scenes: [a, a, a, a, b, b, b, "c5"] };
}
