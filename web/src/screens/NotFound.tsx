import { Link } from "react-router-dom";
import { useSetPageTitle } from "../lib/pageTitle";

export default function NotFound() {
  useSetPageTitle("NOT FOUND", "");
  return (
    <div data-screen="not-found" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
      signal lost — no page at this address.
      <div className="mt-4 flex justify-center gap-4 text-signal">
        <Link to="/">home</Link>
        <Link to="/archive">archive</Link>
      </div>
    </div>
  );
}
