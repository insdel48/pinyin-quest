import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/pinyin-quest/",
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
  test: { include: ["src/**/*.test.ts"] },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2,mp3,json,png}"],
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
        background_color: "#efe6d3",
        theme_color: "#efe6d3",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
