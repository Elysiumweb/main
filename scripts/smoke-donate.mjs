/**
 * Smoke test des boutons de don — exécute le bundle de production dans JSDOM.
 *
 *   node scripts/smoke-donate.mjs            # attend un serveur sur :4173
 *   BASE=http://localhost:3000 node ...      # autre origine
 *
 * Vérifie : rendu de la page /soutenir, présence des CTA (nav, footer, accueil),
 * chargement paresseux du SDK PayPal, rendu du bouton hébergé, et repli en cas
 * d'échec du SDK. Nécessite `npx serve -s build -l 4173` au préalable.
 */
import { JSDOM, VirtualConsole } from "jsdom";

const BASE = process.env.BASE || "http://localhost:4173";
const HOSTED_BUTTON_ID = "8R9PKMBPRB45N";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Charge une route de la SPA dans JSDOM en interceptant le script du SDK PayPal. */
async function loadRoute(path, { failSdk = false, lang = null } = {}) {
  const html = await (await fetch(`${BASE}${path}`)).text();
  const virtualConsole = new VirtualConsole();
  const logs = [];
  virtualConsole.on("jsdomError", (e) => logs.push(`jsdomError: ${e.message}`));
  virtualConsole.on("error", (...a) => logs.push(`error: ${a.join(" ")}`));
  virtualConsole.on("warn", (...a) => logs.push(`warn: ${a.join(" ")}`));

  const sdkRequests = [];
  const dom = new JSDOM(html, {
    url: `${BASE}${path}`,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      if (lang) {
        try { window.localStorage.setItem("elysium_lang", lang); } catch { /* stockage indisponible */ }
      }
      // JSDOM n'implémente pas IntersectionObserver : on déclenche immédiatement.
      window.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; }
        observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
        unobserve() {}
        disconnect() {}
        takeRecords() { return []; }
      };
      window.matchMedia = window.matchMedia || (() => ({
        matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      }));
      window.scrollTo = () => {};
      // Empêche tout appel réseau réel (Firebase, Discord, Twitch...).
      window.fetch = () => Promise.reject(new Error("network disabled in smoke test"));

      // Intercepte l'injection du <script> PayPal pour simuler le SDK.
      const origAppend = window.Node.prototype.appendChild;
      window.Node.prototype.appendChild = function (node) {
        if (node?.tagName === "SCRIPT" && String(node.src).includes("paypal.com/sdk/js")) {
          sdkRequests.push(node.src);
          node.setAttribute("data-intercepted", "true");
          setTimeout(() => {
            if (failSdk) {
              node.dispatchEvent(new window.Event("error"));
            } else {
              window.paypal = {
                HostedButtons: ({ hostedButtonId }) => ({
                  render: (sel) => {
                    const host = window.document.querySelector(sel);
                    if (!host) throw new Error(`conteneur introuvable: ${sel}`);
                    host.innerHTML = `<div data-paypal-mock="${hostedButtonId}">PayPal</div>`;
                    return Promise.resolve();
                  },
                }),
              };
              node.dispatchEvent(new window.Event("load"));
            }
          }, 10);
          return node; // n'exécute jamais le vrai SDK
        }
        return origAppend.call(this, node);
      };
    },
  });

  await new Promise((res) => {
    if (dom.window.document.readyState === "complete") res();
    else dom.window.addEventListener("load", res);
  });
  await sleep(700); // laisse React monter + le SDK simulé répondre
  return { dom, doc: dom.window.document, sdkRequests, logs };
}

const q = (doc, id) => doc.querySelector(`[data-testid="${id}"]`);
const text = (doc) => doc.body.textContent || "";

console.log(`\n=== Smoke dons — ${BASE} ===\n`);

