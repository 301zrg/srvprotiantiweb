import "./fieldSelection.css";

import { type ReactNode } from "react";

import { fetchStrings, Region } from "@/api";
import { duelResultMessages } from "@/variant/duelResultMessages";
import {
  fieldSelectionMessages,
  fieldSelectionRows,
  type FieldSpot,
} from "@/variant/fieldSelection";

/** Selection and inspection remain with the online or practice caller. */
export function FieldSelectionGrid<T>({
  options,
  address,
  viewPlayer = 0,
  language,
  owner,
  renderOption,
}: {
  options: readonly T[];
  address: (option: T) => FieldSpot | undefined;
  viewPlayer?: number;
  language: string;
  owner?: (player: number) => string;
  renderOption: (option: T) => ReactNode;
}) {
  const { rows, fallback } = fieldSelectionRows(options, address, viewPlayer);
  const words = fieldSelectionMessages(language);
  const owners = duelResultMessages(language);
  return (
    <div className="field-selection-grid" data-testid="field-selection-grid">
      {rows.length > 0 && (
        <p className="field-selection-order">{words.order}</p>
      )}
      {rows.map((row) => {
        const title = `${
          owner?.(row.player) ??
          (row.player === viewPlayer ? owners.self : owners.opponent)
        } · ${fetchStrings(Region.System, row.systemId)}`;
        return (
          <div
            key={row.key}
            className="field-selection-row"
            data-testid="field-selection-row"
            data-row={row.key}
            data-player={row.player}
            data-location={row.location}
            data-columns={row.slots.length}
            role="group"
            aria-label={title}
          >
            <div className="field-selection-row-label">{title}</div>
            <div
              className="field-selection-slots"
              data-columns={row.slots.length}
            >
              {row.slots.map((slot) => (
                <div
                  key={slot.column}
                  className="field-selection-slot"
                  data-testid="field-selection-slot"
                  data-player={row.player}
                  data-location={row.location}
                  data-sequence={slot.sequence}
                  data-column={slot.column}
                  data-empty={!slot.options.length}
                  aria-hidden={!slot.options.length || undefined}
                >
                  {row.slots.length > 1 && (
                    <span
                      className="field-selection-slot-number"
                      title={words.slot(slot.column + 1)}
                      aria-hidden="true"
                    >
                      {slot.column + 1}
                    </span>
                  )}
                  {slot.options.map((option, index) => (
                    <div className="field-selection-option" key={index}>
                      {renderOption(option)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {fallback.length > 0 && (
        <div
          className="field-selection-fallback"
          data-testid="field-selection-fallback"
        >
          {fallback.map((option, index) => (
            <div className="field-selection-option" key={index}>
              {renderOption(option)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
