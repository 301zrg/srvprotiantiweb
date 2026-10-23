import { Alert, Button, Spin } from "antd";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { readJoinForm } from "@/variant/joinForm";
import { siteMessages } from "@/variant/messages";
import { type RoomLink, websiteObserverNickname } from "@/variant/roomLink";
import {
  validEntryNickname,
  type WebEntry,
  webEntryRoute,
} from "@/variant/webEntry";
import { webEntryMessages } from "@/variant/webEntryMessages";
import {
  captureWebEntry,
  type WebEntrySession,
} from "@/variant/webEntrySession";

import { useI18N } from "../I18N";
import { JoinRoomForm } from "../Match";
import { Background } from "../Shared";

export { loader } from "../Match";

export function Component() {
  const location = useLocation();
  const session = useMemo(
    () => captureWebEntry()!,
    [location.key, location.search],
  );
  return <EntryFlow key={location.key} session={session} />;
}

function EntryFlow({ session }: { session: WebEntrySession }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const navigate = useNavigate();
  const { language } = useI18N();
  const text = webEntryMessages(language);
  useEffect(
    () => () => {
      if (window.location.hash !== "#/entry") session.cancel();
    },
    [session],
  );
  if (snapshot.entry)
    return <ReadyEntry entry={snapshot.entry} session={session} />;
  return (
    <>
      <Background />
      <section
        data-testid="web-entry-page"
        style={{
          width: "min(480px, calc(100% - 32px))",
          margin: "24px auto",
          padding: 24,
          boxSizing: "border-box",
          background: "#1b2130e8",
          borderRadius: 12,
          color: "white",
        }}
      >
        {snapshot.error ? (
          <Alert
            type="error"
            showIcon
            role="alert"
            message={
              snapshot.error === "invalid-link"
                ? text.invalid
                : text.unavailable
            }
          />
        ) : (
          <p role="status">
            <Spin /> {text.receiving}
          </p>
        )}
        <Button
          style={{ marginTop: 16 }}
          onClick={() => navigate("/match", { replace: true })}
        >
          {siteMessages(language).connect}
        </Button>
      </section>
    </>
  );
}

function ReadyEntry({
  entry,
  session,
}: {
  entry: WebEntry;
  session: WebEntrySession;
}) {
  const navigate = useNavigate();
  const destination = webEntryRoute(entry.intent);
  const [link] = useState<RoomLink>(() => {
    const spectate = entry.intent === "spectate";
    const cached = readJoinForm();
    const nickname =
      entry.nickname ?? (spectate ? websiteObserverNickname : cached.nickname);
    return {
      spectate,
      nickname,
      room:
        entry.intent === "ladder"
          ? "TT"
          : entry.room ?? (spectate ? "" : cached.roomName),
      autojoin:
        entry.autojoin &&
        (spectate ||
          (entry.intent === "ladder" && validEntryNickname(nickname))),
      invalid: false,
    };
  });
  useEffect(() => {
    if (destination !== "/match") navigate(destination, { replace: true });
  }, [destination, navigate]);
  if (destination !== "/match") return null;
  return (
    <JoinRoomForm
      link={link}
      autoConnect={entry.intent === "ladder"}
      claimAutojoin={session.claimAutojoin}
    />
  );
}
