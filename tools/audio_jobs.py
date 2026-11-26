"""根据题库列出要生成的音频：tools/.cache/jobs.json。

三类：
- i:<题目id>  整个字/词/成语
- s:<带调音节>  单个音节（用一个单念也读这个音的字），供拼错时“读出你拼的音”和词语里逐字回放
- p:<卡片>  声母呼读音、韵母、整体认读音节，点卡片和“慢读”提示用
单字类（单字题、音节、卡片）用“跟我读：X。”整句生成再剪出最后一个字，整句读比单念一个字稳得多。
运行：tools/.venv/bin/python tools/audio_jobs.py
"""
import hashlib
import json
import pathlib

from pypinyin import Style, pinyin

ROOT = pathlib.Path(__file__).resolve().parent.parent
items = json.loads((ROOT / "src/data/items.json").read_text(encoding="utf-8"))

# 卡片读音：应听到的音（不看声调）和候选字（按顺序试）。ong、eng 没有合适的字，不做。
PARTS = {
    "b": ("bo", "波玻拨"), "p": ("po", "坡泼"), "m": ("mo", "摸魔"), "f": ("fo", "佛"), "d": ("de", "得德"),
    "t": ("te", "特"), "n": ("ne", "讷呢"), "l": ("le", "勒乐"), "g": ("ge", "哥歌鸽"), "k": ("ke", "科棵颗"),
    "h": ("he", "喝河合"), "j": ("ji", "基鸡机"), "q": ("qi", "欺七期"), "x": ("xi", "希西吸"), "zh": ("zhi", "知织支"),
    "ch": ("chi", "吃痴池"), "sh": ("shi", "诗师狮"), "r": ("ri", "日"), "z": ("zi", "资字自"), "c": ("ci", "雌词刺"),
    "s": ("si", "思丝四"), "y": ("yi", "衣医"), "w": ("wu", "乌屋"),
    "a": ("a", "啊阿"), "o": ("o", "喔哦"), "e": ("e", "鹅饿"), "i": ("yi", "衣医"), "u": ("wu", "乌屋"),
    "ü": ("yu", "迂鱼雨"), "ai": ("ai", "哀爱埃"), "ei": ("ei", "诶欸"), "ui": ("wei", "威微"), "ao": ("ao", "熬奥袄"),
    "ou": ("ou", "欧藕偶"), "iu": ("you", "优油有"), "ie": ("ye", "耶也叶"), "üe": ("yue", "约月"), "er": ("er", "儿耳二"),
    "an": ("an", "安按暗"), "en": ("en", "恩"), "in": ("yin", "因音阴"), "un": ("wen", "温文问"), "ün": ("yun", "晕云运"),
    "ang": ("ang", "昂"), "ing": ("ying", "英鹰樱"),
    "zhi": ("zhi", "知枝支"), "chi": ("chi", "吃池"), "shi": ("shi", "诗狮师"), "ri": ("ri", "日"), "zi": ("zi", "资子字"),
    "ci": ("ci", "词刺雌"), "si": ("si", "丝思四"), "yi": ("yi", "衣医"), "wu": ("wu", "乌屋"), "yu": ("yu", "鱼雨迂"),
    "ye": ("ye", "叶耶也"), "yue": ("yue", "月约"), "yuan": ("yuan", "圆元冤"), "yin": ("yin", "音因阴"),
    "yun": ("yun", "云晕"), "ying": ("ying", "鹰英樱"),
}
TONED = set("āáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ")


def fname(key):
    return hashlib.sha1(key.encode()).hexdigest()[:10] + ".mp3"


def single(ch):
    return pinyin(ch, style=Style.TONE)[0][0]


jobs = []
char_job = {}
for it in items:
    if it["kind"] == "char":
        j = {"key": "i:" + it["id"], "mode": "carrier", "cands": [it["hanzi"]], "expect": it["pinyin"]}
        char_job[(it["hanzi"], it["pinyin"][0])] = j["key"]
    else:
        j = {"key": "i:" + it["id"], "mode": "plain", "cands": [it["hanzi"]], "expect": it["pinyin"]}
    jobs.append(j)

# 音节：优先直接借用单字题的音频；否则找词语里单念也读这个音的字
syl_src = {}
for it in items:
    for ch, syl in zip(it["hanzi"], it["pinyin"]):
        if not (set(syl) & TONED) or syl in syl_src:
            continue
        if (ch, syl) in char_job:
            syl_src[syl] = ("alias", char_job[(ch, syl)])
        elif single(ch) == syl:
            syl_src[syl] = ("char", ch)
for syl, (how, v) in sorted(syl_src.items()):
    if how == "alias":
        jobs.append({"key": "s:" + syl, "alias": v})
    else:
        jobs.append({"key": "s:" + syl, "mode": "carrier", "cands": [v], "expect": [syl]})
for part, (target, cands) in PARTS.items():
    jobs.append({"key": "p:" + part, "mode": "carrier", "cands": list(cands), "expect": [target], "toneless": True})

# 界面语音：不识字的孩子靠听懂每一步要做什么
VOICE_LINES = {
    "map": "选下一站", "chest": "挑一个宝贝", "elite": "打赢大怪啦，挑一个宝贝",
    "spell": "把卡片放进格子里", "tone": "听一听，划出声调", "neutral": "这是轻声，点一下就行",
    "again": "再划大一点", "teach": "看我怎么拼", "shield": "竹盾挡住啦", "streak": "连对啦，送你一个道具",
    "statue": "石像说话啦，点对的拼音", "pairs": "左边点一个，右边点一个", "camp": "歇一歇，还是练一练",
    "win": "闯关成功，声音都救回来啦", "lose": "这一局到这里，星星都带回家了",
    # 新手关
    "t-hello": "墨团偷走了声音，我们一起把它救回来", "t-listen": "点一点喇叭，听一听",
    "t-spell": "跟着手指，把卡片放进格子里", "t-tones": "每个字都有声调，我们来学四种声调",
    "t-tone1": "第一声，平平的，横着划", "t-tone2": "第二声，往上扬，往上划",
    "t-tone3": "第三声，先往下，再往上", "t-tone4": "第四声，往下落，往下划",
    "t-neutral": "有的字读得又轻又短，叫轻声，轻轻点一下", "t-try": "你来划一划", "t-good": "划对啦，真棒",
    "t-back": "猫是第一声，划出来，打败墨团", "t-done": "学会啦，出发去救声音吧", "t-hint": "卡住了，就点这里用道具",
}
for name, text in VOICE_LINES.items():
    # 提示语不考读音，听写和原句大致一样（七成五以上）就行（“啦”常被听成“了”）
    jobs.append({"key": "v:" + name, "mode": "plain", "cands": [text], "expect": None, "similar": text})

for j in jobs:
    j["file"] = fname(j.get("alias") or j["key"])

# 核对用的字→读音表（含多音字），给 tts_batch.py 用（它跑在 mlx-audio 的 Python 里，没有 pypinyin）
from pypinyin.pinyin_dict import pinyin_dict  # noqa: E402
(ROOT / "tools/.cache").mkdir(parents=True, exist_ok=True)
(ROOT / "tools/.cache/pydict.json").write_text(json.dumps(
    {chr(k): v.split(",") for k, v in pinyin_dict.items() if 0x4E00 <= k <= 0x9FFF}, ensure_ascii=False), encoding="utf-8")

out = ROOT / "tools/.cache/jobs.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
missing = sorted({s for it in items for s in it["pinyin"] if set(s) & TONED} - set(syl_src))
print(len(jobs), "条；没有单念字的音节（游戏里用整词读音代替）：", " ".join(missing))
