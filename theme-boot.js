(() => {
  "use strict";
  try {
    const savedTheme = localStorage.getItem("data-cleaner-theme");
    const theme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  } catch {
    // The default light theme remains usable when storage or media queries are unavailable.
  }
})();
