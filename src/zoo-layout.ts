export type MapMember = { kind: 'animal' | 'building'; key: string; x: number; y: number };

/** A visual packing pass for old saves whose items now meet in one region.
 * Stored coordinates are untouched; the selected item keeps placement priority.
 */
export function arrangeRegion(items: MapMember[], width: number, height: number, selected: string, compact: boolean) {
  const positions = new Map<string, { left: string; top: string }>();
  if (!width || !height) return positions;
  const halfX = compact ? 28 : 56, halfY = compact ? 30 : 64;
  const gapX = compact ? 62 : 120, gapY = compact ? 68 : 136;
  const minX = halfX + 3, maxX = width - halfX - 3;
  const minY = Math.max(halfY + 3, height * .28), maxY = height - halfY - 3;
  const columns = Math.max(1, Math.min(4, Math.floor((maxX - minX) / gapX) + 1));
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const slots = Array.from({ length: columns * rows }, (_, index) => ({
    x: columns === 1 ? width / 2 : minX + index % columns * (maxX - minX) / (columns - 1),
    y: rows === 1 ? (minY + maxY) / 2 : minY + Math.floor(index / columns) * (maxY - minY) / (rows - 1),
  }));
  const placed: { x: number; y: number }[] = [];
  const order = [...items].sort((a, b) => Number(`${b.kind}:${b.key}` === selected) - Number(`${a.kind}:${a.key}` === selected));
  for (const item of order) {
    const desired = { x: Math.max(minX, Math.min(maxX, item.x / 100 * width)), y: Math.max(minY, Math.min(maxY, item.y / 100 * height)) };
    const available = (point: { x: number; y: number }) => placed.every(other => Math.abs(other.x - point.x) >= gapX || Math.abs(other.y - point.y) >= gapY);
    const candidates = [...slots].sort((a, b) => Math.hypot(a.x - desired.x, a.y - desired.y) - Math.hypot(b.x - desired.x, b.y - desired.y));
    const location = available(desired) ? desired : candidates.find(available);
    if (!location) {
      // Arbitrary old placements may block every remaining grid slot. Repack
      // deterministically, reserving the closest slot for the selected friend.
      const free = [...slots];
      for (const entry of order) {
        free.sort((a, b) => Math.hypot(a.x - entry.x / 100 * width, a.y - entry.y / 100 * height) - Math.hypot(b.x - entry.x / 100 * width, b.y - entry.y / 100 * height));
        const slot = free.shift()!;
        positions.set(`${entry.kind}:${entry.key}`, { left: `${slot.x / width * 100}%`, top: `${slot.y / height * 100}%` });
      }
      return positions;
    }
    placed.push(location);
    positions.set(`${item.kind}:${item.key}`, { left: `${location.x / width * 100}%`, top: `${location.y / height * 100}%` });
  }
  return positions;
}
