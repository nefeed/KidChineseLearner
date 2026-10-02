export type Point = [number, number];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}
const pathLength = (points: Point[]) => points.slice(1).reduce((n, p, i) => n + distance(p, points[i]), 0);
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
