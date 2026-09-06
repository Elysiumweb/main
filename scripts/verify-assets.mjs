#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const failures = [];
const warn = [];
const textExtensions = new Set([".js", ".jsx", ".css", ".html", ".json", ".md", ".mjs", ".txt"]);
const ignored = new Set(["node_modules", ".git", "build"]);

const walk = (dir) => {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
};

for (const file of walk(".")) {
  const ext = path.extname(file);
  if (!textExtensions.has(ext)) continue;
  const text = readFileSync(file, "utf8");
  if (/pattern\.png/.test(text) && !file.includes("exploitation-runbook") && !file.endsWith("scripts/verify-assets.mjs")) {
    failures.push(`${file} référence encore pattern.png au lieu du SVG léger`);
  }
}

for (const file of walk("public")) {
  const size = statSync(file).size;
  if (size > 750_000 && !/press-kit|charte-elysium\.pdf/.test(file)) {
    warn.push(`${file} pèse ${(size / 1024).toFixed(1)} KiB — vérifier qu'il n'est pas chargé dans le chemin critique`);
  }
}

if (warn.length) {
  console.warn("Contrôle assets — avertissements :");
  warn.forEach((item) => console.warn(`- ${item}`));
}

if (failures.length) {
  console.error("Contrôle assets échoué :");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("[assets] OK — aucune référence critique à pattern.png.");
