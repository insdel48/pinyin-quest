import { itemDifficulty, itemSyllables } from "./pinyin";
import { weightedPick } from "./rng";
import type { BoonId, Item, ItemStat, MonsterKind, Profile } from "./types";

export type AnswerResult = "correct" | "assisted" | "wrong";

export function newProfile(): Profile {
  return {
    version: 1, stars: 0, level: 1, runsCompleted: 0, recent: [], items: {}, collected: [],
    meta: { extraHeart: false, extraSlot: false, robe: "zhuqing", robesOwned: ["zhuqing"] },
    bestLayer: 0,
  };
}

function nonnegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function loadProfile(json: string | null): Profile {
  if (json === null) return newProfile();
  try {
    const p = JSON.parse(json);
    const isRobe = (id: unknown) => id === "zhuqing" || id === "yuebai";
    if (p?.version === 1 && [1, 2, 3, 4, 5].includes(p.level)
      && [p.stars, p.runsCompleted, p.bestLayer].every(nonnegativeInteger)
      && Array.isArray(p.recent) && p.recent.every((value: unknown) => typeof value === "boolean")
      && Array.isArray(p.collected) && p.collected.every((id: unknown) => typeof id === "string")
      && typeof p.meta?.extraHeart === "boolean" && typeof p.meta.extraSlot === "boolean"
      && isRobe(p.meta.robe) && Array.isArray(p.meta.robesOwned) && p.meta.robesOwned.every(isRobe)
      && p.items && typeof p.items === "object" && !Array.isArray(p.items)
      && Object.values(p.items).every((stat) => {
        const s = stat as Partial<ItemStat> | null;
        return s && [s.seen, s.correct, s.assisted, s.wrong, s.lastRun].every(nonnegativeInteger);
      })) {
      return p;
    }
  } catch {
    return newProfile();
  }
  return newProfile();
}

export function saveProfile(p: Profile): string {
  return JSON.stringify(p);
}

function itemStat(p: Profile, itemId: string): ItemStat | undefined {
  return Object.hasOwn(p.items, itemId) ? p.items[itemId] : undefined;
}

export function recordAnswer(p: Profile, itemId: string, result: AnswerResult, runNo: number): void {
  const stat = itemStat(p, itemId) ?? { seen: 0, correct: 0, assisted: 0, wrong: 0, lastRun: 0 };
  stat.seen++;
  stat[result]++;
  stat.lastRun = runNo;
  Object.defineProperty(p.items, itemId, { value: stat, writable: true, enumerable: true, configurable: true });
  if (result !== "wrong" && !p.collected.includes(itemId)) p.collected.push(itemId);
  p.recent.push(result === "correct");
  if (p.recent.length > 12) p.recent.splice(0, p.recent.length - 12);

  const inFirstRun = p.runsCompleted === 0;
  const upWindow = inFirstRun ? 3 : 8;
  const canLevelUp = p.level < 5 && p.recent.length >= upWindow
    && p.recent.slice(-upWindow).filter(Boolean).length >= (inFirstRun ? 3 : 7);
  const canLevelDown = !inFirstRun && p.level > 1 && p.recent.length >= 6
    && p.recent.slice(-6).filter(Boolean).length <= 2;
  if (canLevelUp || canLevelDown) {
    p.level = (p.level + (canLevelUp ? 1 : -1)) as Profile["level"];
    p.recent.length = 0;
  }
}

export function mastery(stat?: ItemStat): number {
  if (!stat?.seen) return 0;
  return Math.min(1, (stat.correct + 0.5 * stat.assisted) / (stat.seen + 1));
}

