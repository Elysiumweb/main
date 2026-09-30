/**
 * Garde-fou anti-régression « X is not defined ».
 * ----------------------------------------------------------------------------
 * Le build CRA de ce dépôt n'exécute pas ESLint (ESLint 9 sans config flat
 * n'est pas pris en charge par react-scripts) : un identifiant utilisé mais
 * jamais importé passe donc le build et crashe en production
 * (ex réel : « NewsletterArchives is not defined », « useSearchParams »).
 *
 * Ce test analyse statiquement les portées de tous les fichiers src/ et
 * functions/ avec espree + eslint-scope — le même mécanisme que la règle
 * ESLint `no-undef` — et échoue au premier identifiant non résolu.
 *
 * Si l'échec provient d'un global légitime (API navigateur peu courante…),
 * l'ajouter à la liste ALLOW ci-dessous.
 */
import fs from "fs";
import path from "path";
import * as espree from "espree";
import * as escope from "eslint-scope";

const ALLOW = new Set([
  // Builtins JS + Node (Date, Promise, console, setTimeout, fetch, crypto…)
  ...Object.getOwnPropertyNames(globalThis),
  // Globals navigateur absents de Node
  "window", "document", "localStorage", "sessionStorage", "navigator", "location",
  "history", "grecaptcha", "serviceWorker", "caches", "Clients", "importScripts",
  "self", "Image", "Audio", "WebSocket", "Worker", "HTMLElement", "Event",
  "CustomEvent", "IntersectionObserver", "MutationObserver", "ResizeObserver",
  "matchMedia", "getComputedStyle", "scrollTo", "scrollBy", "alert", "confirm",
  "prompt", "open", "close", "screen", "customElements", "reportError",
  "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame", "FileReader",
  "KeyboardEvent", "Notification", "crypto",
  // Environnement de test (Jest)
  "jest", "describe", "it", "test", "expect", "beforeEach", "afterEach",
  "beforeAll", "afterAll", "xdescribe", "xit", "xtest", "IS_REACT_ACT_ENVIRONMENT",
  // Node / CommonJS (modules functions/)
  "process", "require", "module", "exports", "Buffer", "global",
  "__dirname", "__filename",
]);

/** Liste récursive des fichiers .js/.jsx d'un dossier (sans node_modules). */
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
};

const ROOT = path.resolve(__dirname, "../..");

const collectOffenders = () => {
  const offenders = [];
  for (const file of [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "functions"))]) {
    const code = fs.readFileSync(file, "utf8");
    let ast;
    try {
      // Tout en mode module : les fichiers CommonJS (functions/) restent
      // syntaxiquement valides, require/module/exports sont sur liste blanche.
      ast = espree.parse(code, {
        sourceType: "module",
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        range: true,
      });
    } catch (e) {
      offenders.push(`${file} : erreur de syntaxe — ${e.message}`);
      continue;
    }
    const scopeManager = escope.analyze(ast, {
      ecmaVersion: 2024,
      sourceType: "module",
      ignoreEval: true,
    });
    // Seul le scope global porte les références réellement non résolues.
    const bad = new Set();
    for (const ref of scopeManager.globalScope.through) {
      if (!ALLOW.has(ref.identifier.name)) bad.add(ref.identifier.name);
    }
    if (bad.size) {
      offenders.push(`${path.relative(ROOT, file)} : ${[...bad].sort().join(", ")}`);
    }
  }
  return offenders;
};

describe("aucune référence non définie (anti « X is not defined »)", () => {
  test("tous les identifiants utilisés dans src/ et functions/ sont définis ou importés", () => {
    const offenders = collectOffenders();
    if (offenders.length > 0) {
      throw new Error(
        `Identifiants utilisés mais jamais définis (${offenders.length} fichier(s)) :\n` +
          offenders.map((o) => `  - ${o}`).join("\n") +
          "\n→ importer la valeur manquante, ou ajouter le global à ALLOW s'il est légitime."
      );
    }
    expect(offenders).toEqual([]);
  });
});
