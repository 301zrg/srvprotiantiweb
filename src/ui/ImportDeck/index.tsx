import { Alert, App, Button, Select, Spin } from "antd";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { importDeckContent } from "@/service/deckImport";
import { DeckImportError } from "@/variant/deckImport";
import { deckImportMessages } from "@/variant/deckImportMessages";
import {
  captureDeckImport,
  type DeckImportSession,
  isCurrentDeckImport,
} from "@/variant/deckImportSession";
import { deckMessages } from "@/variant/deckMessages";

import { useI18N } from "../I18N";
import { Background } from "../Shared";

const imports = new WeakMap<
  DeckImportSession,
  Promise<Awaited<ReturnType<typeof importDeckContent>>>
>();

export function Component() {
  const location = useLocation();
  const session = useMemo(
    () => captureDeckImport()!,
    [location.key, location.search],
  );
  return <ImportDeckFlow key={location.key} session={session} />;
}

function ImportDeckFlow({ session }: { session: DeckImportSession }) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { language } = useI18N();
  const text = deckImportMessages(language);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [failure, setFailure] = useState<DeckImportError>();
  const [unknownZones, setUnknownZones] = useState<number[]>([]);
  const [zones, setZones] = useState<Record<number, "main" | "extra">>({});

  const startImport = useCallback(
    async (overrides: Record<number, "main" | "extra"> = {}) => {
      if (!snapshot.input) return;
      setFailure(undefined);
      setUnknownZones([]);
      try {
        let pending = imports.get(session);
        if (!pending) {
          pending = importDeckContent(
            snapshot.input,
            snapshot.title,
            text.defaultTitle,
            overrides,
          );
          imports.set(session, pending);
        }
        const result = await pending;
        if (!isCurrentDeckImport(session)) return;
        const { setSelectedDeck } = await import("../BuildDeck");
        if (!isCurrentDeckImport(session)) return;
        setSelectedDeck(result.deck);
        session.finish(result.persisted ? "imported" : "memory-only");
        if (result.persisted)
          message.success(
            result.reused ? text.reused : deckMessages(language).imported,
          );
        else message.warning(text.memory, 8);
        if (result.unknown)
          message.warning(
            `${result.unknown} ${deckMessages(language).unknownCards}`,
            8,
          );
        navigate("/build", { replace: true });
      } catch (error) {
        imports.delete(session);
        if (error instanceof DeckImportError && error.code === "unknown-zones")
          setUnknownZones(error.cardIds);
        else {
          setFailure(
            error instanceof DeckImportError
              ? error
              : new DeckImportError("invalid-format"),
          );
          session.finish("failed");
        }
      }
    },
    [
      snapshot.input,
      snapshot.title,
      session,
      text.defaultTitle,
      text.reused,
      text.memory,
      message,
      navigate,
      language,
    ],
  );

  useEffect(() => {
    if (snapshot.input && !snapshot.error) void startImport();
    return () => {
      if (!window.location.hash.startsWith("#/import"))
        session.finish("cancelled");
    };
  }, [snapshot.input, snapshot.error, session, startImport]);

  const error = snapshot.error ?? failure;
  return (
    <>
      <Background />
      <section
        data-testid="deck-import-page"
        style={{
          margin: "24px auto",
          padding: 20,
          width: "min(640px, calc(100% - 24px))",
          boxSizing: "border-box",
          background: "#16202be8",
          borderRadius: 12,
          color: "white",
          overflowWrap: "anywhere",
          maxHeight: "calc(100dvh - var(--header-height, 60px) - 48px)",
          overflowY: "auto",
        }}
      >
        <h1>{text.title}</h1>
        {error ? (
          <Alert
            data-testid="deck-import-error"
            type="error"
            showIcon
            message={text.failed}
            description={text.errors[error.code]}
          />
        ) : unknownZones.length ? (
          <div data-testid="deck-import-zone-review">
            <p>{text.zones}</p>
            {unknownZones.map((id) => (
              <label
                key={id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 12,
                }}
              >
                <span>{id}</span>
                <Select
                  size="large"
                  aria-label={`${text.zone} ${id}`}
                  data-testid={`deck-import-zone-${id}`}
                  value={zones[id]}
                  placeholder={text.zone}
                  style={{ minWidth: 180, minHeight: 44 }}
                  options={[
                    { value: "main", label: text.main },
                    { value: "extra", label: text.extra },
                  ]}
                  onChange={(zone) =>
                    setZones((old) => ({ ...old, [id]: zone }))
                  }
                />
              </label>
            ))}
            <Button
              data-testid="deck-import-zone-confirm"
              type="primary"
              size="large"
              style={{ minHeight: 44 }}
              disabled={unknownZones.some((id) => !zones[id])}
              onClick={() => void startImport(zones)}
            >
              {text.continue}
            </Button>
          </div>
        ) : (
          <p role="status">
            <Spin size="small" />{" "}
            {snapshot.input ? text.importing : text.waiting}
          </p>
        )}
        <Button
          data-testid="deck-import-back"
          size="large"
          style={{ marginTop: 16, minHeight: 44 }}
          onClick={() => {
            session.finish("cancelled");
            navigate("/build", { replace: true });
          }}
        >
          {text.back}
        </Button>
      </section>
    </>
  );
}