export function battleMonsters(
  level: number, nodeType: "battle" | "elite" | "boss", rng: () => number,
): MonsterKind[] {
  if (nodeType === "boss") return ["ding"];
  if (nodeType === "elite") return ["lion", rng() < 0.5 ? "kite" : "lantern"];

  const kinds = level >= 2 ? ["blob", "kite", "lantern"] as const : ["blob", "kite"] as const;
  const weights = { blob: 4, kite: 3, lantern: level >= 4 ? 5 : 2 } as const;
  const draw = () => weightedPick(rng, kinds, (kind) => weights[kind]);
  return [draw(), draw()];
}

interface QuestionArgs {
  items: Item[];
  profile: Profile;
  monster: MonsterKind;
  level: number;
  rng: () => number;
  exclude: Set<string>;
  recycle: { itemId: string; layer: number }[];
  layer: number;
}

export function pickQuestion({ items, profile, monster, level, rng, exclude, recycle, layer }: QuestionArgs): Item {
  const candidates = items.map((item) => ({
    item,
    difficulty: itemDifficulty(item),
    kite: monster === "kite" && item.kind === "char" && itemSyllables(item).some(({ tone, parts, base }) =>
      tone >= 2 || ["ui", "iu", "ie", "üe"].includes(parts[parts.length - 1]) || base === "ye" || base === "yue"),
  }));
  const matches = ({ item, difficulty, kite }: (typeof candidates)[number], relaxed: boolean) => {
    const isChar = item.kind === "char";
    const within = (limit: number) => relaxed || difficulty <= limit;
    switch (monster) {
      case "blob":
        return isChar && within(Math.min(level, 3));
      case "kite":
        return kite && within(Math.min(level, 3));
      case "lion":
        if (level <= 2) return isChar && difficulty >= Math.min(level + 1, 3)
          && within(Math.min(level + 1, 3));
        return (isChar && difficulty === 3) || item.kind === "word";
      case "lantern":
        return (level === 1 ? isChar : item.kind === "word") && within(Math.min(level, 3));
      case "ding":
        return item.kind === (level >= 3 ? "idiom" : "word");
    }
  };

  const strict = candidates.filter((candidate) => matches(candidate, false));
  const strictById = new Map(strict.map(({ item }) => [item.id, item]));
  const recycledIndex = recycle.findIndex((entry) => layer - entry.layer >= 2 && strictById.has(entry.itemId));
  if (recycledIndex >= 0) {
    const [entry] = recycle.splice(recycledIndex, 1);
    return strictById.get(entry.itemId)!;
  }

  const relaxed = candidates.filter((candidate) => matches(candidate, true));
  const available = (pool: typeof candidates) => pool.filter(({ item }) => !exclude.has(item.id));
  const pool = [available(strict), available(relaxed), relaxed, available(candidates), candidates]
    .find((options) => options.length > 0);
  if (!pool) throw new RangeError("题库为空");
  return weightedPick(rng, pool, ({ item, difficulty }) => {
    const stat = itemStat(profile, item.id);
    const weight = stat?.seen ? 1 + 2 * (1 - mastery(stat)) : 1.5;
    return monster === "ding" && item.kind === "idiom" ? weight * (4 - difficulty) : weight;
  }).item;
}

export function starsFor(result: AnswerResult, boons: BoonId[]): number {
  if (result === "wrong") return 0;
  return Number(result === "correct") + Number(boons.includes("gold"));
}

export const SHOP = [
  { id: "robe-yuebai", cost: 30 },
  { id: "extra-heart", cost: 60 },
  { id: "extra-slot", cost: 80 },
] as const;

export function buy(p: Profile, id: (typeof SHOP)[number]["id"]): boolean {
  const offer = SHOP.find((entry) => entry.id === id);
  if (!offer || p.stars < offer.cost) return false;

  if (id === "robe-yuebai") {
    if (p.meta.robesOwned.includes("yuebai")) return false;
    p.meta.robesOwned.push("yuebai");
  } else {
    const key = id === "extra-heart" ? "extraHeart" : "extraSlot";
    if (p.meta[key]) return false;
    p.meta[key] = true;
  }
  p.stars -= offer.cost;
  return true;
}
