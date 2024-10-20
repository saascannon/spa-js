import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Configuration for the browser version with dependencies
    entry: ["src/index.ts"],
    outDir: "dist/browser", // Output for browser build
    name: "SaascannonSpaSdk",
    globalName: "SaascannonSpaSdk",
    clean: true,
    format: ["iife"],
    platform: "browser",
    minify: true,
    external: [], // No external, bundle all dependencies
    noExternal: ["@saascannon/account-management-js", "oauth4webapi"],
    splitting: true,
    cjsInterop: true,
    bundle: true,
    esbuildOptions(options) {
      // Customize esbuild options to avoid assigning to default
      options.globalName = "SaascannonSpaSdk";
      options.footer = {
        // Ensure the default export is directly assigned to the global scope
        js: `window.SaascannonSpaSdk = SaascannonSpaSdk.default || SaascannonSpaSdk;`,
      };
    },
  },
  {
    // Configuration for the build without dependencies (Node.js or server-side)
    entry: ["src/index.ts"],
    outDir: "dist/node", // Output for the non-browser build
    format: ["esm", "cjs"], // Use the appropriate format for server build
    target: "node14", // Target node environment
    platform: "node",
    sourcemap: false,
    dts: true, // Generate .d.ts files
    noExternal: ["@saascannon/account-management-js"],
  },
]);
