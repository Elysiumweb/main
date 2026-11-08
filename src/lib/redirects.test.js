import { DEFAULT_REDIRECTS, mergeRedirects, normalizePath, resolveRedirect } from "./redirects";

describe("redirects", () => {
  it("normalises paths", () => {
    expect(normalizePath("dons")).toBe("/dons");
    expect(normalizePath("/dons/")).toBe("/dons");
    expect(normalizePath("//dons//")).toBe("/dons");
    expect(normalizePath("")).toBe("/");
  });

  it("keeps the default /dons redirect", () => {
    expect(DEFAULT_REDIRECTS.some((r) => r.from === "/dons" && r.to === "/soutenir")).toBe(true);
    expect(resolveRedirect([], "/dons")).toBe("/soutenir");
    expect(resolveRedirect([], "/autre")).toBe(null);
  });

  it("lets a custom rule override a default one", () => {
    const rules = mergeRedirects([{ id: "c1", from: "/dons/", to: "/soutenir-nous", active: true }]);
    expect(resolveRedirect(rules, "/dons")).toBe("/soutenir-nous");
  });

  it("follows chains and stops on loops", () => {
    const chain = [
      { from: "/a", to: "/b", active: true },
      { from: "/b", to: "/c", active: true },
    ];
    expect(resolveRedirect(chain, "/a")).toBe("/c");
    const loop = [
      { from: "/x", to: "/y", active: true },
      { from: "/y", to: "/x", active: true },
    ];
    expect(resolveRedirect(loop, "/x")).toBe(null);
  });

  it("ignores inactive rules", () => {
    const rules = [{ from: "/old", to: "/new", active: false }];
    expect(resolveRedirect(rules, "/old")).toBe(null);
  });
});
