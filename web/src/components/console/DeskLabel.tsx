// Text label inside a tool button, shown on desktop (fine pointer) only.
// Icon-only buttons are hard to get started with; on a phone there is no
// room, so the icons stand alone there (tooltips + help panel cover it).
import type { ReactNode } from "react";

export function DeskLabel({ children }: { children: ReactNode }) {
  return <span className="hidden font-medium [@media(pointer:fine)]:inline">{children}</span>;
}
