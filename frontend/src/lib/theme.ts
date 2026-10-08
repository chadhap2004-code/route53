// Visual-mode constants shared by the ThemeProvider (client) and the root layout (server).
// A plain module: constants exported from a "use client" file can't be read by a server component.

export type VisualMode = "system" | "light" | "dark";

export const VISUAL_MODE_KEY = "r53.visualMode";
export const OLD_DARK_KEY = "r53.dark"; // the earlier light/dark boolean, still honoured
export const DARK_QUERY = "(prefers-color-scheme: dark)";

// Runs at the top of <body>, before the page paints, so a dark page doesn't flash white on load.
// Same rules as savedMode() in components/Theme.tsx, without React.
export const THEME_SCRIPT = `try{var m=JSON.parse(localStorage.getItem("${VISUAL_MODE_KEY}")||"null");
if(m!=="system"&&m!=="light"&&m!=="dark")m=JSON.parse(localStorage.getItem("${OLD_DARK_KEY}")||"false")?"dark":"light";
if(m==="dark"||(m==="system"&&matchMedia("${DARK_QUERY}").matches))document.body.classList.add("awsui-dark-mode")}catch(e){}`;
