// /about — what RealUFO is; text shared with the Worker's crawler body.
import { ABOUT_HTML } from "../../../worker/lib/about";
import { LegalPage } from "./Privacy";

// The worker injects live D1 counts into {{STATS}} for crawlers; the SPA
// shows the static copy (counts live on /releases and /archive).
export default function About() {
  return <LegalPage title="About" html={ABOUT_HTML.replace("{{STATS}}", 'growing with every release — see <a href="/archive">the archive</a> for the live count')} />;
}
