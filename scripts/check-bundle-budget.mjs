#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const manifestPath = "build/asset-manifest.json";
if (!existsSync(manifestPath)) {
  console.error("[bundle] build/asset-manifest.json introuvable. Lancez npm run build avant le contrôle de budget.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entrypoints = (manifest.entrypoints || []).filter((entry) => /\.(js|css)$/.test(entry));
const assets = entrypoints.map((entry) => {
  const file = path.join("build", entry);
  const raw = statSync(file).size;
  const gzip = gzipSync(readFileSync(file)).length;
  return { entry, raw, gzip };
});

const jsGzip = assets.filter((asset) => asset.entry.endsWith(".js")).reduce((sum, asset) => sum + asset.gzip, 0);
const cssGzip = assets.filter((asset) => asset.entry.endsWith(".css")).reduce((sum, asset) => sum + asset.gzip, 0);
const jsBudget = Number(process.env.BUNDLE_ENTRYPOINT_JS_GZIP_BUDGET_KB || 430) * 1024;
const cssBudget = Number(process.env.BUNDLE_ENTRYPOINT_CSS_GZIP_BUDGET_KB || 80) * 1024;

console.table(assets.map((asset) => ({
  asset: asset.entry,
  rawKiB: (asset.raw / 1024).toFixed(1),
  gzipKiB: (asset.gzip / 1024).toFixed(1),
})));
console.log(`[bundle] JS initial gzip ${(jsGzip / 1024).toFixed(1)} KiB / budget ${(jsBudget / 1024).toFixed(0)} KiB`);
console.log(`[bundle] CSS initial gzip ${(cssGzip / 1024).toFixed(1)} KiB / budget ${(cssBudget / 1024).toFixed(0)} KiB`);

const failures = [];
if (jsGzip > jsBudget) failures.push(`JS initial gzip ${(jsGzip / 1024).toFixed(1)} KiB > budget ${(jsBudget / 1024).toFixed(0)} KiB`);
if (cssGzip > cssBudget) failures.push(`CSS initial gzip ${(cssGzip / 1024).toFixed(1)} KiB > budget ${(cssBudget / 1024).toFixed(0)} KiB`);

if (failures.length) {
  failures.forEach((failure) => console.error(`[bundle] ${failure}`));
  process.exit(1);
}
