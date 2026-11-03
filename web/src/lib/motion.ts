/** Smooth scrolling unless the visitor asked for reduced motion (the CSS
 *  reduced-motion rule can't reach JS `scrollTo({behavior})` calls). */
export function scrollBehavior(): ScrollBehavior {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
