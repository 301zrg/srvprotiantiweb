/** Brief readable pause for a confirmed hand card; normal speed (0.7): 650 ms. */
export function getRevealHoldDuration(speed: number): number {
  const bounded = Number.isFinite(speed)
    ? Math.max(0, Math.min(1, speed))
    : 0.7;
  return Math.round(1000 - bounded * 500);
}
