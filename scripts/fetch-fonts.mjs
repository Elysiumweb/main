/**
 * Télécharge les polices Orbitron + Rajdhani (woff2, subset latin) depuis
 * Google Fonts et les écrit dans public/fonts/.
 *
 *   npm run fonts
 *
 * À lancer dans un environnement avec accès réseau (CI ou machine locale)
 * APRÈS l'ajout de nouveaux fichiers à la charte. Les polices sont ensuite
 * servies localement par public/fonts — aucune requête vers Google Fonts
 * dans le navigateur (voir src/index.css).
 *
 * Idempotent : ne réécrit que les fichiers manquants ou différents.
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "public", "fonts");

// User-Agent moderne pour obtenir le format woff2 dans la réponse CSS.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FAMILIES = [
  { family: "Orbitron", weights: [400, 500, 600, 700, 800, 900] },
  { family: "Rajdhani", weights: [300, 400, 500, 600, 700] },
];

const slug = (family) => family.toLowerCase().replace(/\s+/g, "-");

async function fetchWoff2(family, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  const res = await fetch(cssUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Google Fonts CSS ${res.status} pour ${family} ${weight}`);
  const css = await res.text();
  // On cible le bloc latin (défini par le commentaire /* latin */).
  const blocks = css.split("@font-face").filter((b) => /\/\* latin \*\//.test(b));
  const match = blocks[0]?.match(/url\((https:[^)]+\.woff2)\)/);
  if (!match) throw new Error(`Aucune URL woff2 pour ${family} ${weight}`);
  const bin = await (await fetch(match[1])).arrayBuffer();
  return Buffer.from(bin);
}

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  let written = 0;
  let skipped = 0;
  for (const { family, weights } of FAMILIES) {
    for (const weight of weights) {
      const file = path.join(OUT, `${slug(family)}-latin-${weight}.woff2`);
      try {
        const bin = await fetchWoff2(family, weight);
        if (existsSync(file) && readFileSync(file).equals(bin)) {
          skipped += 1;
        } else {
          writeFileSync(file, bin);
          written += 1;
          console.log(`[fonts] ${path.basename(file)} (${bin.length} octets)`);
        }
      } catch (err) {
        console.warn(`[fonts] ${family} ${weight} : ${err.message}`);
      }
    }
  }
  console.log(`[fonts] Terminé : ${written} téléchargé(s), ${skipped} inchangé(s), dans ${OUT}`);
  if (written === 0 && skipped === 0) process.exit(1);
};

main().catch((err) => {
  console.error("[fonts] Erreur :", err);
  process.exit(1);
});
