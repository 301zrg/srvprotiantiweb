/** Keep the fan inside the host's slot; large stacks compress, never overflow. */
export function materialOffset(
  index: number,
  count: number,
  height: number,
  rotation: number,
) {
  const depth = (Math.max(1, count) - index) / Math.max(1, count);
  const angle = (rotation * Math.PI) / 180;
  // Defense cards already fill their slot's width. Keep their vertical fan
  // within the inter-row gap instead of extending into the opposing monster.
  const sideways = Math.abs(Math.sin(angle)) > 0.5;
  const x = -height * (sideways ? 0.055 : 0.45) * depth;
  const y = sideways ? -height * 0.1 * depth : 0;
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
  };
}
