import { createHashRouter, RouterProvider } from "react-router-dom";

import { normalizeRoomLink } from "@/variant/roomLink";

import { Component, ErrorBoundary, loader } from "./Layout";

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
        lazy: () => import("./Start"),
      },
      {
        path: "/match/*",
        lazy: () => import("./Match"),
      },
      {
        path: "/build",
        lazy: () => import("./BuildDeck"),
      },
      {
        path: "/waitroom",
        lazy: () => import("./WaitRoom"),
      },
      {
        path: "/duel",
        lazy: () => import("./Duel/Main"),
      },
      {
        path: "/side",
        lazy: () => import("./Side"),
      },
    ],
  },
]);

export const NeosRouter = () => <RouterProvider router={router} />;
