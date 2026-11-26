import { generateMap } from "./map";
import { pickQuestion, starsFor } from "./progress";
import type { AnswerResult } from "./progress";
import { makeRng, pick, shuffle } from "./rng";
import type { BoonId, HintId, Item, Profile, RunMap } from "./types";

export interface RunState {
  seed: number;
  runNo: number;
  map: RunMap;
  layer: number;
  nodeId: string | null;
  hearts: number;
  maxHearts: number;
  hints: HintId[];
  hintCap: number;
  boons: BoonId[];
  stars: number;
  streak: number;
  usedItems: string[];
  recycle: { itemId: string; layer: number }[];
  errors: string[];
  shieldUsed: boolean;
  over: null | "won" | "lost";
}

type ChestChoice = { type: "boon"; id: BoonId } | { type: "hint"; id: HintId };

const HINTS: HintId[] = ["slow", "sweep", "ghost", "trace"];
const BOONS: BoonId[] = ["shield", "heal", "calm", "wick", "bag", "gold"];

export function newRun(profile: Profile, seed: number): RunState {
  const rng = makeRng(seed);
  const map = generateMap(rng);
  const maxHearts = 4 + Number(profile.meta.extraHeart);
  return {
    seed, runNo: profile.runsCompleted + 1, map, layer: 0, nodeId: null,
    hearts: maxHearts, maxHearts, hints: [pick(rng, HINTS)], hintCap: 3 + Number(profile.meta.extraSlot),
    boons: [], stars: 0, streak: 0, usedItems: [], recycle: [], errors: [], shieldUsed: false, over: null,
  };
}

export function startBattle(run: RunState): void {
  run.shieldUsed = false;
}

export function monsterDistance(run: RunState): number {
  return run.boons.includes("calm") ? 3 : 2;
}

export function onAnswer(
  run: RunState, itemId: string, result: AnswerResult, rng: () => number,
): { heartLost: boolean; hintGained: HintId | null; stars: number } {
  let heartLost = false;
  let hintGained: HintId | null = null;
  if (result === "correct") {
    run.streak++;
    const threshold = run.boons.includes("wick") ? 2 : 3;
    if (run.streak >= threshold && run.hints.length < run.hintCap) {
      hintGained = pick(rng, HINTS);
      run.hints.push(hintGained);
      run.streak = 0;
    }
  } else {
    run.streak = 0;
    run.recycle.push({ itemId, layer: run.layer });
  }
  if (result === "wrong") {
    if (!run.errors.includes(itemId)) run.errors.push(itemId);
    if (run.boons.includes("shield") && !run.shieldUsed) {
      run.shieldUsed = true;
    } else if (run.hearts > 0) {
      run.hearts--;
      heartLost = true;
      if (run.hearts === 0) run.over = "lost";
    }
  }
  run.usedItems.push(itemId);
  const stars = starsFor(result, run.boons);
  run.stars += stars;
  return { heartLost, hintGained, stars };
}

export function useHint(run: RunState, hint: HintId): boolean {
  const index = run.hints.indexOf(hint);
  if (index < 0) return false;
  run.hints.splice(index, 1);
  return true;
}

export function endBattle(run: RunState, kind: "battle" | "elite" | "boss"): void {
  if (run.over !== null) return;
  run.stars += { battle: 2, elite: 4, boss: 10 }[kind];
  if (run.boons.includes("heal")) campHeal(run);
  if (kind === "boss") run.over = "won";
}

export function chestChoices(run: RunState, rng: () => number): ChestChoice[] {
  const boons = shuffle(rng, BOONS.filter((boon) => !run.boons.includes(boon))).slice(0, 3);
  const hints = boons.length < 3 ? shuffle(rng, HINTS).slice(0, 3 - boons.length) : [];
  return [
    ...boons.map((id): ChestChoice => ({ type: "boon", id })),
    ...hints.map((id): ChestChoice => ({ type: "hint", id })),
  ];
}

export function takeChoice(run: RunState, choice: ChestChoice): boolean {
  if (choice.type === "hint") {
    if (run.hints.length >= run.hintCap) return false;
    run.hints.push(choice.id);
  } else {
    if (run.boons.includes(choice.id)) return false;
    run.boons.push(choice.id);
    if (choice.id === "bag") run.hintCap++;
  }
  return true;
}

export function campHeal(run: RunState): void {
  run.hearts = Math.min(run.hearts + 1, run.maxHearts);
}

export function moveTo(run: RunState, nodeId: string): boolean {
  const nextLayer = run.map.layers[run.layer];
  const target = nextLayer?.find((node) => node.id === nodeId);
  if (!target) return false;
  if (run.nodeId !== null) {
    const current = run.map.layers[run.layer - 1]?.find((node) => node.id === run.nodeId);
    if (!current?.next.includes(nodeId)) return false;
  }
  run.layer = target.layer;
  run.nodeId = target.id;
  return true;
}

export function bossQuestions(
  run: RunState, items: Item[], profile: Profile, rng: () => number,
): { item: Item; weak: boolean }[] {
  const exclude = new Set(run.usedItems);
  const main: Item[] = [];
  for (let i = 0; i < 2; i++) {
    const remaining = items.filter((item) => !main.some((chosen) => chosen.id === item.id));
    main.push(pickQuestion({
      items: remaining.length ? remaining : items,
      profile, monster: "ding", level: profile.level, rng, exclude,
      recycle: run.recycle, layer: run.layer,
    }));
  }

  const available = new Map(items.map((item) => [item.id, item]));
  for (const item of main) available.delete(item.id);
  const weak = shuffle(rng, [...new Set(run.errors)].flatMap((id) => {
    const item = available.get(id);
    return item ? [item] : [];
  })).slice(0, 2);
  return main.flatMap((item, index) => weak[index]
    ? [{ item, weak: false }, { item: weak[index], weak: true }]
    : [{ item, weak: false }]);
}

export function finishRun(profile: Profile, run: RunState): void {
  profile.stars += run.stars;
  profile.runsCompleted++;
  profile.bestLayer = Math.max(profile.bestLayer, run.layer);
}
