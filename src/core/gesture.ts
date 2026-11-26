import type { Tone } from "./types";

export function classifyTone(points: { x: number; y: number; t: number }[], scale = 1): Tone | null {
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  let xMin = first.x;
  let xMax = first.x;
  let yMin = first.y;
  let yMax = first.y;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const { x, y } = points[i];
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
    length += Math.hypot(x - points[i - 1].x, y - points[i - 1].y);
  }
  if (length < 18 * scale) return last.t - first.t < 350 ? 0 : null;
  if (points.length < 3) return null;

  const width = xMax - xMin;
  const height = yMax - yMin;
  const span = Math.max(width, height);
  if (yMax - first.y > 0.25 * span && yMax - last.y > 0.25 * span) return 3;
  const dy = last.y - first.y;
  if (dy < -0.3 * span) return 2;
  if (dy > 0.3 * span) return 4;
  return height <= 0.35 * width ? 1 : null;
}
