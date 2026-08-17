import { $store } from "@kallojs/runtime";

// Dark-mode store: persists the choice and toggles the `dark` class on <html>,
// which flips the CSS variables defined in global.css.
export const useTheme = $store({
  isDark: false,

  init() {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("theme");
    this.isDark = saved
      ? saved === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    this.apply();
  },

  toggle() {
    this.isDark = !this.isDark;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", this.isDark ? "dark" : "light");
    }
    this.apply();
  },

  apply() {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", this.isDark);
  },
});
