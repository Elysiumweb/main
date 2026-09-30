import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, extractHeadings } from "./markdown";
import {
  readingTimeMinutes,
  parseTags,
  relatedArticles,
  localizedArticle,
  articleMatchesQuery,
  articleAuthor,
  isTranslated,
} from "./articles";

const words = (n) => Array.from({ length: n }, (_, i) => `mot${i}`).join(" ");

describe("readingTimeMinutes", () => {
  test("aucun contenu → 0 minute", () => {
    expect(readingTimeMinutes("")).toBe(0);
    expect(readingTimeMinutes(null)).toBe(0);
  });

  test("court contenu → minimum 1 minute", () => {
    expect(readingTimeMinutes("Bonjour tout le monde.")).toBe(1);
  });

  test("200 mots ≈ 1 minute, 401 mots ≈ 3 minutes (arrondi supérieur)", () => {
    expect(readingTimeMinutes(words(200))).toBe(1);
    expect(readingTimeMinutes(words(401))).toBe(3);
  });

  test("le markdown est nettoyé avant comptage", () => {
    expect(readingTimeMinutes(`# Titre\n\n**${words(50)}**`)).toBe(1);
  });
});

describe("parseTags", () => {
  test("chaîne CSV avec espaces, # et doublons", () => {
    expect(parseTags("lan, Finale , #EVA, finale, eva")).toEqual(["lan", "Finale", "EVA"]);
  });

  test("tableau en entrée", () => {
    expect(parseTags(["Interview", "", "Lan"])).toEqual(["Interview", "Lan"]);
  });

  test("vide / null → tableau vide", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(",,,")).toEqual([]);
  });

  test("maximum 8 tags conservés", () => {
    const tags = parseTags("a,b,c,d,e,f,g,h,i,j");
    expect(tags).toHaveLength(8);
    expect(tags[0]).toBe("a");
  });

  test("tag tronqué à 30 caractères", () => {
    expect(parseTags("x".repeat(40))[0]).toHaveLength(30);
  });
});

describe("relatedArticles", () => {
  const base = { id: "a", status: "published", title: "A", tags: ["lan", "eva"], category: "behind", publishedAt: { seconds: 100 } };

  test("score par tags partagés puis catégorie, hors auto-référence et non publiés", () => {
    const current = { ...base };
    const withTags = { id: "b", status: "published", title: "B", tags: ["lan", "eva"], category: "behind", publishedAt: { seconds: 50 } };
    const sameCat = { id: "c", status: "published", title: "C", tags: [], category: "behind", publishedAt: { seconds: 900 } };
    const draft = { id: "d", status: "draft", title: "D", tags: ["lan"], category: "behind" };
    const scheduled = { id: "e", status: "scheduled", title: "E", tags: ["lan", "eva"], category: "behind" };
    const deleted = { id: "f", status: "deleted", title: "F", tags: ["lan", "eva"], category: "behind" };

    const related = relatedArticles(current, [current, withTags, sameCat, draft, scheduled, deleted], { limit: 2 });
    expect(related.map((a) => a.id)).toEqual(["b", "c"]);
  });

  test("repli sur les plus récents quand aucun point commun", () => {
    const current = { ...base, tags: ["x"], category: "interview" };
    const others = [
      { id: "old", status: "published", title: "O", publishedAt: { seconds: 10 } },
      { id: "new", status: "published", title: "N", publishedAt: { seconds: 99 } },
    ];
    expect(relatedArticles(current, others, { limit: 2 }).map((a) => a.id)).toEqual(["new", "old"]);
  });

  test("sans article courant → liste vide", () => {
    expect(relatedArticles(null, [base])).toEqual([]);
  });
});

