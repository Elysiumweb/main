/* Smoke test rapide — charge les routes principales dans JSDOM et remonte les erreurs JS. */
import { JSDOM, VirtualConsole } from "jsdom";

const BASE = process.env.BASE || "http://localhost:4173";
const ROUTES = [
  "/", "/resultats", "/actus", "/actus/aucun", "/calendrier", "/competitions",
  "/a-propos", "/presse", "/support", "/statistiques", "/equipe", "/medias",
  "/soutenir", "/recrutement", "/partenaires", "/connexion",
];

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const path of ROUTES) {
  let html = "";
  try {
    html = await (await fetch(`${BASE}${path}`)).text();
  } catch (e) {
    check(`GET ${path}`, false, e.message);
    continue;
  }
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on("jsdomError", (e) => errors.push(`jsdomError: ${e.message}`));
  virtualConsole.on("error", (...a) => errors.push(`error: ${a.join(" ")}`));

  const dom = new JSDOM(html, {
    url: `${BASE}${path}`,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; }
        observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
        unobserve() {}
        disconnect() {}
        takeRecords() { return []; }
      };
      // localStorage indisponible par défaut dans certains cas
      try { window.localStorage.setItem("smoke", "1"); } catch { /* ignore */ }
    },
  });

  // Laisse le temps au bundle de s'exécuter
  await sleep(1200);

  const bodyText = dom.window.document.body ? dom.window.document.body.textContent : "";
  const fatal = errors.filter((e) => !/favicon|net::|404|Failed to load resource|Could not load/i.test(e));
  check(`route ${path} sans erreur JS`, fatal.length === 0, fatal.slice(0, 3).join(" | "));
  check(`route ${path} contenu rendu`, bodyText.replace(/\s+/g, " ").trim().length > 40, "corps vide");
  dom.window.close();
}

console.log(failures === 0 ? "\n=== TOUS LES TESTS PASSENT ===" : `\n=== ${failures} ÉCHEC(S) ===`);
process.exit(failures === 0 ? 0 : 1);
