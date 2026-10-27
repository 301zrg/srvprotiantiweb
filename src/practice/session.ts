import type { IDeck } from "../stores/deckStore";

let draft: IDeck | undefined;
const copy = (deck: IDeck): IDeck => ({
  deckName: deck.deckName,
  main: [...deck.main],
  extra: [...deck.extra],
  side: [...deck.side],
});
/** Preserve the editor's unsaved draft without writing the local library. */
export function setPracticeDeck(deck: IDeck) {
  draft = copy(deck);
}
export function getPracticeDeck(): IDeck | undefined {
  return draft && copy(draft);
}
export function createPracticeSeed(): number[] {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)));
}
