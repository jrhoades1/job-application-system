import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, readdirSync } from "fs";

// Plugin to copy static files to dist after build
function copyStaticFiles() {
  return {
    name: "copy-static",
    closeBundle() {
      const dist = resolve(__dirname, "dist");

      // Copy manifest.json
      copyFileSync(resolve(__dirname, "manifest.json"), resolve(dist, "manifest.json"));

      // Copy popup.html
      copyFileSync(resolve(__dirname, "src/popup/popup.html"), resolve(dist, "popup.html"));

      // Copy content.css
      copyFileSync(resolve(__dirname, "src/content/content.css"), resolve(dist, "content.css"));

      // Copy icons
      const iconsDir = resolve(dist, "icons");
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
      const srcIcons = resolve(__dirname, "public/icons");
      if (existsSync(srcIcons)) {
        for (const file of readdirSync(srcIcons)) {
          copyFileSync(resolve(srcIcons, file), resolve(iconsDir, file));
        }
      }
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        popup: resolve(__dirname, "src/popup/popup.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name].[ext]",
        format: "es",
      },
    },
    target: "chrome120",
    minify: false,
    sourcemap: "inline",
  },
  plugins: [copyStaticFiles()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
