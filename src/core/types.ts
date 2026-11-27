// 游戏核心的共享类型。界面层和逻辑层都只通过这些类型交流。

/** 声调：0 = 轻声 */
export type Tone = 0 | 1 | 2 | 3 | 4;

export type ItemKind = "char" | "word" | "idiom";

/** 题库里的一条：一个字、一个词或一个成语 */
export interface Item {
  id: string;
  kind: ItemKind;
  hanzi: string;
  /** 课本注音写法，每个字一个带调音节，如 ["tài", "yáng"]；轻声不带调号，如 ["yuè", "liang"] */
  pinyin: string[];
  /** 配图名，没有图就不写 */
  pic?: string;
}

/** 一个音节拆成卡片后的样子 */
export interface Syllable {
  /** 课本写法（带调），如 "jú"、"xiàng"、"liang" */
  written: string;
  /** 去掉调号的课本写法，如 "ju" */
  base: string;
  tone: Tone;
  /** 按课本拼读法拆成的卡片，按顺序。ü 一律写成 "ü"（j/q/x/y 后面也是），如 jú → ["j", "ü"]，xiàng → ["x", "i", "ang"]，整体认读 → ["zhi"] */
  parts: string[];
  /** 最后一张卡拼好、标上声调后显示的样子（j/q/x/y 后的 ü 去点），如 jú → "ú"，xiàng → "àng"，shuǐ → "uǐ"，轻声不加调号 */
  lastToned: string;
  /** single = 没有声母的单独韵母（ā、ài、ér），whole = 整体认读，two = 两拼，three = 三拼 */
  kind: "single" | "whole" | "two" | "three";
  /** 拼读难度 1–3 */
  difficulty: 1 | 2 | 3;
}

export type MonsterKind = "blob" | "lantern" | "kite" | "lion" | "ding";
export type SceneId = "c1" | "c2" | "c3" | "c4" | "c5"; // 冒险故事的 5 章场景
export type NodeType = "battle" | "elite" | "chest" | "event" | "camp" | "boss";
export type HintId = "slow" | "sweep" | "ghost" | "trace";
export type BoonId = "shield" | "heal" | "calm" | "wick" | "bag" | "gold";
/** 小主角的衣服：tee = 白 T 恤牛仔裤（默认），jacket = 红色小褂 */
export type OutfitId = "tee" | "jacket";

export interface MapNode {
  id: string;
  layer: number; // 1..8
  lane: number; // 0..2
  type: NodeType;
  next: string[]; // 下一层可去的节点 id
}

export interface RunMap {
  layers: MapNode[][]; // layers[0] 是第 1 层
  scenes: SceneId[]; // 每层用哪个场景，长度 8
}

/** 每个题目的掌握记录 */
export interface ItemStat {
  seen: number;
  correct: number; // 不用道具、一次答对的次数
  assisted: number; // 用了道具才答对的次数
  wrong: number;
  lastRun: number;
}

/** 存在平板本地的长期档案 */
export interface Profile {
  version: 1;
  stars: number;
  level: 1 | 2 | 3 | 4 | 5;
  runsCompleted: number;
  recent: boolean[]; // 最近的作答结果（true = 自己一次答对），最多保留 12 条
  items: Record<string, ItemStat>;
  collected: string[]; // 图鉴里点亮的题目 id
  meta: { extraHeart: boolean; extraSlot: boolean; outfit: OutfitId; outfitsOwned: OutfitId[] };
  bestLayer: number;
}
