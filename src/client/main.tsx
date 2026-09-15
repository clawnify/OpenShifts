import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

// Agent mode grows every target and unhides anything that would otherwise only
// appear on hover. Set before first paint so nothing reflows.
const params = new URLSearchParams(window.location.search);
if (params.has("agent") || params.get("mode") === "agent") {
  document.documentElement.setAttribute("data-agent", "");
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
