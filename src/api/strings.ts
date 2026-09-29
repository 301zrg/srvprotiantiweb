import { getEnvironmentFile, getLanguage, type Language } from "@/variant";

import { fetchCard, getCardStr } from "./cards";

export const DESCRIPTION_LIMIT = 10000;
let strings = new Map<string, string>();

export async function loadStrings(language: Language) {
  const response = await fetch(getEnvironmentFile("strings.conf", language));
  if (!response.ok) throw new Error(`strings.conf: HTTP ${response.status}`);
  const next = new Map<string, string>();
  for (const line of (await response.text()).split(/\r?\n/)) {
    const match = line.match(/^(!\S+)\s+(\S+)\s+(.*)$/);
    if (match) next.set(`${match[1]}_${match[2]}`, match[3]);
  }
  return next;
}

export function activateStrings(next: Map<string, string>) {
  strings = next;
}

export async function initStrings() {
  activateStrings(await loadStrings(getLanguage()));
}

export enum Region {
  System = "!system",
  Victory = "!victory",
  Counter = "!counter",
}

export function fetchStrings(region: Region, id: string | number): string {
  return strings.get(`${region}_${id}`) ?? "?";
}

export function getStrings(description: number): string {
  if (description < DESCRIPTION_LIMIT) {
    return fetchStrings(Region.System, description);
  }
  const code = description >> 4;
  const index = description & 0xf;
  return getCardStr(fetchCard(code), index) ?? "[?]";
}