// ---------------------------------------------------------------- /soutenir
console.log("Page /soutenir (SDK PayPal disponible)");
{
  const { dom, doc, sdkRequests } = await loadRoute("/soutenir");

  check("titre de page rendu", !!q(doc, "donate-title"));
  check("titre = 'Soutenir Elysium'", (q(doc, "donate-title")?.textContent || "").includes("Soutenir"));
  check("carte de don rendue", !!q(doc, "donate-card"));
  check("wrapper du bouton PayPal rendu", !!q(doc, "donate-page-paypal"));
  check("SDK PayPal demandé (chargement paresseux)", sdkRequests.length === 1, `${sdkRequests.length} requête(s)`);

  const url = sdkRequests[0] || "";
  check("SDK: components=hosted-buttons", url.includes("components=hosted-buttons"));
  check("SDK: currency=EUR", url.includes("currency=EUR"));
  check("SDK: disable-funding=venmo", url.includes("disable-funding=venmo"));
  check("SDK: client-id présent", url.includes("client-id=BAAbCu7rK1aJRGuvAviOgg98"));

  const mock = doc.querySelector("[data-paypal-mock]");
  check("bouton hébergé rendu dans le conteneur", !!mock);
  check("hostedButtonId correct", mock?.getAttribute("data-paypal-mock") === HOSTED_BUTTON_ID);

  const container = q(doc, "donate-paypal-container");
  check("conteneur visible une fois prêt", !container?.className.includes("sr-only"));
  check("spinner retiré une fois prêt", !q(doc, "donate-paypal-loading"));
  check("mention paiement sécurisé affichée", !!q(doc, "donate-page-secure-note"));
  check("mention cite PayPal", (q(doc, "donate-page-secure-note")?.textContent || "").includes("PayPal"));
  check("aucune clé i18n brute affichée", !text(doc).includes("donate."), "clé non traduite dans le DOM");
  check("bloc transparence rendu", !!q(doc, "donate-transparency"));
  check("mention légale association rendue", (q(doc, "donate-legal-note")?.textContent || "").includes("1901"));
  check("4 postes de dépense listés", doc.querySelectorAll('[data-testid^="donate-use-"]').length === 4);
  check("lien contact email présent", !!q(doc, "donate-contact-email"));
  check("CTA nav vers /soutenir", q(doc, "nav-donate-btn")?.getAttribute("href") === "/soutenir");
  check("lien footer vers /soutenir", q(doc, "footer-nav-donate")?.getAttribute("href") === "/soutenir");
  check("titre du document mis à jour (SEO)", doc.title.includes("Soutenir"));

  dom.window.close();
}

// -------------------------------------------------------- /soutenir (échec)
console.log("\nPage /soutenir (SDK PayPal bloqué → repli)");
{
  const { dom, doc } = await loadRoute("/soutenir", { failSdk: true });

  const fallback = q(doc, "donate-paypal-fallback-link");
  check("lien de repli affiché", !!fallback);
  check(
    "repli pointe vers la page PayPal hébergée",
    fallback?.getAttribute("href") === `https://www.paypal.com/ncp/payment/${HOSTED_BUTTON_ID}`,
    fallback?.getAttribute("href"),
  );
  check("repli ouvre un nouvel onglet en sécurité", fallback?.getAttribute("rel")?.includes("noopener"));
  check("message d'explication affiché", !!q(doc, "donate-paypal-fallback"));
  check("spinner retiré après échec", !q(doc, "donate-paypal-loading"));

  dom.window.close();
}

// ---------------------------------------------------------------- accueil
console.log("\nPage d'accueil");
{
  const { dom, doc, sdkRequests } = await loadRoute("/");

  check("bloc de don rendu sur l'accueil", !!q(doc, "home-donate-block"));
  check("bouton PayPal du bloc rendu", !!q(doc, "donate-block-paypal"));
  check("SDK chargé une seule fois", sdkRequests.length === 1, `${sdkRequests.length} requête(s)`);
  check("bouton hébergé rendu sur l'accueil", !!doc.querySelector("[data-paypal-mock]"));
  check("lien « en savoir plus » vers /soutenir", q(doc, "donate-block-more-link")?.getAttribute("href") === "/soutenir");
  check("CTA don présent dans la navigation", !!q(doc, "nav-donate-btn"));

  dom.window.close();
}

// ------------------------------------------ page sans don : aucun appel SDK
console.log("\nPage /resultats (aucun bouton de don)");
{
  const { dom, doc, sdkRequests } = await loadRoute("/resultats");

  check("aucun appel au SDK PayPal", sdkRequests.length === 0, `${sdkRequests.length} requête(s)`);
  check("aucun conteneur PayPal monté", !q(doc, "donate-paypal-container"));
  check("CTA don toujours accessible via la nav", !!q(doc, "nav-donate-btn"));

  dom.window.close();
}

// ------------------------------------------------------------ locale EN
console.log("\nPage /soutenir en anglais");
{
  const { dom, doc } = await loadRoute("/soutenir", { lang: "en" });

  check("titre traduit en anglais", (q(doc, "donate-title")?.textContent || "").includes("Support Elysium"));
  check("CTA nav traduit", (q(doc, "nav-donate-btn")?.textContent || "").includes("Support us"));
  check("mention sécurité traduite", (q(doc, "donate-page-secure-note")?.textContent || "").includes("Secure payment"));
  check("aucune clé i18n brute en anglais", !text(doc).includes("donate."));
  check("bouton hébergé rendu en anglais", !!doc.querySelector("[data-paypal-mock]"));

  dom.window.close();
}

console.log(`\n=== ${failures === 0 ? "TOUS LES TESTS PASSENT" : `${failures} ÉCHEC(S)`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
