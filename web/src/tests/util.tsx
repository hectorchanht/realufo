// Shared test harness for anything that needs the full app tree (Theme +
// QueryClient + Router + Overlay). `routes` is imported from ../router (not
// re-declared) so tests and the real app resolve to identical route
// definitions — createBrowserRouter(routes) in the app,
// createMemoryRouter(routes, {...}) here.
//
// OverlayProvider wraps the router, mirroring App.tsx, so every screen can
// call `useOverlay()`. OverlayHost is NOT rendered here: AppShell mounts it
// inside the router (the Composer calls useNavigate()), exactly as in the app.
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { OverlayProvider } from "../overlays/OverlayProvider";
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
        </OverlayProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
