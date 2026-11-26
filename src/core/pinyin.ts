import { shuffle } from "./rng";
import type { Item, Syllable, Tone } from "./types";

export const INITIALS = "b p m f d t n l g k h j q x zh ch sh r z c s y w".split(" ");
export const FINALS = "a o e i u ü ai ei ui ao ou iu ie üe er an en in un ün ang eng ing ong".split(" ");
export const WHOLE = "zhi chi shi ri zi ci si yi wu yu ye yue yuan yin yun ying".split(" ");

// 按声母分行列出去调音节，避免接受不存在的声韵组合。
export const VALID_SYLLABLES = new Set(`
  a ai an ang ao e ei en eng er o ou
  ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
  pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu
  ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu
  fa fan fang fei fen feng fo fou fu
  da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo
  ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo
  na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nü nüe
  la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo lü lüe
  ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
  ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo
  ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
  ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun
  qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun
  xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun
  zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo
  cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo
  sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo
  ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo
  za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo
  ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo
  sa sai san sang sao se sen seng si song sou su suan sui sun suo
  ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun
  wa wai wan wang wei wen weng wo wu
`.trim().split(/\s+/));

const MARKS: Readonly<Record<string, string>> = {
  a: "aāáǎà", o: "oōóǒò", e: "eēéěè",
  i: "iīíǐì", u: "uūúǔù", ü: "üǖǘǚǜ",
};
const UNMARK = new Map<string, { base: string; tone: Tone }>();
for (const [base, marks] of Object.entries(MARKS)) {
  for (const tone of [1, 2, 3, 4] as const) UNMARK.set(marks[tone], { base, tone });
}

const umlautInitials = new Set(["j", "q", "x", "y"]);
const retroflexAndSibilants = new Set(["zh", "ch", "sh", "r", "z", "c", "s"]);
const nasalFinals = new Set(["an", "en", "in", "un", "ün", "ang", "eng", "ing", "ong"]);
const medials = ["i", "u", "ü"];

export function stripTone(written: string): { base: string; tone: Tone } {
  let base = "";
  let tone: Tone = 0;
  for (const letter of written.normalize("NFC")) {
    const mark = UNMARK.get(letter);
    if (mark) {
      if (tone !== 0) throw new Error("一个音节只能有一个调号");
      tone = mark.tone;
    }
    base += mark?.base ?? letter;
  }
  return { base, tone };
}

export function toneMark(base: string, tone: Tone): string {
  if (tone === 0) return base;
  const vowel = ["a", "o", "e"].find((letter) => base.includes(letter));
  const index = vowel ? base.indexOf(vowel) : Math.max(base.lastIndexOf("i"), base.lastIndexOf("u"), base.lastIndexOf("ü"));
  if (index < 0) return base;
  return base.slice(0, index) + MARKS[base[index]][tone] + base.slice(index + 1);
}

export function analyze(written: string): Syllable {
  const { base, tone } = stripTone(written);
  const marked = toneMark(base, tone);
  if (!VALID_SYLLABLES.has(base) || marked !== written.normalize("NFC")) {
    throw new Error(`不合法的拼音音节：${written}`);
  }
  if (WHOLE.includes(base)) {
    return { written: marked, base, tone, parts: [base], lastToned: marked, kind: "whole",
      difficulty: ["yi", "wu", "yu"].includes(base) ? 1 : 2 };
  }

  const initial = [base.slice(0, 2), base[0]].find((part) => INITIALS.includes(part)) ?? "";
  const spelledFinal = base.slice(initial.length);
  const final = umlautInitials.has(initial) ? spelledFinal.replace(/^u/, "ü") : spelledFinal;
  const parts = initial ? [initial, final] : [final];
  let kind: Syllable["kind"] = initial ? "two" : "single";
  if (initial && !FINALS.includes(final)) {
    const medial = final[0];
    const last = final.slice(1);
    if (!medials.includes(medial) || !FINALS.includes(last)) {
      throw new Error(`不合法的拼音音节：${written}`);
    }
    parts.splice(1, 1, medial, last);
    kind = "three";
  }

  let difficulty: Syllable["difficulty"] = 2;
  if (kind === "three" || (umlautInitials.has(initial) && final.startsWith("ü"))
    || (initial !== "r" && retroflexAndSibilants.has(initial) && nasalFinals.has(final))) {
    difficulty = 3;
  } else if (final.length === 1 && !retroflexAndSibilants.has(initial)) {
    difficulty = 1;
  }

  const last = parts[parts.length - 1];
  return { written: marked, base, tone, parts, lastToned: marked.slice(-last.length), kind, difficulty };
}

export function itemSyllables(item: Item): Syllable[] {
  return item.pinyin.map(analyze);
}

export function itemDifficulty(item: Item): 1 | 2 | 3 {
  return itemSyllables(item).reduce<1 | 2 | 3>((highest, syllable) =>
    syllable.difficulty > highest ? syllable.difficulty : highest, 1);
}

export function compose(parts: string[], tone: Tone): string | null {
  const [initial, ...finals] = parts;
  let base = parts.join("");
  if (!parts.length || parts.some((part) => !part)) return null;
  if (finals.length && umlautInitials.has(initial)) {
    base = initial + finals.join("").replace(/^ü/, "u");
  }
  if (!VALID_SYLLABLES.has(base)) return null;

  const written = toneMark(base, tone);
  const syllable = analyze(written);
  if (base === "yu" && initial === "y" && finals.length === 1 && finals[0] === "ü") return written;
  return parts.length === syllable.parts.length
    && parts.every((part, i) => part === syllable.parts[i]) ? written : null;
}

const initialConfusions = ["b d p q", "m n", "f h", "d t", "n l", "g k h", "j q x", "z zh", "c ch", "s sh", "r l", "y w"];
const finalConfusions = ["an ang", "en eng", "in ing", "un ün", "ui iu", "ie üe", "ei ie", "ao ou", "o uo", "u ü", "i ü", "e o", "ai ei", "ong eng"];

export function similarParts(syl: Syllable, index: number): string[] {
  const part = syl.parts[index];
  if (syl.kind === "whole") return WHOLE.filter((option) => option !== part);
  if (syl.kind === "three" && index === 1) return medials.filter((option) => option !== part);
  const groups = syl.kind !== "single" && index === 0 ? initialConfusions : finalConfusions;
  return [...new Set(groups.flatMap((group) => {
    const options = group.split(" ");
    return options.includes(part) ? options.filter((option) => option !== part) : [];
  }))];
}

export function makeCards(syl: Syllable, rng: () => number, count = 5): string[] {
  const target = Math.max(count, syl.parts.length, syl.kind === "three" ? 6 : 0);
  const cards = new Set(syl.parts);
  const similar = syl.parts.flatMap((_, index) => similarParts(syl, index));
  const fallback = syl.kind === "whole" ? WHOLE : syl.kind === "single" ? FINALS : [...INITIALS, ...FINALS];
  for (const pool of [similar, fallback]) {
    if (cards.size >= target) break;
    for (const option of shuffle(rng, [...new Set(pool)])) {
      cards.add(option);
      if (cards.size >= target) break;
    }
  }
  return shuffle(rng, [...cards]);
}
