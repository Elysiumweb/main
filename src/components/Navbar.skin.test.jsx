import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../lib/analytics", () => ({
  ANALYTICS_EVENTS: new Proxy({}, { get: () => "evt" }),
  trackEvent: jest.fn(),
}));
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: null, profile: null, hasPlayerAccess: false, isOfficial: false,
    role: "visitor", displayName: "", logout: jest.fn(), canSeeSupport: false, canSeeRecruit: false,
  }),
}));
jest.mock("../hooks/useInboxCounts", () => ({ useInboxCounts: () => ({ attention: 0 }) }));
jest.mock("./NotificationsBell", () => ({ NotificationsBell: () => null }));

const { LanguageProvider } = require("../lib/i18n");
const { Navbar } = require("./Navbar");

const renderAt = async (path) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={[path]}><Navbar /></MemoryRouter>
      </LanguageProvider>
    );
  });
  return { container, root };
};

describe("Navbar active states", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  test("marks the current route as active, and only that one", async () => {
    const { container } = await renderAt("/resultats");
    const active = [...container.querySelectorAll('a[aria-current="page"]')];
    const ids = active.map((a) => a.getAttribute("data-testid"));
    expect(ids).toContain("nav-link-resultats");
    expect(ids).not.toContain("nav-link-home");
  });

  test("home is active only on /", async () => {
    const { container } = await renderAt("/");
    const ids = [...container.querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute("data-testid"));
    expect(ids).toContain("nav-link-home");
    expect(ids).not.toContain("nav-link-resultats");
  });

  test("mobile menu lists every link with its test id", async () => {
    const { container } = await renderAt("/");
    const toggle = container.querySelector('[data-testid="nav-mobile-toggle"]');
    await act(async () => toggle.click());
    const menu = container.querySelector('[data-testid="nav-mobile-menu"]');
    expect(menu).toBeTruthy();
    expect(menu.querySelector('[data-testid="nav-mobile-link-home"]')).toBeTruthy();
    expect(menu.querySelector('[data-testid="nav-mobile-donate-link"]')).toBeTruthy();
    expect(menu.querySelector('[data-testid="nav-mobile-link-recrutement"]')).toBeTruthy();
  });
});
