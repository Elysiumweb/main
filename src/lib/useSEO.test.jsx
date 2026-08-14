/**
 * @jest-environment jsdom
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "./i18n";
import { useSEO, SITE_URL } from "./useSEO";

/**
 * useSEO écrit dans document.head via un effet. renderToStaticMarkup
 * n'exécute pas les effets, on rend donc dans un vrai conteneur jsdom.
 */
const { act } = require("react");
const { createRoot } = require("react-dom/client");

const Probe = (props) => {
  useSEO(props);
  return null;
};

const renderSEO = (props, { lang = "fr", route = "/" } = {}) => {
  window.localStorage.setItem("elysium_lang", lang);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={[route]}>
          <Probe {...props} />
        </MemoryRouter>
      </LanguageProvider>
    );
  });
  return () => act(() => root.unmount());
};

const head = () => ({
  htmlLang: document.documentElement.getAttribute("lang"),
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
  ogLocale: document.querySelector('meta[property="og:locale"]')?.getAttribute("content"),
  alternates: [...document.querySelectorAll('meta[property="og:locale:alternate"]')].map((m) =>
    m.getAttribute("content")
  ),
  hreflangs: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => [
    l.getAttribute("hreflang"),
    l.getAttribute("href"),
  ]),
});

beforeEach(() => {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("lang");
  window.localStorage.clear();
});

describe("useSEO — annotations de langue", () => {
  test("en français : og:locale fr_FR et alternate en_US", () => {
    const unmount = renderSEO({ title: "Accueil" }, { lang: "fr", route: "/" });
    const h = head();
    expect(h.htmlLang).toBe("fr");
    expect(h.ogLocale).toBe("fr_FR");
    expect(h.alternates).toEqual(["en_US"]);
    unmount();
  });

  test("en anglais : og:locale en_US et alternate fr_FR", () => {
    const unmount = renderSEO({ title: "Home" }, { lang: "en", route: "/" });
    const h = head();
    expect(h.htmlLang).toBe("en");
    expect(h.ogLocale).toBe("en_US");
    expect(h.alternates).toEqual(["fr_FR"]);
    unmount();
  });

  test("hreflang fr, en et x-default pointent vers l'URL canonique", () => {
    const unmount = renderSEO({ title: "Résultats" }, { lang: "fr", route: "/resultats" });
    const h = head();
    const expected = `${SITE_URL}/resultats`;
    expect(h.canonical).toBe(expected);
    expect(h.hreflangs).toEqual([
      ["fr", expected],
      ["en", expected],
      ["x-default", expected],
    ]);
    unmount();
  });

  test("aucune balise hreflang sur une page noindex", () => {
    const unmount = renderSEO({ title: "Connexion", noIndex: true }, { lang: "fr", route: "/connexion" });
    expect(head().hreflangs).toEqual([]);
    expect(document.querySelector('meta[name="robots"]').getAttribute("content")).toBe("noindex,nofollow");
    unmount();
  });

  test("changer de langue ne duplique pas les balises alternate", () => {
    const unmountFr = renderSEO({ title: "Accueil" }, { lang: "fr", route: "/" });
    unmountFr();
    const unmountEn = renderSEO({ title: "Home" }, { lang: "en", route: "/" });
    const h = head();
    expect(h.alternates).toEqual(["fr_FR"]);
    expect(h.hreflangs).toHaveLength(3);
    unmountEn();
  });
});
