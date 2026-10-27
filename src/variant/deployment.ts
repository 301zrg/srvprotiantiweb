/** Compile-time publishing profile; normal static deployments keep their format. */
export const isBiliToy = import.meta.env.VITE_DEPLOY_TARGET === "bilitoy";

export function publishedResourceName(file: string): string {
  return isBiliToy ? file.replace(/\.(cdb|conf)$/, ".data") : file;
}

/** Toy content shares an origin. Keep keys stable across a Toy's version paths. */
export function storageKey(key: string): string {
  if (!isBiliToy) return key;
  const parts =
    typeof window === "undefined"
      ? []
      : window.location.pathname.split("/").filter(Boolean);
  // Published paths are /toy/<channel>/<work-id>-v<revision>/index.html.
  // The channel (e.g. "square") is shared by multiple works.
  const work = parts[2]?.match(/^(.+)-v\d+$/)?.[1];
  const slug =
    parts[0] === "toy" && parts[1]
      ? work
        ? `${parts[1]}/${work}`
        : parts[1]
      : "default";
  return `srvprotiantiweb:bilitoy:${encodeURIComponent(slug)}:${key}`;
}

export const siteStorage = {
  getItem(key: string) {
    return localStorage.getItem(storageKey(key));
  },
  setItem(key: string, value: string) {
    localStorage.setItem(storageKey(key), value);
  },
  removeItem(key: string) {
    localStorage.removeItem(storageKey(key));
  },
};
