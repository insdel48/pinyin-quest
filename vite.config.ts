import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

// 正式版在 /pinyin-quest/；样板预览版（next 分支）用 BASE=/pinyin-quest/next/ 打包到它下面
declare const process: { env: Record<string, string | undefined> }; // 只在打包时由 Node 读，不引入整套 Node 类型
const base = process.env.BASE ?? "/pinyin-quest/";

export default defineConfig({
  base,
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
  // 本机生成读音、模型时不要让预览页面一直刷新
  server: { watch: { ignored: ["**/public/audio/**", "**/tools/**", "**/src/data/audio.json"] } },
  test: { include: ["src/**/*.test.ts"] },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2,mp3,json,png,jpg,glb,wasm}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallbackDenylist: base === "/pinyin-quest/" ? [/^\/pinyin-quest\/next\//] : [], // 正式版不接管预览版的页面
      },
      manifest: {
        name: "拼音闯关",
        short_name: "拼音闯关",
        lang: "zh-CN",
        start_url: base,
        scope: base,
        display: "fullscreen",
        orientation: "landscape",
        background_color: "#1a120a",
        theme_color: "#1a120a",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
