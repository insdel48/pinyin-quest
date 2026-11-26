# 任务：拼音闯关游戏的核心逻辑（纯 TypeScript，无界面）

项目是给中国一年级孩子玩的拼音 roguelike 网页游戏（Vite + TypeScript + Vitest）。界面和 3D 由别人做，你只写 `src/core/` 下的纯逻辑模块和测试，不碰 DOM、不碰 three.js。

共享类型已经定好，在 `src/core/types.ts`，**不要改它**（确实需要加字段就在你的模块里另外定义类型，并在交回说明里写明）。

## 规矩
- 只在 `src/core/` 里新建/修改文件。不要改 package.json、配置文件、types.ts。不要 git commit / push。
- 全部函数是纯函数或只改传入对象；随机数一律用 `rng.ts` 的种子随机数，传 `rng: () => number` 参数，不用 Math.random。
- 每个模块配 `*.test.ts`（Vitest），`npx vitest run` 和 `npx tsc --noEmit` 都要通过。
- 注释用中文，简短。
- 拼音字母一律用普通的 `a` 和 `g`（字体负责显示成单层），ü 用 `ü`（U+00FC），带调字母用预组合字符（ā á ǎ à ō ó ǒ ò ē é ě è ī í ǐ ì ū ú ǔ ù ǖ ǘ ǚ ǜ）。

## 1. `rng.ts`
- `export function makeRng(seed: number): () => number` —— mulberry32，返回 [0,1)。
- `pick<T>(rng, arr)`、`shuffle<T>(rng, arr)`（返回新数组）、`weightedPick<T>(rng, items: T[], weight: (t: T) => number)`。

## 2. `pinyin.ts` —— 按统编版小学课本的拼读法
常量：
- `INITIALS`（23 个声母）：b p m f d t n l g k h j q x zh ch sh r z c s y w
- `FINALS`（24 个韵母）：a o e i u ü ai ei ui ao ou iu ie üe er an en in un ün ang eng ing ong
- `WHOLE`（16 个整体认读音节）：zhi chi shi ri zi ci si yi wu yu ye yue yuan yin yun ying

函数：
- `stripTone(written: string): { base: string; tone: Tone }` —— 输入课本写法（如 "jú"、"lǜ"、"liang"），无调号即轻声 0。
- `toneMark(base: string, tone: Tone): string` —— 按标调规则给去调写法加调号：有 a 标 a；没有 a 有 o 或 e 标在 o/e；iu、ui 标在后一个字母；否则标在 i/u/ü 上；i 标调时去点（用 ī í ǐ ì）。tone 0 原样返回。
- `analyze(written: string): Syllable` —— 拆卡规则：
  - 整体认读（去调后在 WHOLE 里）→ parts = [整个音节]，kind "whole"。
  - 没有声母：parts = [韵母]，kind "single"（如 ā、ài、ér、ān、ōu）。
  - j、q、x、y 后面写成 u 的，底层是 ü：jú → parts ["j","ü"]；què → ["q","üe"]；xūn → ["x","ün"]；juān → ["j","ü","an"]（三拼）。
  - y/w 开头且不是整体认读：ya → ["y","a"]，yáng → ["y","ang"]，yǒu → ["y","ou"]，yǒng → ["y","ong"]，yān → ["y","an"]，wǒ → ["w","o"]，wài → ["w","ai"]，wèi → ["w","ei"]，wǎn → ["w","an"]，wēn → ["w","en"]，wáng → ["w","ang"]，wēng → ["w","eng"]。
  - 声母 + 剩余部分：剩余部分在 FINALS 里 → 两拼，kind "two"（如 liú → ["l","iu"]，guì → ["g","ui"]，lún → ["l","un"]，nǚ → ["n","ü"]，lüè → ["l","üe"]）。
  - 否则剩余部分 = 介母 i/u/ü + FINALS 里的韵母 → 三拼，kind "three"（ia→i+a，iao→i+ao，ian→i+an，iang→i+ang，iong→i+ong，ua→u+a，uo→u+o，uai→u+ai，uan→u+an，uang→u+ang，üan→ü+an）。
  - `lastToned`：最后一张卡标上调之后的样子；j/q/x/y 后的 ü 去点（jú → "ú"，xué → "ué"，jūn → "ūn"），其余 ü 保留（nǚ → "ǚ"，lüè → "üè"）。调号位置按整个音节的标调规则：如 shuǐ 的最后一张卡 "ui" → "uǐ"；xiàng 最后一张 "ang" → "àng"；guó（g+u+o）→ "ó"；huā → "ā"；whole 音节 lastToned 就是整个 written。轻声不加调号。
  - `difficulty`：
    - 1：kind single/two 且韵母是 a o e i u ü 之一，且声母不在 zh ch sh r z c s 里；以及 yi wu yu 三个整体认读。
    - 3：kind three；或者 j/q/x + ü 系列（底层有 ü 但写成 u 的）；或者声母是 zh ch sh z c s 且韵母是鼻韵母（an en in un ün ang eng ing ong）。
    - 其余为 2（包括其余整体认读）。
  - 不合法的输入抛错。
