// react-router route table. `routes` is exported separately from `router` so
// tests can feed the exact same RouteObject[] into `createMemoryRouter`
// instead of re-declaring the tree (see web/src/tests/util.tsx).
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import Feed from "./screens/Feed";
import Archive from "./screens/Archive";
import Doc from "./screens/Doc";
import Boards from "./screens/Boards";
import Board from "./screens/Board";
import Thread from "./screens/Thread";
import CaseScreen from "./screens/Case";
import MapScreen from "./screens/Map";

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Feed /> },
      { path: "/archive", element: <Archive /> },
      { path: "/doc/:id", element: <Doc /> },
      { path: "/boards", element: <Boards /> },
      { path: "/board/:slug", element: <Board /> },
      { path: "/thread/:id", element: <Thread /> },
      { path: "/case/:slug", element: <CaseScreen /> },
      { path: "/map", element: <MapScreen /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
