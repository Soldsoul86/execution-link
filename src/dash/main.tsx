import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Dash from "./Dash";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dash />
  </StrictMode>,
);
