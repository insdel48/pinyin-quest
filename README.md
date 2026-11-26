# 拼音闯关

给一年级小朋友玩的拼音闯关游戏（网页版，按安卓平板 16:10 横屏设计）。新国风淡彩 3D 画风：怪物“说出”一个字、词或成语，孩子把声母、韵母卡片拼起来，再用手指划出声调出招。

在线玩：https://insdel48.github.io/pinyin-quest/ ——用平板上的 Chrome 打开，菜单里选“添加到主屏幕”，以后从桌面图标打开就是全屏、断网也能玩。

## 开发

```bash
npm install
npm run dev      # 本机预览
npm test         # 逻辑和题库检查
npm run build
```

## 改题库和读音

1. 改 `tools/content.py` 里的字、词、成语（拼音不对就在 `OVERRIDE` 里改），运行 `tools/.venv/bin/python tools/content.py` 生成 `src/data/items.json`。
2. 运行 `tools/.venv/bin/python tools/audio_jobs.py` 列出要生成的读音。
3. 用本机 Qwen3-TTS 生成并自动核对：`~/.local/share/uv/tools/mlx-audio/bin/python tools/tts_batch.py`。读不准的会列在 `tools/.cache/failed.json`，这些题游戏里不出。

`tools/.venv` 需要 `pypinyin`（`uv venv tools/.venv && uv pip install --python tools/.venv/bin/python pypinyin`）。