- `itemSyllables(item: Item): Syllable[]`、`itemDifficulty(item: Item): 1|2|3`（取各音节最大值）。
- `VALID_SYLLABLES: Set<string>` —— 普通话全部合法音节的去调写法（约 410 个，按标准音节表写全）。
- `compose(parts: string[], tone: Tone): string | null` —— 孩子把这些卡片拼在一起、加上这个声调后的课本写法；拼不成合法音节返回 null。要处理：j/q/x/y + ü 写成 u；y/w 的写法（"y"+"a" → "ya"，"y"+"ü" 视为 "yu" 整体认读也可接受）；整体认读单卡；`compose(["b","ao"],1)` → "bāo"；`compose(["x","i","ang"],4)` → "xiàng"；`compose(["j","ü"],2)` → "jú"；`compose(["b","ang","i"],1)` → null。
- `makeCards(syl: Syllable, rng, count = 5): string[]` —— 出给孩子挑的卡片：包含全部正确卡片，其余用易混的干扰卡补足到 count（三拼至少 6 张），打乱顺序，不重复。易混组：声母 b/d/p/q、m/n、f/h、d/t、n/l、g/k/h、j/q/x、z/zh、c/ch、s/sh、r/l、y/w；韵母 an/ang、en/eng、in/ing、un/ün、ui/iu、ie/üe、ei/ie、ao/ou、o/uo、u/ü、i/ü、e/o、ai/ei、ong/eng；介母 i/u/ü 互为干扰。易混的不够时从同类（声母或韵母）里随机补。整体认读题的干扰卡用别的整体认读音节。

测试至少覆盖：上面列出的每个例子；标调规则（hǎo、duì、liù、guǒ、xué、nǚ、lüè、jú、qū、yuè、bǐ 的 i 去点）；compose 与 analyze 互逆（对一批音节 compose(analyze(x).parts, tone) === x）；makeCards 包含全部正确卡且不重复。

## 3. `gesture.ts` —— 手指划声调识别
`classifyTone(points: { x: number; y: number; t: number }[], scale = 1): Tone | null`
- 坐标是屏幕坐标，y 向下；scale 是“1 个逻辑像素对应多少输入像素”，阈值都乘 scale。
- 总路径长度 < 18 且时长 < 350ms → 0（轻点 = 轻声）。点数少于 3 或路径太短但时间长 → null。
- 只看竖直方向的形状，不管从左往右还是从右往左划：
  - 设 span = max(横向跨度, 竖向跨度)，起点 y0，终点 y1，最低点（y 最大）yMax，最高点 yMin。
  - 先判三声：yMax - y0 > 0.25·span 且 yMax - y1 > 0.25·span（先下后上，形如 V 或 √）→ 3。
  - 否则 dy = y1 - y0：dy < -0.3·span → 2（往上挑）；dy > 0.3·span → 4（往下劈）；|dy| ≤ 0.3·span 且竖向跨度 ≤ 0.35·横向跨度 → 1（横划）。
  - 其余 → null（认不出，界面会让孩子再划一次）。