describe("localizedArticle / isTranslated", () => {
  const article = {
    title: "Titre FR",
    excerpt: "Extrait FR",
    content: "Contenu FR",
    titleEn: "Title EN",
    excerptEn: "Excerpt EN",
    contentEn: "Content EN",
  };

  test("mode FR : version française", () => {
    const l = localizedArticle(article, "fr");
    expect(l.title).toBe("Titre FR");
    expect(l.translated).toBe(true);
  });

  test("mode EN avec traduction complète : version anglaise", () => {
    const l = localizedArticle(article, "en");
    expect(l.title).toBe("Title EN");
    expect(l.content).toBe("Content EN");
    expect(l.translated).toBe(true);
    expect(isTranslated(article)).toBe(true);
  });

  test("mode EN sans traduction : repli FR + badge non traduit", () => {
    const frOnly = { title: "Titre FR", content: "Contenu FR" };
    const l = localizedArticle(frOnly, "en");
    expect(l.title).toBe("Titre FR");
    expect(l.content).toBe("Contenu FR");
    expect(l.translated).toBe(false);
    expect(isTranslated(frOnly)).toBe(false);
  });

  test("traduction partielle (contenu EN sans titre) : considérée non traduite", () => {
    const partial = { ...article, titleEn: "" };
    expect(isTranslated(partial)).toBe(false);
    const l = localizedArticle(partial, "en");
    expect(l.title).toBe("Titre FR");
    expect(l.translated).toBe(false);
  });
});

describe("articleMatchesQuery", () => {
  const article = { title: "Finale de la LAN de Lyon", content: "L'équipe s'impose 3-1", tags: ["lan", "finale"] };

  test("insensible à la casse et aux accents", () => {
    expect(articleMatchesQuery(article, "FINALE")).toBe(true);
    expect(articleMatchesQuery(article, "équipe")).toBe(true);
    expect(articleMatchesQuery(article, "impose")).toBe(true);
  });

  test("plusieurs termes : tous doivent être présents", () => {
    expect(articleMatchesQuery(article, "finale lyon")).toBe(true);
    expect(articleMatchesQuery(article, "finale paris")).toBe(false);
  });

  test("les tags sont cherchés aussi", () => {
    expect(articleMatchesQuery({ title: "x", content: "", tags: ["bootcamp"] }, "bootcamp")).toBe(true);
  });

  test("requête vide → toujours vrai", () => {
    expect(articleMatchesQuery(article, "   ")).toBe(true);
  });
});

describe("articleAuthor", () => {
  test("auteur défini", () => {
    expect(articleAuthor({ author: "Jane Doe" })).toBe("Jane Doe");
  });
  test("repli sur la rédaction", () => {
    expect(articleAuthor({})).toBe("Rédaction Elysium");
    expect(articleAuthor({ author: "   " }, "Fallback")).toBe("Fallback");
  });
});

describe("extractHeadings / ancres Markdown", () => {
  const source = [
    "# Titre principal",
    "",
    "## Le bootcamp EVA",
    "texte",
    "### Jour 1",
    "## Le bootcamp EVA",
    "",
    "```",
    "## pas un titre",
    "```",
    "> ## citation non comptée",
  ].join("\n");

  test("h2/h3 uniquement, code et citations ignorés, doublons suffixés", () => {
    const headings = extractHeadings(source);
    expect(headings.map((h) => h.text)).toEqual(["Le bootcamp EVA", "Jour 1", "Le bootcamp EVA"]);
    expect(headings[0].id).toBe("le-bootcamp-eva");
    expect(headings[2].id).toBe("le-bootcamp-eva-2");
    expect(headings[1].level).toBe(3);
  });

  test("filtrer par niveaux", () => {
    expect(extractHeadings(source, { minLevel: 3, maxLevel: 3 }).map((h) => h.text)).toEqual(["Jour 1"]);
  });

  test("les ids rendus par <Markdown/> correspondent au sommaire", () => {
    const html = renderToStaticMarkup(<Markdown source={source} />);
    const anchors = extractHeadings(source, { minLevel: 1, maxLevel: 6 }).map((h) => h.id);
    anchors.forEach((id) => expect(html).toContain(`id="${id}"`));
    // Le pseudo-titre du bloc de code ne doit pas recevoir d'ancre de titre.
    expect(html).not.toContain('id="pas-un-titre"');
  });

  test("texte sans titres → tableau vide", () => {
    expect(extractHeadings("Juste du texte.")).toEqual([]);
  });
});

describe("interpolation i18n (t)", () => {
  test("les jetons {name} sont remplacés", () => {
    // Simule le comportement de t(key, params) dans lib/i18n.js.
    const raw = "{min} min de lecture";
    const render = (params) =>
      String(raw).replace(/\{(\w+)\}/g, (_, name) =>
        params[name] !== undefined && params[name] !== null ? String(params[name]) : `{${name}}`
      );
    expect(render({ min: 4 })).toBe("4 min de lecture");
    expect(render({})).toBe("{min} min de lecture");
  });
});
