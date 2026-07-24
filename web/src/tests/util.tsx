// Shared test harness for anything that needs the full app tree (Theme +
// QueryClient + Router + Overlay). `routes` is imported from ../router (not
// re-declared) so tests and the real app resolve to identical route
// definitions — createBrowserRouter(routes) in the app,
// createMemoryRouter(routes, {...}) here.
//
// OverlayProvider/OverlayHost are included (mirroring App.tsx's own
// `<OverlayProvider><RouterProvider/><OverlayHost/></OverlayProvider>`
// nesting — see App.tsx) since Task 19's Doc screen is the first screen to
// call `useOverlay()`; without a real provider in the tree, any route that
// mounts Doc (directly, or reached by navigating from another screen, e.g.
// feed.test.tsx's DocCard click-through) would throw "useOverlay must be
// used within an OverlayProvider" the moment it rendered.
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { OverlayProvider, OverlayHost } from "../overlays/OverlayProvider";
import { routes } from "../router";

export function renderAppAt(path: string): RenderResult {
  // retry:false — a query failing (there's no live Worker in tests) should
  // fail fast instead of vitest waiting through TanStack Query's retry backoff.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const memoryRouter = createMemoryRouter(routes, { initialEntries: [path] });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <OverlayProvider>
          <RouterProvider router={memoryRouter} />
          <OverlayHost />
        </OverlayProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
