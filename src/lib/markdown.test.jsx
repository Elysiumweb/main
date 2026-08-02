import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, markdownToText } from "./markdown";

const render = (src) => renderToStaticMarkup(<Markdown source={src} />);

describe("Markdown", () => {
  test("rendre les titres, paragraphes et mise en forme", () => {
    const html = render("# Titre\n\nDu **gras** et de l'*italique* et du `code`.");
    expect(html).toContain("<h1");
    expect(html).toContain("Titre");
    expect(html).toContain("<strong>gras</strong>");
    expect(html).toContain("<em>italique</em>");
    expect(html).toContain("<code");
  });

  test("rendre les listes", () => {
    const html = render("- un\n- deux\n- trois\n\n1. a\n2. b");
    expect(html).toContain("<ul");
    expect(html).toContain(">un</li>");
    expect(html).toContain("<ol");
    expect(html).toContain(">a</li>");
  });

  test("rendre les images et les liens", () => {
    const html = render("![Logo](/brand/logo-icon-gold.png)\n\n[Lien](https://elysium-esport.fr)");
    expect(html).toContain('<img src="/brand/logo-icon-gold.png"');
    expect(html).toContain('href="https://elysium-esport.fr"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("rendre les citations", () => {
    const html = render("> Not given. Earned.");
    expect(html).toContain("<blockquote");
    expect(html).toContain("Not given. Earned.");
  });

  test("rendre les tableaux", () => {
    const html = render("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain(">1</td>");
  });

  test("ne pas interpréter le HTML brut", () => {
    const html = render("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("markdownToText retire la syntaxe", () => {
    expect(markdownToText("# Titre\n\nDu **gras** et [un lien](https://x.com).")).toBe("Titre Du gras et un lien.");
  });
});
