// /real-ufo — are UFOs real? What the declassified files show; text shared
// with the Worker's crawler body (worker/lib/realUfo.ts).
import { REAL_UFO_HTML } from "../../../worker/lib/realUfo";
import { LegalPage } from "./Privacy";

export default function RealUfo() {
  return <LegalPage title="Real UFO Files: Are UFOs Real?" html={REAL_UFO_HTML} />;
}
