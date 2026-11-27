"""把 Gemini 写的冒险故事（tools/story-source.md）整理成游戏数据 src/data/story.json。

句子里用【】标出的是要孩子拼的重点字；重点字的拼音用 pypinyin 按整句上下文取，再用 OVERRIDE 人工改正。
运行：tools/.venv/bin/python tools/story.py
"""
import json
import pathlib
import re
import unicodedata

from pypinyin import Style, pinyin

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / "tools/story-source.md").read_text(encoding="utf-8")

# 人工改正：(句子, 重点字序号) → 拼音
OVERRIDE: dict = {}

CH_RE = re.compile(r"^### 第(.)章：(.+)$")
EN_RE = re.compile(r"^#### (普通敌人 \d|关底大怪|终极关底大怪)：(.+?)·(.+)$")


def field(block, key):
    m = re.search(r"\*\*" + key + r"[^*]*\*\*：(.+)", block)
    return m.group(1).strip() if m else ""


def quote(s):
    m = re.search(r"「(.+?)」", s)
    return m.group(1) if m else s


def sentence(raw):
    """“早晨【太】【阳】升起【来】。” → 文本、重点字位置、重点字拼音"""
    text, targets = "", []
    i = 0
    while i < len(raw):
        if raw[i] == "【":
            j = raw.index("】", i)
            for ch in raw[i + 1:j]:
                targets.append(len(text))
                text += ch
            i = j + 1
        else:
            text += raw[i]
            i += 1
    py = [p[0] for p in pinyin(text, style=Style.TONE, errors=lambda x: list(x))]
    marks = {}
    for t in targets:
        marks[t] = unicodedata.normalize("NFC", OVERRIDE.get((text, t), py[t]))
    return {"text": text, "targets": targets, "pinyin": [marks[t] for t in targets]}


chapters, cur, en = [], None, None
lines = SRC.splitlines()
for n, line in enumerate(lines):
    m = CH_RE.match(line)
    if m:
        cur = {"id": f"c{len(chapters) + 1}", "title": m.group(2).strip(), "scene": "", "intro": "", "outro": "", "enemies": []}
        chapters.append(cur)
        en = None
        continue
    if cur is None:
        continue
    if line.startswith("- **场景画面描述"):
        cur["scene"] = line.split("：", 1)[1].strip()
    elif line.startswith("- **章节开头旁白"):
        cur["intro"] = quote(line)
    elif line.startswith("- **章节结尾旁白"):
        cur["outro"] = quote(line)
    m = EN_RE.match(line)
    if m:
        block = "\n".join(lines[n:n + 14])
        en = {"id": f"{cur['id']}e{len(cur['enemies']) + 1}", "title": m.group(2).strip(), "name": m.group(3).strip(),
              "boss": "大怪" in m.group(1), "look": field(block, "长相描述"),
              "says": quote(field(block, "性格与口头禅")), "attack": field(block, "攻击方式"),
              "defeat": field(block, "被打败时的样子"), "sentences": []}
        cur["enemies"].append(en)
        continue
    ms = re.match(r"^\s+\d\.\s+(.+)$", line)
    if ms and en is not None and "【" in ms.group(1):
        en["sentences"].append(sentence(ms.group(1).strip()))

ending = SRC.split("## 六、大结局", 1)[1].split("## 七", 1)[0]
ending = "\n".join(p.strip() for p in ending.splitlines()[1:] if p.strip() and p.strip() != "---")
data = {"hero": "小乐", "chapters": chapters, "ending": ending}
(ROOT / "src/data/story.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
for c in chapters:
    print(c["id"], c["title"], len(c["enemies"]), "个敌人")
    for e in c["enemies"]:
        for s in e["sentences"]:
            print("  ", e["name"], s["text"], " ".join(f"{s['text'][t]}{p}" for t, p in zip(s["targets"], s["pinyin"])))
