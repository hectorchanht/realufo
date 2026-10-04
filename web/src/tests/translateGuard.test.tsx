import { expect, test } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { guardTranslatedDom } from "../lib/translateGuard";

// Chrome/Google page translate swaps React's text nodes for <font> wrappers; React's
// next update then removeChild/insertBefore()s a node that is no longer there and
// the whole app crashes (NotFoundError, facebook/react#11538).
function translate(el: Element) {
  for (const n of [...el.childNodes]) {
    if (n.nodeType !== Node.TEXT_NODE) continue;
    const font = document.createElement("font");
    font.textContent = `[${n.textContent}]`;
    n.replaceWith(font);
  }
}

test("a translated page survives React removing and inserting around swapped text", () => {
  guardTranslatedDom();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let flip!: () => void;
  function T() {
    const [loaded, setLoaded] = useState(false);
    flip = () => setLoaded(true);
    // loading → loaded: removes one text node, inserts a span before another
    return (
      <div id="t">
        {loaded ? null : "loading"}
        {loaded ? <span>new</span> : null}
        {"tail"}
      </div>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<T />));
  translate(host.querySelector("#t")!);
  expect(() => act(() => flip())).not.toThrow();
  expect(host.textContent).toContain("new");
  act(() => root.unmount());
});
