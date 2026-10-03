// react-router route table. `routes` is exported separately from `router` so
// tests can feed the exact same RouteObject[] into `createMemoryRouter`
// instead of re-declaring the tree (see web/src/tests/util.tsx).
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import Feed from "./screens/Feed";
import Doc from "./screens/Doc";
import NotFound from "./screens/NotFound";
import { RouteError } from "./components/RouteError";
import type { ComponentType } from "react";
import type { HubKind } from "./api/types";

// Feed (the landing page) ships in the main bundle; every other screen is its
// own chunk, fetched on first visit, so the homepage doesn't download the map,
// Ask, Doc viewer, etc. up front.
const screen = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});
const hub = (kind: HubKind) => async () => {
  const { default: Hub } = await import("./screens/Hub");
  return { element: <Hub kind={kind} /> };
};

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      {
        // Pathless: errors (e.g. a stale lazy chunk) render inside the shell, nav intact.
        errorElement: <RouteError />,
        children: [
          { path: "/", element: <Feed /> },
          { path: "/archive", lazy: screen(() => import("./screens/Archive")) },
          { path: "/ask", lazy: screen(() => import("./screens/Ask")) },
          { path: "/ask/:id", lazy: screen(() => import("./screens/AskShared")) },
          { path: "/doc/:id", element: <Doc /> },
          { path: "/shorts/:id", lazy: screen(() => import("./screens/Shorts")) },
          { path: "/boards", lazy: screen(() => import("./screens/Boards")) },
          { path: "/board/:slug", lazy: screen(() => import("./screens/Board")) },
          { path: "/thread/:id", lazy: screen(() => import("./screens/Thread")) },
          { path: "/cases", lazy: screen(() => import("./screens/Cases")) },
          { path: "/case/:slug", lazy: screen(() => import("./screens/Case")) },
          { path: "/map", lazy: screen(() => import("./screens/Map")) },
          { path: "/browse", lazy: screen(() => import("./screens/Browse")) },
          { path: "/releases", lazy: screen(() => import("./screens/Releases")) },
          { path: "/privacy", lazy: screen(() => import("./screens/Privacy")) },
          { path: "/terms", lazy: screen(() => import("./screens/Terms")) },
          { path: "/notifications", lazy: screen(() => import("./screens/Notifications")) },
          { path: "/release/:slug", lazy: hub("release") },
          { path: "/topic/:slug", lazy: hub("topic") },
          { path: "/agency/:slug", lazy: hub("agency") },
          { path: "/location/:slug", lazy: hub("location") },
          { path: "/decade/:slug", lazy: hub("decade") },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
