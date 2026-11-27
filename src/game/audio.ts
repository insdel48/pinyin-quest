// 声音：提前做好的读音（mp3）+ 用 Web Audio 现做的音效。第一次点屏幕后才能出声。
import manifest from "../data/audio.json";

const files = manifest as Record<string, string>;
let ctx: AudioContext | null = null;
let master: DynamicsCompressorNode | null = null; // 音效叠在一起时压一压，不爆音
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let current: AudioBufferSourceNode | null = null;

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -14; master.ratio.value = 6;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function hasVoice(key: string) { return key in files; }

function load(key: string): Promise<AudioBuffer | null> {
  let p = buffers.get(key);
  if (!p) {
    const file = files[key];
    p = !file || !ctx ? Promise.resolve(null) : fetch(`${import.meta.env.BASE_URL}audio/${file}`)
      .then(r => r.arrayBuffer()).then(b => ctx!.decodeAudioData(b)).catch(() => null);
    if (file && ctx) buffers.set(key, p);
  }
  return p;
}

/** 预先加载，减少第一次播放的停顿 */
export function preload(keys: string[]) { if (ctx) keys.forEach(k => void load(k)); }

/** 播放一条读音；播完（或没有这条读音）时返回。会打断正在播的读音。 */
export async function say(key: string, rate = 1): Promise<void> {
  if (!ctx) return;
  const buf = await load(key);
  if (!buf) return;
  stopVoice();
  return new Promise(resolve => {
    const src = ctx!.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const gain = ctx!.createGain(); gain.gain.value = 1;
    src.connect(gain).connect(ctx!.destination);
    src.onended = () => { if (current === src) current = null; resolve(); };
    current = src; src.start();
  });
}

export function stopVoice() { try { current?.stop(); } catch { /* 已经停了 */ } current = null; }

export async function sayAll(keys: string[], gap = 180) {
  for (const k of keys) { if (!hasVoice(k)) continue; await say(k); await wait(gap); }
}

export const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** 音效：全部现场合成，不占音频文件 */
export function sfx(name: "snap" | "back" | "swish" | "hit" | "miss" | "bite" | "seal" | "chime" | "coin" | "step" | "nope" | "whoosh" | "punch" | "boom") {
  if (!ctx) return;
  const t = ctx.currentTime, c = ctx;
  const tone = (freq: number, dur: number, type: OscillatorType, vol: number, at = 0, to?: number) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t + at); if (to) o.frequency.exponentialRampToValueAtTime(to, t + at + dur);
    g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
    o.connect(g).connect(master ?? c.destination); o.start(t + at); o.stop(t + at + dur + 0.02);
  };
  const noise = (dur: number, vol: number, freq: number, at = 0) => {
    const len = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; f.type = "bandpass"; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(master ?? c.destination); s.start(t + at);
  };
  switch (name) {
    case "snap": tone(880, 0.06, "triangle", 0.18); noise(0.04, 0.25, 3000); break;
    case "back": tone(500, 0.08, "triangle", 0.12, 0, 300); break;
    case "swish": noise(0.35, 0.5, 1200); break;
    case "hit": tone(140, 0.25, "sine", 0.5, 0, 60); noise(0.18, 0.6, 600); break;
    case "miss": noise(0.2, 0.3, 400); tone(300, 0.3, "sine", 0.15, 0.05, 120); break;
    case "bite": tone(200, 0.15, "square", 0.12, 0, 90); noise(0.12, 0.5, 900); break;
    case "seal": noise(0.08, 0.7, 2500); tone(1200, 0.12, "triangle", 0.12, 0.02, 600); break;
    case "chime": tone(660, 0.5, "sine", 0.18); tone(990, 0.6, "sine", 0.14, 0.12); break;
    case "coin": tone(1320, 0.12, "triangle", 0.14); tone(1760, 0.2, "triangle", 0.12, 0.08); break;
    case "step": noise(0.1, 0.4, 250); break;
    case "nope": tone(330, 0.12, "triangle", 0.15); tone(262, 0.18, "triangle", 0.15, 0.13); break;
    // 打击感：挥笔呼啸、重拳（低频冲击 + 爆裂噪声 + 短促高频脆响）、大招爆炸（长低频 + 大噪声 + 回响）
    case "whoosh": noise(0.22, 0.55, 900); noise(0.18, 0.35, 2400, 0.04); break;
    case "punch": tone(160, 0.22, "sine", 0.9, 0, 45); tone(90, 0.3, "sine", 0.7, 0.01, 35); noise(0.12, 0.9, 700); noise(0.05, 0.6, 3500); break;
    case "boom": tone(120, 0.7, "sine", 1.0, 0, 30); tone(60, 0.9, "sine", 0.8, 0.02, 25); noise(0.5, 1.0, 500); noise(0.25, 0.7, 1800, 0.03); tone(880, 0.4, "triangle", 0.12, 0.05, 1320); break;
  }
}
