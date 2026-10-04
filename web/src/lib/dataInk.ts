// Data accents (source/board colors from D1) are bright, tuned for the dark
// theme. As TEXT on a light surface they vanish, so mix them toward --ink by
// the theme's --data-mix (100% dark = unchanged, 45% light = >=4.5:1).
// Not for text on the dark rgba(0,0,0,.7) chips: use the raw accent there.
export const dataInk = (color: string) => `color-mix(in oklab, ${color} var(--data-mix), var(--ink))`;
