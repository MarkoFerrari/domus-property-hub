import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./lib/auth";
import { BASE_PATH } from "./lib/basePath";
import { StoreProvider } from "./lib/store";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* basename strips the /domus-property-hub/ prefix before matching routes,
          so <Route path="/dashboard"> keeps working on GitHub Pages unchanged. */}
      <BrowserRouter basename={BASE_PATH}>
        <AuthProvider>
          <StoreProvider>
            <App />
            <Toaster
              position="bottom-right"
              toastOptions={{ style: { fontFamily: "Manrope, sans-serif", fontSize: 14 } }}
            />
          </StoreProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
