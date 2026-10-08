import { createHashRouter, RouterProvider } from "react-router-dom";

import { ResourceLoadError } from "@/infra/resource";
import { captureDeckImport } from "@/variant/deckImportSession";
import { captureReplayImport } from "@/variant/replayImportSession";
import { normalizeRoomLink } from "@/variant/roomLink";

import { Component, ErrorBoundary, loader } from "./Layout";

async function loadPage<T>(name: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (
      /module script|dynamically imported|loading chunk|preload CSS|unexpected end|unexpected EOF/i.test(
        String(error),
      )
    )
      throw new ResourceLoadError(`Page: ${name}`, error);
    throw error;
  }
}

captureDeckImport();
captureReplayImport();
const roomLinkUrl = normalizeRoomLink(new URL(window.location.href));
if (roomLinkUrl)
  window.history.replaceState(window.history.state, "", roomLinkUrl);

const router = createHashRouter([
  {
    path: "/",
    Component,
    ErrorBoundary,
    loader,
    children: [
      {
        path: "/",
        lazy: () => loadPage("home", () => import("./Start")),
      },
      {
        path: "/match/*",
        lazy: () => loadPage("online", () => import("./Match")),
      },
      {
        path: "/replays",
        lazy: () => loadPage("replays", () => import("./Replay")),
      },
      {
        path: "/replay-import",
        lazy: () => loadPage("replay import", () => import("./ImportReplay")),
      },
      {
        path: "/build",
        lazy: () => loadPage("decks", () => import("./BuildDeck")),
      },
      {
        path: "/import",
        lazy: () => loadPage("deck import", () => import("./ImportDeck")),
      },
      {
        path: "/waitroom",
        lazy: () => loadPage("room", () => import("./WaitRoom")),
      },
      {
        path: "/duel",
        lazy: () => loadPage("duel", () => import("./Duel/Main")),
      },
      {
        path: "/side",
        lazy: () => loadPage("side", () => import("./Side")),
      },
    ],
  },
]);

export const NeosRouter = () => <RouterProvider router={router} />;
