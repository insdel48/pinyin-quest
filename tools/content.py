"""生成题库 src/data/items.json。

拼音先由 pypinyin 生成，再用 OVERRIDE 人工改正（轻声、课本里“一/不”的变调标法等）。
改题库只改这个文件，然后运行：tools/.venv/bin/python tools/content.py
"""
import json
import pathlib
import unicodedata

from pypinyin import Style, pinyin

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 单字：(字, 配图名或空)。尽量选只有一个常用读音的字。
CHARS = """
妈 爸 马:horse 米:rice 木 土 鱼:fish 大 八 爬 怕 拿 他 打 弟 五 雨:rain 七 皮 布 步 路 绿 女 读 哭 苦 虎:tiger
鹿:deer 兔:rabbit 鸡:chicken 西 你 骑 旗 笔:brush 泥 梨:pear 哥 河 喝 鹅:goose 饿 坡 婆 摸 波 破 墨 鸭:duck 牙 娃 瓦
我 窝 屋 舞 鼓:drum 谷 足 粗 书:book 树:tree 衣 日:sun 去 鸟:bird 猫:cat 水:water 山:mountain 羊:sheep 牛:cow 狗:dog
猴 刀 桃:peach 草:grass 包 跑 高 毛 帽:hat 手:hand 口 头 豆 走 楼 白 菜 来 海 爱 飞 杯:cup 黑 美 嘴 腿 贵
球:ball 六 九 秋 叶:leaf 月:moon 鞋:shoe 写 雪:snow 学 耳:ear 儿 二 门:door 本 人 森 心 林 金 云:cloud 春 船:boat
太 阳 方 糖 狼 灯:lamp 风 星:star 冰 鹰 东 红 龙 虫 钟:clock 熊 花:flower 瓜 家 虾 果 火:fire 国 多 坐 桌 天 田
点 电 年 前 钱 象:elephant 江 香 墙 窗 床:bed 光 黄 王 晚 碗:bowl 弯 万 网 文 问 外 快 块 小 笑 跳 条 叫 桥:bridge 表
苗 车:car 伞:umbrella 眼:eye 椅 唱 吃 喜 欢 风 草 鼠 蛇 猪 蛙 蜂 蝶 茶 饭 面 蛋 奶 歌 画 字 课 校 园 夏 冬 早
"""

WORDS = """
太阳 月亮 星星 白云 大山 小河 花朵 小草 大树 熊猫 小猫 小狗 老虎 兔子 公鸡 小鸟 金鱼 大象 狮子 猴子
苹果 西瓜 香蕉 葡萄 米饭 面条 鸡蛋 牛奶 老师 同学 朋友 爸爸 妈妈 爷爷 奶奶 哥哥 姐姐 弟弟 妹妹 书包
铅笔 桌子 椅子 衣服 帽子 鞋子 雨伞 风筝 气球 火车 汽车 飞机 小船 学校 公园 草地 森林 春天 夏天 秋天
冬天 下雨 下雪 早上 晚上 白天 眼睛 耳朵 小手 嘴巴 唱歌 跳舞 画画 读书 写字 跑步 喝水 吃饭 睡觉 红花
"""

IDIOMS = """
鸟语花香 五颜六色 人山人海 春暖花开 山清水秀 万紫千红 自言自语 十全十美 七上八下 千言万语
三心二意 一心一意 大大小小 欢天喜地 五湖四海 东张西望 风和日丽 花红柳绿 千山万水 日积月累
"""

# 词语配图
WORD_PICS = {"太阳": "sun", "月亮": "moon", "星星": "star", "白云": "cloud", "大山": "mountain", "小河": "river",
             "花朵": "flower", "小草": "grass", "大树": "tree", "熊猫": "panda", "小猫": "cat", "小狗": "dog",
             "老虎": "tiger", "兔子": "rabbit", "公鸡": "chicken", "小鸟": "bird", "金鱼": "fish", "大象": "elephant",
             "苹果": "apple", "西瓜": "watermelon", "鸡蛋": "egg", "书包": "bag", "铅笔": "pencil", "帽子": "hat",
             "鞋子": "shoe", "雨伞": "umbrella", "风筝": "kite", "气球": "balloon", "火车": "train", "汽车": "car",
             "飞机": "plane", "小船": "boat", "眼睛": "eye", "耳朵": "ear", "小手": "hand", "下雨": "rain", "下雪": "snow",
             "椅子": "chair", "桌子": "table"}

# 人工改正：课本注音（轻声不标调；“一”“不”按变调标）
OVERRIDE = {
    "月亮": "yuè liang", "星星": "xīng xing", "兔子": "tù zi", "狮子": "shī zi", "猴子": "hóu zi",
    "葡萄": "pú tao", "爸爸": "bà ba", "妈妈": "mā ma", "爷爷": "yé ye", "奶奶": "nǎi nai", "哥哥": "gē ge",
    "姐姐": "jiě jie", "弟弟": "dì di", "妹妹": "mèi mei", "桌子": "zhuō zi", "椅子": "yǐ zi", "衣服": "yī fu",
    "帽子": "mào zi", "鞋子": "xié zi", "风筝": "fēng zheng", "眼睛": "yǎn jing", "耳朵": "ěr duo", "嘴巴": "zuǐ ba",
    "朋友": "péng you", "早上": "zǎo shang", "晚上": "wǎn shang", "睡觉": "shuì jiào", "画画": "huà huà",
    "一心一意": "yì xīn yí yì", "大大小小": "dà dà xiǎo xiǎo", "七上八下": "qī shàng bā xià",
}


def tone_pinyin(text):
    return " ".join(s[0] for s in pinyin(text, style=Style.TONE, heteronym=False))


def build():
    items, seen = [], set()

    def add(kind, hz, pic=None):
        if hz in seen:
            return
        seen.add(hz)
        py = OVERRIDE.get(hz) or tone_pinyin(hz)
        py = unicodedata.normalize("NFC", py)
        syl = py.split()
        assert len(syl) == len(hz), (hz, py)
        item = {"id": f"{kind[0]}-{hz}", "kind": kind, "hanzi": hz, "pinyin": syl}
        if pic:
            item["pic"] = pic
        items.append(item)

    for tok in CHARS.split():
        hz, _, pic = tok.partition(":")
        add("char", hz, pic or None)
    for hz in WORDS.split():
        add("word", hz, WORD_PICS.get(hz))
    for hz in IDIOMS.split():
        add("idiom", hz)

    out = ROOT / "src" / "data" / "items.json"
    out.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    kinds = {k: sum(1 for i in items if i["kind"] == k) for k in ("char", "word", "idiom")}
    print("写入", out, kinds)
    for it in items:
        print(f'{it["kind"]:5} {it["hanzi"]:6} {" ".join(it["pinyin"])}')


if __name__ == "__main__":
    build()
