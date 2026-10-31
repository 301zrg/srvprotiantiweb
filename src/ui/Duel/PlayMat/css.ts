import {
  baseGeometry,
  type BoardGeometry,
  boardGeometry,
  geometryCssVars,
} from "@/ui/Shared/DuelBoard/geometry";
import { roomyStatsQuery } from "@/variant/cardStats";

/** Live geometry of the online board. Only the online Mat updates it; offline
 * boards compute their own `boardGeometry` and never touch this object. */
export const matConfig: BoardGeometry = { ...baseGeometry };

const applyToBody = (g: BoardGeometry) => {
  for (const [key, value] of Object.entries(geometryCssVars(g)))
    document.body.style.setProperty(key, value);
};

/** Card and zone CSS outside a board (e.g. card images) read these defaults. */
export function setCssProperties() {
  applyToBody(matConfig);
}

/** CSS and online spring coordinates share the same responsive geometry. */
export function updateMatLayout(wide: boolean, masterRule: number) {
  const next = boardGeometry({
    wide,
    masterRule,
    roomy: window.matchMedia(roomyStatsQuery).matches,
  });
  const changed = (Object.keys(next) as (keyof BoardGeometry)[]).some(
    (key) => next[key] !== matConfig[key],
  );
  Object.assign(matConfig, next);
  applyToBody(matConfig);
  return changed;
}
