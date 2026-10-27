/** Keep the fan inside the host's slot; large stacks compress, never overflow. */
export function materialOffset(index: number, count: number, height: number) {
  const depth = (Math.max(1, count) - index) / Math.max(1, count);
  // Materials stay portrait; the full fan fits inside the 120px monster slot.
  const x =
    Math.max(0, Math.min(height * 0.22, (120 - height * (5.9 / 8.6)) / 2 - 2)) *
    depth;
  return { x, y: 0 };
}
