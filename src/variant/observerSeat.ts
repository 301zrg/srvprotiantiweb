/** Spectator view across games of a match.
 *
 * The view names a Core player (0 is the first player of each game); the seat
 * is the room team that player belongs to. `swapped` is MSG_START's flag that
 * room seats differ from Core order in this game. */
export type Side = 0 | 1;

/** Seat shown near the spectator for a view in a game. */
export const seatOfView = (view: Side, swapped: boolean): Side =>
  (view ^ Number(swapped)) as Side;

/** View at the start of a game: the remembered seat when kept, else the first
 * player (the previous behaviour, and always for the first game). */
export const viewForGame = (
  seat: Side | null,
  swapped: boolean,
  keepSeat: boolean,
): Side => (keepSeat && seat !== null ? seatOfView(seat, swapped) : 0);
