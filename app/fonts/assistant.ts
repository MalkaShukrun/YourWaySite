import localFont from "next/font/local";

// Assistant, kept in the repo rather than loaded with next/font/google: the
// build then never downloads it, so a Google Fonts outage can't fail a deploy.
// These are Google's own files: one variable font (weights 200–800) for each
// script, each used only for its characters (unicode-range) like Google's CSS.
// yourway.css stacks the three families; only the last has the Arial fallback,
// sized to match Assistant, so it stands in for all of them while they load.

const assistantHebrew = localFont({
  src: "./assistant-hebrew.woff2",
  weight: "200 800",
  variable: "--font-assistant-hebrew",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F" }],
});

// Accented Latin letters, rarely on the site, so not preloaded.
const assistantLatinExt = localFont({
  src: "./assistant-latin-ext.woff2",
  weight: "200 800",
  variable: "--font-assistant-latin-ext",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

const assistantLatin = localFont({
  src: "./assistant-latin.woff2",
  weight: "200 800",
  variable: "--font-assistant-latin",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

// The classes that define the three CSS variables, for <html>.
export const assistantVariables = [assistantHebrew.variable, assistantLatinExt.variable, assistantLatin.variable].join(" ");
