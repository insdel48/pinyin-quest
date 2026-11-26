import { compose, FINALS, INITIALS, itemSyllables, similarParts, toneMark } from "./pinyin";
import { pick, shuffle } from "./rng";
import type { Item, Syllable } from "./types";

export function statueEvent(items: Item[], rng: () => number): { target: Syllable; options: string[] } {
  const target = pick(rng, items.filter((item) => item.kind === "char").flatMap(itemSyllables));
  const distractors = new Set<string>();
  for (const [index] of target.parts.entries()) {
    for (const replacement of similarParts(target, index)) {
      const parts = [...target.parts];
      parts.splice(index, 1, ...(replacement === "uo" ? ["u", "o"] : [replacement]));
      const option = compose(parts, target.tone);
      if (option && option !== target.written) distractors.add(option);
    }
  }
  const wrong = shuffle(rng, [...distractors]).slice(0, 2);
  if (wrong.length < 2) {
    const otherTones = ([1, 2, 3, 4] as const).filter((tone) => tone !== target.tone);
    wrong.push(...shuffle(rng, otherTones).slice(0, 2 - wrong.length).map((tone) => toneMark(target.base, tone)));
  }
  return { target, options: shuffle(rng, [target.written, ...wrong]) };
}

export function pairsEvent(rng: () => number, level: number):
  { initials: string[]; finals: string[]; pairs: [string, string][] } {
  const finals = level <= 2 ? ["a", "o", "e", "i", "u"] : FINALS;
  let available: [string, string][] = [];
  for (const initial of INITIALS) {
    for (const final of finals) {
      if (compose([initial, final], 0)) available.push([initial, final]);
    }
  }
  const pairs: [string, string][] = [];
  for (let i = 0; i < 3; i++) {
    const [initial, final] = pick(rng, available);
    pairs.push([initial, final]);
    available = available.filter(([otherInitial, otherFinal]) => otherInitial !== initial && otherFinal !== final);
  }
  return {
    initials: shuffle(rng, pairs.map(([initial]) => initial)),
    finals: shuffle(rng, pairs.map(([, final]) => final)),
    pairs,
  };
}
