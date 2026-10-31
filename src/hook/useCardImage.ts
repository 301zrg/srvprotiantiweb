import { type RefObject, useEffect, useState } from "react";

import {
  acquireCardImage,
  cachedCardImage,
  releaseCardImage,
} from "@/api/cardImageCache";
import { getCardImgUrl } from "@/api/cards";
import { useConfig } from "@/config";

// Bundled assets (card backs, icons) need no cache of their own. Read the
// config lazily: this module is part of an import cycle with @/config.
const isCardArt = (src: string) =>
  /^https?:\/\//.test(src) && !src.startsWith(useConfig().assetsPath);

/** Card art through the shared cache. Undefined while loading (or while not
 * `visible`), so callers draw nothing instead of starting a direct download. */
export function useCardImage(code: number, back = false, visible = true) {
  const src = getCardImgUrl(code, back);
  const art = isCardArt(src);
  const [resolved, setResolved] = useState(() => ({
    src,
    url: art ? cachedCardImage(src) : src,
  }));
  useEffect(() => {
    if (!art) {
      setResolved({ src, url: src });
      return;
    }
    if (!visible) {
      setResolved({ src, url: cachedCardImage(src) });
      return;
    }
    let active = true,
      owned = false;
    void acquireCardImage(src).then((result) => {
      owned = result.owned;
      if (!active) {
        if (owned) releaseCardImage(src);
        return;
      }
      setResolved({ src, url: result.url });
    });
    return () => {
      active = false;
      if (owned) releaseCardImage(src);
    };
  }, [src, art, visible]);
  if (resolved.src === src) return resolved.url;
  return art ? cachedCardImage(src) : src;
}

/** True once the element is within `margin` of its scroll area; it stays true
 * so a loaded image is not dropped while scrolling back and forth. */
export function useNearViewport(
  ref: RefObject<Element>,
  margin = "400px",
): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    // Observe against the nearest custom scroll viewport so the margin also
    // preloads the next rows inside it, not only near the window edge.
    const root = element.closest(
      "[data-overlayscrollbars-viewport], .os-viewport",
    );
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { root, rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, margin, near]);
  return near;
}
