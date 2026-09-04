import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: register the service worker in production builds only.
if (!import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
