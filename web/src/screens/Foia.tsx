// /foia — how to file freedom-of-information requests for UAP records;
// text shared with the Worker's crawler body.
import { FOIA_HTML } from "../../../worker/lib/foia";
import { LegalPage } from "./Privacy";

export default function Foia() {
  return <LegalPage title="FOIA" html={FOIA_HTML} />;
}
