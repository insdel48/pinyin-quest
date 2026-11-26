"""用本机 Qwen3-TTS 生成 tools/.cache/jobs.json 里的音频，边生成边用 Qwen3-ASR 听写核对，读错就重来。

- 单字、音节、卡片（mode=carrier）：读“跟我读：X。”，剪出句尾这个字。
- 词语、成语（mode=plain）：整句读。
- 核对：听写结果逐字查读音表（含多音字），带调的要调也对；卡片读音只看声母韵母。最多试 5 次。
- 通过的转成 mp3 放到 public/audio/，写 src/data/audio.json；没通过的列在 tools/.cache/failed.json，游戏里不会出这些题。

用 mlx-audio 自带的 Python 运行（两个模型只加载一次）：
  ~/.local/share/uv/tools/mlx-audio/bin/python tools/tts_batch.py [--only 键前缀] [--force]
需要先跑 tools/audio_jobs.py，并有 tools/.cache/pydict.json（字→读音表，由 pypinyin 导出）。
"""
import json
import pathlib
import re
import subprocess
import sys
import unicodedata

import numpy as np
from mlx_audio.audio_io import write as audio_write
from mlx_audio.stt.utils import load_model as load_stt
from mlx_audio.tts.utils import load_model

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools/.cache"
VOICE = "Serena"
STYLE = "用标准普通话朗读，字正腔圆，吐字清楚，声调饱满，语速适中，像语文老师领读"
TRIES = 5

args = sys.argv[1:]
force = "--force" in args
only = args[args.index("--only") + 1] if "--only" in args else ""
jobs = json.loads((CACHE / "jobs.json").read_text(encoding="utf-8"))
readings = json.loads((CACHE / "pydict.json").read_text(encoding="utf-8"))
mp3_dir = ROOT / "public/audio"
tmp_dir = CACHE / "wav"
mp3_dir.mkdir(parents=True, exist_ok=True)
tmp_dir.mkdir(parents=True, exist_ok=True)

STRIP = str.maketrans("āáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ", "aaaaooooeeeeiiiiuuuuüüüü")


def toneless(s):
    return unicodedata.normalize("NFC", s).translate(STRIP)


def heard_ok(text, expect, tone_free):
    han = re.findall(r"[一-鿿]", text)
    if len(han) != len(expect):
        return False
    for ch, exp in zip(han, expect):
        opts = [unicodedata.normalize("NFC", r) for r in readings.get(ch, [])]
        neutral = not (set(exp) & set("āáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ"))
        if tone_free or neutral:
            if toneless(exp) not in {toneless(o) for o in opts}:
                return False
        elif exp not in opts:
            return False
    return True


def tail_segment(a, sr):
    """最后一段连续发声（前面至少 120ms 停顿），即句尾那个字"""
    hop = int(sr * 0.01)
    fr = np.array([np.sqrt(np.mean(a[i:i + hop] ** 2)) for i in range(0, len(a) - hop, hop)])
    if len(fr) == 0:
        return None
    voiced = fr > max(fr.max() * 0.06, 1e-4)
    idx = np.where(voiced)[0]
    if len(idx) == 0:
        return None
    end = idx[-1]
    i, gap, start = end, 0, end
    while i > 0:
        if voiced[i]:
            start, gap = i, 0
        else:
            gap += 1
            if gap >= 12:
                break
        i -= 1
    if gap < 12:
        return None  # 没找到停顿，剪不准
    return a[max(0, (start - 3) * hop):min(len(a), (end + 5) * hop)]


tts = load_model("mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit")
asr = load_stt("mlx-community/Qwen3-ASR-1.7B-8bit")


def synth(text):
    chunks, sr = [], tts.sample_rate
    for r in tts.generate(text=text, voice=VOICE, instruct=STYLE, lang_code="chinese", verbose=False):
        chunks.append(np.array(r.audio))
        sr = r.sample_rate
    return (np.concatenate(chunks) if chunks else np.zeros(1)), sr


def listen(audio, sr, name):
    p = tmp_dir / name
    audio_write(str(p), audio, sr, format="wav")
    return p, asr.generate(str(p), language="Chinese").text.strip()


def to_mp3(wav, mp3):
    subprocess.run([
        "ffmpeg", "-loglevel", "error", "-y", "-i", str(wav),
        "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,"
               "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,"
               "loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=0.08",
        "-ac", "1", "-ar", "24000", "-b:a", "48k", str(mp3),
    ], check=True)


failed_path = CACHE / "failed.json"
failed = json.loads(failed_path.read_text(encoding="utf-8")) if failed_path.exists() else {}
todo = [j for j in jobs if "alias" not in j and j["key"].startswith(only)
        and (force or not (mp3_dir / j["file"]).exists())]
print(f"要生成 {len(todo)} 条", flush=True)
for n, j in enumerate(todo, 1):
    ok = False
    log = []
    for attempt in range(TRIES):
        cand = j["cands"][min(attempt, len(j["cands"]) - 1)] if j.get("toneless") else j["cands"][0]
        if j["mode"] == "carrier":
            audio, sr = synth(f"跟我读：{cand}。")
            full_wav, full_text = listen(audio, sr, "full.wav")
            last = re.findall(r"[\u4e00-\u9fff]", full_text)[-1:]
            if not last or not heard_ok(last[0], j["expect"], j.get("toneless", False)):
                log.append(f"整句听成 {full_text}")
                continue
            seg = tail_segment(audio, sr)
            if seg is None:
                log.append("剪不出句尾的字")
                continue
            wav, text = listen(seg, sr, "seg.wav")
        else:
            audio, sr = synth(cand)
            if len(audio) / sr > 1.2 * len(cand) + 1.5:
                log.append("读得太长")
                continue
            wav, text = listen(audio, sr, "plain.wav")
        if heard_ok(text, j["expect"], j.get("toneless", False)):
            to_mp3(wav, mp3_dir / j["file"])
            ok = True
            break
        log.append(f"听成 {text}")
    if ok:
        failed.pop(j["key"], None)
    else:
        failed[j["key"]] = log
        (mp3_dir / j["file"]).unlink(missing_ok=True)
    if n % 20 == 0 or n == len(todo) or not ok:
        print(f"{n}/{len(todo)} {j['key']} {'通过' if ok else '没通过：' + '；'.join(log)}", flush=True)

failed_path.write_text(json.dumps(failed, ensure_ascii=False, indent=1), encoding="utf-8")
manifest = {}
for j in jobs:
    if (mp3_dir / j["file"]).exists():
        manifest[j["key"]] = j["file"]
(ROOT / "src/data/audio.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
print("audio.json 条数", len(manifest), "；没通过", len(failed))
