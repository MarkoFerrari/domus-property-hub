import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
    // GitHub Pages serves this repo from https://<user>.github.io/domus-property-hub/,
    // not from the domain root, so every asset URL needs that prefix baked in.
    // Vite exposes this to the app as import.meta.env.BASE_URL (always ends in "/").
    //
    // If Domus ever moves to a custom domain or a root-level host, change this
    // single line to "/" and everything else follows, because the app reads
    // BASE_URL rather than hardcoding the prefix. See src/lib/basePath.ts.
    base: "/domus-property-hub/",
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: { port: 5173, open: true },
});
