import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { ErrorBoundary } from "./components/error-boundary";
import { sessionQueryKey } from "./features/auth/queries";
import { clearUserScopedQueryCache } from "./lib/query-cache";
import { LiveQueryVisibilityManager } from "./lib/query-lifecycle";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnReconnect: true,
    },
  },
});

window.addEventListener("dibobo:unauthorized", () => {
  clearUserScopedQueryCache(queryClient);
  queryClient.setQueryData(sessionQueryKey, null);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LiveQueryVisibilityManager />
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
