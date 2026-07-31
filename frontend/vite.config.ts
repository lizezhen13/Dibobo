import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "DIBOBO_");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": env.DIBOBO_API_ORIGIN ?? "http://127.0.0.1:8000",
      },
    },
  };
});
