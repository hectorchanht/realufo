import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { OverlayProvider } from "./overlays/OverlayProvider";

function App() {
  // OverlayProvider wraps the router so its context flows down through
  // RouterProvider to every screen — any screen can call useOverlay() to open
  // the Composer/MediaViewer/LoginSheet. <OverlayHost/> is rendered INSIDE the
  // router tree (in AppShell), NOT here as a RouterProvider sibling: the
  // Composer calls useNavigate() and must have a <Router> ancestor, so hosting
  // the overlays outside the router crashed the app on composer open.
  return (
    <OverlayProvider>
      <RouterProvider router={router} />
    </OverlayProvider>
  );
}

export default App;
