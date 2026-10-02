export type Point = [number, number];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}
const pathLength = (points: Point[]) => points.slice(1).reduce((n, p, i) => n + distance(p, points[i]), 0);
// Guides move by distance, so a short median segment never takes as long as a
// long one. These helpers affect the illustration only, not trace acceptance.
export function pointAlongStroke(median: Point[], progress: number): Point {
  if (!median.length) return [0, 0];
  let remaining = pathLength(median) * Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  for (let i = 1; i < median.length; i++) {
    const length = distance(median[i - 1], median[i]);
    if (length && remaining <= length) {
      const fraction = remaining / length;
      return [median[i - 1][0] + (median[i][0] - median[i - 1][0]) * fraction, median[i - 1][1] + (median[i][1] - median[i - 1][1]) * fraction];
    }
    remaining -= length;
  }
  return [...median.at(-1)!];
}
export function strokeProgress(median: Point[], point: Point): number {
  const total = pathLength(median);
  if (!total) return 0;
  let travelled = 0, nearest = Infinity, progress = 0;
  for (let i = 1; i < median.length; i++) {
    const a = median[i - 1], b = median[i], dx = b[0] - a[0], dy = b[1] - a[1], length = distance(a, b);
    const fraction = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (length * length || 1)));
    const gap = distance(point, [a[0] + fraction * dx, a[1] + fraction * dy]);
    if (gap < nearest) { nearest = gap; progress = (travelled + length * fraction) / total; }
    travelled += length;
  }
  return progress;
}
export function canContinueTrace(trace:Point[],median:Point[],tolerance=130):boolean {
  if(trace.length<2||median.length<2||distance(trace[0],median[0])>tolerance)return false;
  if(distance(trace[0],median[0])>distance(trace[0],median.at(-1)!))return false;
  if(distance(trace.at(-1)!,median.at(-1)!)<=tolerance)return false;
  return trace.every(p=>Math.min(...median.slice(1).map((b,i)=>segmentDistance(p,median[i],b)))<=tolerance);
}
export function checkTrace(trace: Point[], median: Point[], tolerance = 130): { correct: boolean; message: string } {
  if (trace.length < 2 || median.length < 2) return { correct: false, message: '从小圆点开始，沿着箭头慢慢画。' };
  const length = pathLength(median);
  if (distance(trace[0], median[0]) > tolerance) return { correct: false, message: '先找到发亮的小圆点，从这里开始。' };
  // A fixed spatial tolerance overlaps both ends of short dots. Comparing the
  // endpoints still detects a reversed dot while keeping generous lateral room.
  if (distance(trace[0], median[0]) > distance(trace[0], median.at(-1)!) || distance(trace.at(-1)!, median.at(-1)!) > distance(trace.at(-1)!, median[0])) return { correct: false, message: '从亮圆点出发，沿着箭头往前画。' };
  if (distance(trace[trace.length - 1], median[median.length - 1]) > tolerance) return { correct: false, message: '再画长一点，送小星星到笔画的终点。' };
  if (pathLength(trace) < length * 0.55) return { correct: false, message: '沿着这一笔慢慢走完。' };
  const nearMedian = (p: Point) => Math.min(...median.slice(1).map((b, i) => segmentDistance(p, median[i], b)));
  if (trace.filter(p => nearMedian(p) <= tolerance).length / trace.length < .8) return { correct: false, message: '靠近发亮的笔画，再试一次就好。' };
  const covered = median.filter(p => Math.min(...trace.slice(1).map((b, i) => segmentDistance(p, trace[i], b))) < tolerance).length / median.length;
  if (covered < .75) return { correct: false, message: '转弯的地方也要一起画到哦。' };
  return { correct: true, message: '这一笔画好啦！' };
}
