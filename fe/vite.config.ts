import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { writeFileSync } from "node:fs";

// Compared at runtime (pwa-register.ts's checkBuildVersion) against a
// fetched-fresh dist/version.json to detect a stale service worker still
// serving an old precached app shell — see that file for why the SW's own
// update-install cycle alone isn't reliable enough on mobile.
const buildId = String(Date.now());

export default defineConfig({
  define: { __APP_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "emit-build-version",
      writeBundle() {
        writeFileSync(path.resolve(__dirname, "dist/version.json"), JSON.stringify({ buildId }));
      },
    },
    VitePWA({
      // "prompt", not "autoUpdate" — autoUpdate forces the new SW to
      // self-skipWaiting/clientsClaim immediately, which skips the
      // browser's `waiting` state entirely and with it the only code path
      // (`onNeedRefresh`, see src/pwa-register.ts) that lets us show an
      // "updating…" modal before the reload. We still want the update to
      // apply automatically with no real user-facing prompt — pwa-register.ts
      // calls the returned updateSW() itself the instant onNeedRefresh fires.
      registerType: "prompt",
      // We register the SW ourselves (src/pwa-register.ts) so we control
      // the update flow (blocking modal + reload) instead of the plugin's
      // own auto-injected script.
      injectRegister: null,
      manifest: {
        name: "MonthExpense",
        short_name: "MonthExpense",
        description: "Offline-first expense tracker with receipt scanning and voice entry.",
        theme_color: "#141811",
        background_color: "#141811",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/maskable-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Without this, a new SW activates but never takes over an
        // already-open window (self.clients.claim() never runs) — the
        // "controlling" event vite-plugin-pwa's client code waits on to
        // fire window.location.reload() then never fires, so
        // onNeedRefresh's updateSW() silently times out after 20s
        // (pwa-register.ts) and the open PWA keeps running old code
        // forever, until a full force-quit+relaunch. Doesn't change the
        // deliberate registerType:"prompt" flow — skipWaiting is still
        // only triggered by onNeedRefresh's explicit updateSW() call;
        // this only fixes what happens once that's already happened.
        clientsClaim: true,
        // ponytail: app shell is ~1MB, but the on-demand OCR chunks
        // (OpenCV.js ~10.5MB, PaddleOCR's worker-entry ~11.3MB) also match
        // **/*.js and would hard-fail the build under Workbox's default
        // 2MB ceiling. Scan is a core feature — worth precaching. Re-check
        // this ceiling if either dependency grows further.
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        // No same-origin *.wasm ships in dist anymore — PaddleOCR's
        // onnxruntime-web WASM loads from jsdelivr at runtime (see
        // ocr.config.ts) — kept as a broad safety net in case a future
        // dependency ships one bundled again.
        globIgnores: ["**/*.wasm"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith(".wasm"),
            handler: "CacheFirst",
            options: {
              cacheName: "wasm-runtime",
              expiration: { maxEntries: 8, maxAgeSeconds: 31536000 },
            },
          },
          {
            // PaddleOCR's onnxruntime-web WASM loads from jsdelivr (see
            // ocr.config.ts), not bundled locally — cache it so Scan keeps
            // working offline after first use.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web/,
            handler: "CacheFirst",
            options: {
              cacheName: "ort-cdn",
              expiration: { maxEntries: 8, maxAgeSeconds: 31536000 },
            },
          },
          {
            // PaddleOCR's det/rec model weights load from Baidu's BOS CDN at
            // runtime, not bundled locally — cache them the same way as the
            // onnxruntime-web CDN above so warmUpOcr() (App.tsx) resolves
            // instantly on repeat sessions instead of re-downloading
            // ~5-10MB every time.
            urlPattern: /^https:\/\/paddle-model-ecology\.bj\.bcebos\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "ocr-models",
              expiration: { maxEntries: 4, maxAgeSeconds: 31536000 },
            },
          },
        ],
      },
      // No browser tooling available this session to verify dev-mode SW
      // behavior — build-time verification only for now.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    // esbuild's dep pre-bundling doesn't understand this SDK's internal
    // `new Worker(new URL("./assets/worker-entry-*.js", import.meta.url))`
    // convention — pre-bundling it resolves that URL against the wrong
    // (.vite/deps) directory and the worker fails to load. Serve unbundled.
    exclude: ["@paddleocr/paddleocr-js"],
    // ...but its transitive CJS/UMD deps (no ESM default export) normally
    // get esbuild's CJS-interop shim via pre-bundling; excluding the parent
    // above stops that. Force them back into pre-bundling on their own so
    // their `import Foo from "..."` default imports still resolve.
    include: ["clipper-lib", "@techstark/opencv-js"],
  },
});
