// /pursue — what PURSUE is and where the archive's files come from; text
// shared with the Worker's crawler body (worker/lib/pursue.ts).
import { PURSUE_HTML } from "../../../worker/lib/pursue";
import { LegalPage } from "./Privacy";

export default function Pursue() {
  return <LegalPage title="What is PURSUE?" html={PURSUE_HTML} />;
}
