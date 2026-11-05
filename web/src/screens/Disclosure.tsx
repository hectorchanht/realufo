// /disclosure — UAP disclosure: the official timeline, year by year;
// text shared with the Worker's crawler body (worker/lib/disclosure.ts).
import { DISCLOSURE_HTML } from "../../../worker/lib/disclosure";
import { LegalPage } from "./Privacy";

export default function Disclosure() {
  return <LegalPage title="UAP Disclosure: The Official Timeline" html={DISCLOSURE_HTML} />;
}
