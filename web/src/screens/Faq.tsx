// /faq — frequently asked questions; text shared with the Worker's crawler
// body (which also emits FAQPage JSON-LD from FAQ_ITEMS).
import { FAQ_HTML } from "../../../worker/lib/faq";
import { LegalPage } from "./Privacy";

export default function Faq() {
  return <LegalPage title="FAQ" html={FAQ_HTML} />;
}