- 测试：直线、带抖动的线、从右往左的线、√ 形、V 形、轻点、乱划，每种都要有。

## 4. `progress.ts` —— 档案、难度和出题
- `newProfile(): Profile`（level 1，stars 0，meta 全 false，robe "zhuqing"，robesOwned ["zhuqing"]）。
- `loadProfile(json: string | null): Profile` —— 解析失败或版本不对返回新档案；`saveProfile(p): string`。
- `recordAnswer(p: Profile, itemId: string, result: "correct" | "assisted" | "wrong", runNo: number): void` —— 更新 ItemStat、recent（只有 "correct" 记 true，最多 12 条）、level：
  - 首局（runsCompleted === 0）：recent 末尾连续 3 个 true 就升 1 级（快速定位），升级后清空 recent。
  - 平时：recent 最近 8 条里 ≥ 7 个 true 且 level < 5 → 升 1 级并清空 recent；最近 6 条里 ≤ 2 个 true 且 level > 1 → 降 1 级并清空 recent。
  - 答对（correct 或 assisted）时把 itemId 加进 collected（不重复）。
- `mastery(stat?: ItemStat): number` —— 0..1，没见过返回 0；(correct + 0.5·assisted) / (seen + 1) 之类的平滑值，自己定，写测试。
- `battleMonsters(level, nodeType: "battle" | "elite" | "boss", rng): MonsterKind[]` ——
  - battle：2 只，从 blob、kite、lantern 里按权重选：level 1 只有 blob 和 kite；level ≥ 2 加入 lantern（level ≥ 4 时 lantern 权重最高）。
  - elite：["lion", 再从 kite/lantern 里选 1 只]。
  - boss：["ding"]。
- `pickQuestion(args: { items: Item[]; profile: Profile; monster: MonsterKind; level: number; rng; exclude: Set<string>; recycle: { itemId: string; layer: number }[]; layer: number }): Item` ——
  - 先看 recycle：有 `layer - r.layer >= 2` 且符合这只怪物题型的，优先出它（并从 recycle 里移除——直接改传入数组）。
  - 题型候选池（d = itemDifficulty，L = level）：
    - blob：字，d ≤ min(L, 2)；L ≥ 3 时 d ≤ 3。
    - kite：字，且（声调是 2/3/4 或韵母含 ui/iu/ie/üe），d ≤ min(L, 3)。
    - lion：L ≤ 2 时出 d = min(L + 1, 3) 的字；L ≥ 3 时出 d = 3 的字或 d ≤ 3 的词。
    - lantern：词，d ≤ min(L, 3)；L = 1 时退回 blob 的池子。
    - ding：L ≥ 3 出成语（按难度从低到高加权）；L ≤ 2 出词。
  - 池子去掉 exclude；空了就放宽 d 的上限，再空就忽略 exclude。
  - 权重：没见过 1.5；见过的 1 + 2·(1 - mastery)。
- `starsFor(result, boons: BoonId[]): number` —— correct 1、assisted 0、wrong 0；有 "gold" 再 +1（wrong 不加）。
- `SHOP`：`[{ id: "robe-yuebai", cost: 30 }, { id: "extra-heart", cost: 60 }, { id: "extra-slot", cost: 80 }]` 和 `buy(p, id): boolean`（星星不够或已买返回 false）。

## 5. `map.ts` —— 一局的路线
`generateMap(rng): RunMap`
- 8 层。第 1 层：1 个 battle（lane 1）。第 2–6 层：每层 3 个节点（lane 0,1,2），类型按权重 battle 50 / elite 20 / chest 15 / event 15 抽，elite 从第 3 层起才有；每层至少 1 个 battle；整张图 elite 最多 2 个、chest 至少 1 个。第 7 层：2 个节点，lane 0 是 camp，lane 2 是 chest 或 event。第 8 层：1 个 boss（lane 1）。
- 连线：第 1 层连第 2 层全部；中间层 lane i 连下一层 lane i-1、i、i+1 中存在的节点；第 6 层连第 7 层全部；第 7 层连 boss。保证每个节点都能从起点走到。
- scenes：第 1–4 层用场景 A，第 5–7 层用场景 B，第 8 层 "denghui"；A、B 从 shanye/zhulin/shuixiang/hetang/xueshan 里随机抽两个不同的。
- id 形如 "L3-1"。

