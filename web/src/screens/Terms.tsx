// /terms — static terms of use; text shared with the Worker's crawler body.
import { TERMS_HTML } from "../../../worker/lib/terms";
import { LegalPage } from "./Privacy";

export default function Terms() {
  return <LegalPage title="Terms" html={TERMS_HTML} />;
}
