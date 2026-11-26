import "@fontsource/andika/400.css";
import "@fontsource/andika/700.css";
import "@fontsource/noto-serif-sc/500.css";
import "@fontsource/noto-serif-sc/700.css";
import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { Game } from "./game/app";

registerSW({ immediate: true });
const game = new Game(document.getElementById("app")!);
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game; // 本机调试用
