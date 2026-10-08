// /sites — UFO field guide: the places behind the files;
// text shared with the Worker's crawler body.
import { SITES_HTML } from "../../../worker/lib/sites";
import { LegalPage } from "./Privacy";

export default function Sites() {
  return <LegalPage title="UFO FIELD GUIDE" html={SITES_HTML} />;
}