## 6. `run.ts` —— 一局的状态
```ts
export interface RunState {
  seed: number; runNo: number;
  map: RunMap; layer: number; nodeId: string | null;
  hearts: number; maxHearts: number;
  hints: HintId[]; hintCap: number;
  boons: BoonId[];
  stars: number; streak: number;
  usedItems: string[];
  recycle: { itemId: string; layer: number }[];
  errors: string[]; // 本局答错过的题目 id（给首领弱点用），不重复
  shieldUsed: boolean; // 本场战斗竹盾是否已用
  over: null | "won" | "lost";
}
```
- `newRun(profile, seed): RunState` —— maxHearts = 4 + (meta.extraHeart ? 1 : 0)；hearts = maxHearts；hintCap = 3 + (meta.extraSlot ? 1 : 0)；开局送 1 个随机提示道具；runNo = profile.runsCompleted + 1。
- `startBattle(run)`：shieldUsed = false。
- `monsterDistance(run): number` —— 怪物离主角几步：2，有 "calm" 为 3。界面每题开始时用它。
- `onAnswer(run, itemId, result, rng): { heartLost: boolean; hintGained: HintId | null; stars: number }` ——
  - correct：streak + 1；streak 达到阈值（3，有 "wick" 为 2）时，若 hints 没满就加一个随机提示道具并把 streak 归零。stars 按 starsFor 加。
  - assisted：streak 归零；题目加入 recycle（layer = run.layer）。
  - wrong（界面在怪物走到主角面前时才调用，一题最多调用一次）：streak 归零；扣 1 心——如果有 "shield" 且本场没用过就改为挡住（shieldUsed = true，不扣）；题目加入 recycle 和 errors。hearts 到 0 → over = "lost"。
  - 都把 itemId 加入 usedItems。
- `useHint(run, hint): boolean` —— 有就移除一个并返回 true。
- `endBattle(run, kind: "battle" | "elite" | "boss")`：stars 加 2 / 4 / 10；有 "heal" 回 1 心（不超过上限）；boss 打赢 over = "won"。
- `chestChoices(run, rng): ({ type: "boon"; id: BoonId } | { type: "hint"; id: HintId })[]` —— 3 个选项，优先没拿过的强化；强化都拿过了就补提示道具。
- `takeChoice(run, choice)` —— boon 加入 boons（"bag" 立刻让 hintCap + 1）；hint 加入 hints（满了就不加，返回 false）。
- `campHeal(run)` —— 回 1 心。
- `moveTo(run, nodeId)` —— 校验 nodeId 在当前节点的 next 里（或开局在第 1 层），更新 layer/nodeId。
- `bossQuestions(run, items, profile, rng): { item: Item; weak: boolean }[]` —— 2 道首领题（pickQuestion monster "ding"），中间穿插最多 2 道弱点题（从 errors 里挑，weak = true），顺序：首领题、弱点、首领题、弱点。
- `finishRun(profile, run)` —— 把 run.stars 加进 profile.stars，runsCompleted + 1，bestLayer 取较大值。

## 7. `events.ts` —— 问号房间
- `statueEvent(items, rng): { target: Syllable; options: string[] }` —— 从字里挑一个音节，options 是 3 个完整的带调写法（1 对 2 错，错的用易混替换生成且必须是合法音节），打乱。
- `pairsEvent(rng, level): { initials: string[]; finals: string[]; pairs: [string, string][] }` —— 3 对能拼成合法音节的声母+韵母（level ≤ 2 只用简单韵母 a o e i u），initials 和 finals 各自打乱。

## 交回
跑通 `npx tsc --noEmit` 和 `npx vitest run`，用几句话说明每个文件做了什么、有没有偏离上面的规定、哪里你拿不准。
