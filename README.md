# 拼音闯关

给一年级小朋友玩的拼音闯关游戏（网页版，按安卓平板 16:10 横屏设计）。粗黑线美式卡通 3D 画风：冒险故事《响亮岛大冒险》里，孩子把句子里的重点字用声母、韵母卡片拼起来、划出声调，用手表“声波重拳”打败捣蛋怪；另有随机路线的闯关模式。模型用 Blender 脚本生成（tools/blender/），背景由 Codex 绘制。

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
