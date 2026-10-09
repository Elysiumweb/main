import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  HELP_CATEGORY_IDS,
  HELP_GAMES,
  helpArticleText,
  normalizeHelpArticle,
  sortHelpArticles,
} from "./helpDefaults";

describe("helpDefaults — contenu de secours de la FAQ", () => {
  it("expose au moins les 15 questions historiques", () => {
    expect(HELP_ARTICLES.length).toBeGreaterThanOrEqual(15);
  });

  it("n'a ni question ni réponse vide, et fournit l'anglais", () => {
    HELP_ARTICLES.forEach((a) => {
      expect(typeof a.question).toBe("string");
      expect(a.question.length).toBeGreaterThan(0);
      expect(a.answer.length).toBeGreaterThan(0);
      expect(a.questionEn.length).toBeGreaterThan(0);
      expect(a.answerEn.length).toBeGreaterThan(0);
    });
  });

  it("n'utilise que des rubriques et des jeux connus", () => {
    HELP_ARTICLES.forEach((a) => {
      expect(HELP_CATEGORY_IDS).toContain(a.category);
      expect(HELP_GAMES).toContain(a.game);
    });
  });

  it("classe les articles par jeu", () => {
    const games = new Set(HELP_ARTICLES.map((a) => a.game));
    expect(games.has("all")).toBe(true);
    expect(games.has("EVA")).toBe(true);
    expect(games.has("Rocket League")).toBe(true);
  });

  it("conserve les 5 rubriques historiques", () => {
    expect(HELP_CATEGORIES.map((c) => c.id)).toEqual(["account", "apply", "donate", "player", "discord", "game"]);
  });
});

describe("helpDefaults — normalisation Firestore", () => {
  it("corrige les champs absents ou invalides", () => {
    const a = normalizeHelpArticle({ question: "QQ", answer: "RR", category: "inconnu", game: "Fortnite", order: "12" });
    expect(a.category).toBe("account");
    expect(a.game).toBe("all");
    expect(a.published).toBe(true);
    expect(a.order).toBe(12);
    expect(a.questionEn).toBe("");
  });

  it("respecte un brouillon non publié", () => {
    expect(normalizeHelpArticle({ published: false }).published).toBe(false);
  });

  it("gère un document vide sans planter", () => {
    const a = normalizeHelpArticle();
    expect(a.question).toBe("");
    expect(a.game).toBe("all");
  });

  it("trie par rubrique puis par ordre", () => {
    const sorted = sortHelpArticles([
      normalizeHelpArticle({ question: "c", category: "discord", order: 1 }),
      normalizeHelpArticle({ question: "a", category: "account", order: 2 }),
      normalizeHelpArticle({ question: "b", category: "account", order: 1 }),
    ]);
    expect(sorted.map((x) => x.question)).toEqual(["b", "a", "c"]);
  });
});

describe("helpDefaults — traduction", () => {
  it("bascule sur l'anglais quand il est disponible", () => {
    const article = { question: "Question ?", answer: "Réponse.", questionEn: "Question?", answerEn: "Answer." };
    expect(helpArticleText(article, "en")).toEqual({ question: "Question?", answer: "Answer." });
    expect(helpArticleText(article, "fr")).toEqual({ question: "Question ?", answer: "Réponse." });
  });

  it("retombe sur le français si l'anglais manque", () => {
    const article = { question: "Question ?", answer: "Réponse." };
    expect(helpArticleText(article, "en").question).toBe("Question ?");
    expect(helpArticleText(null, "en")).toEqual({ question: "", answer: "" });
  });
});