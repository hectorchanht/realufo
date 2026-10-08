// /contact — reach the team; text shared with the Worker's crawler body.
import { CONTACT_HTML } from "../../../worker/lib/contact";
import { LegalPage } from "./Privacy";

export default function Contact() {
  return <LegalPage title="Contact" html={CONTACT_HTML} />;
}
