// /glossary — UAP terms, agencies and file references; text shared with the
// Worker's crawler body.
import { GLOSSARY_HTML } from "../../../worker/lib/glossary";
import { LegalPage } from "./Privacy";

export default function Glossary() {
  return <LegalPage title="Glossary" html={GLOSSARY_HTML} />;
}
