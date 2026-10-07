// DJ desk layout: the instrument console. DJ deck on wide screens (everything
// visible at once), Walkman on phones (one-thumb use). Same tools either way.
import { useMediaQuery } from "../../lib/useMediaQuery";
import { DjBody } from "./DjBody";
import { WalkmanBody } from "./WalkmanBody";
import type { ConsoleProps } from "./MediaConsole";

export function ChabanBody(p: ConsoleProps) {
  const wide = useMediaQuery("(min-width: 900px)");
  return wide ? <DjBody {...p} /> : <WalkmanBody {...p} />;
}
