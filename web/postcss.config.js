import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// Text sizes are written in px (text-[15px]); pxToRem turns every px font-size and
// line-height into rem so the footer text sizer (html font-size %, ThemeProvider)
// scales all text. Same rendering at 100%.
const pxToRem = {
  postcssPlugin: "px-to-rem-text",
  Declaration(decl) {
    if (decl.prop !== "font-size" && decl.prop !== "line-height") return;
    decl.value = decl.value.replace(/(\d*\.?\d+)px\b/g, (_, n) => `${+(n / 16).toFixed(4)}rem`);
  },
};

export default {
  plugins: [tailwindcss, pxToRem, autoprefixer],
}
