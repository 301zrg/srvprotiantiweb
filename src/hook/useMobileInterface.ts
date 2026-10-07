import { useEffect, useState } from "react";

export const mobileInterfaceQuery =
  "(max-width: 1024px), (max-height: 600px) and (pointer: coarse)";

export function useMediaQuery(media: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(media).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(media);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [media]);
  return matches;
}

export const useMobileInterface = () => useMediaQuery(mobileInterfaceQuery);
