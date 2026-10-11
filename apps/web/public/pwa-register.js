/* Register independently of React hydration so crawlers and slow devices can install Creators. */
(() => {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  const register = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => {
        console.error("[Creators PWA] Service Worker registration failed", error);
        window.dispatchEvent(new Event("creators:pwa-registration-error"));
      });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", register, { once: true });
  } else {
    register();
  }
})();
