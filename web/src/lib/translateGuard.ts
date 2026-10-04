// Browser page translation (Chrome/Google Translate) replaces React's text nodes with
// <font> wrappers. React's next update then calls removeChild/insertBefore with a node
// that is no longer a child, throws NotFoundError and the whole app crashes — seen on
// Chrome Android with auto-translate on the first archive/doc render. Tolerate the
// detached node instead (facebook/react#11538).
// ponytail: the translated <font> copy of a removed text node can linger on screen until
// the next re-render of its parent; acceptable vs. a crash.
export function guardTranslatedDom() {
  const proto = Node.prototype;
  const removeChild = proto.removeChild;
  const insertBefore = proto.insertBefore;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };
  proto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    // Reference node was swapped out: append rather than drop the new content.
    return insertBefore.call(this, node, ref && ref.parentNode !== this ? null : ref) as T;
  };
}
