import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/pinyin-quest/",
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
      },
      manifest: {
        name: "拼音闯关",
        short_name: "拼音闯关",
        lang: "zh-CN",
        start_url: "/pinyin-quest/",
        scope: "/pinyin-quest/",
        display: "fullscreen",
        orientation: "landscape",
        background_color: "#2f8cff",
        theme_color: "#2f8cff",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
