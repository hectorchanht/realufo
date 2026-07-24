import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { OverlayProvider, OverlayHost } from "./overlays/OverlayProvider";

function App() {
  // OverlayProvider wraps the router (not the other way round) so its
  // context flows down through RouterProvider to every screen — any screen
  // can call useOverlay() to open the Composer/MediaViewer/LoginSheet.
  // <OverlayHost/> is a sibling of <RouterProvider/>, not nested inside it,
  // so its fixed-position layers render above the whole app regardless of
  // which screen/route is active (see overlays/OverlayProvider.tsx).
  return (
    <OverlayProvider>
      <RouterProvider router={router} />
      <OverlayHost />
    </OverlayProvider>
  );
}

export default App;
