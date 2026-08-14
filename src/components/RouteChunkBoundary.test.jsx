import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { RouteChunkBoundary, isChunkLoadError } from "./RouteChunkBoundary";
import { LanguageProvider } from "../lib/i18n";

jest.mock("../lib/sentry", () => ({ captureException: jest.fn() }));

const { captureException } = require("../lib/sentry");

let container;
let root;
let errorSpy;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // React journalise toute erreur capturée par une boundary : on garde la sortie propre.
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  captureException.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  errorSpy.mockRestore();
});

const Boom = ({ error }) => {
  throw error;
};

const render = (ui) => act(() => root.render(<LanguageProvider>{ui}</LanguageProvider>));

describe("isChunkLoadError", () => {
  it("reconnaît les erreurs de chunk des différents navigateurs", () => {
    const chunkError = new Error("boom");
    chunkError.name = "ChunkLoadError";
    expect(isChunkLoadError(chunkError)).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 657 failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 12 failed."))).toBe(true);
  });

  it("ne confond pas une erreur applicative avec un chunk manquant", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(new TypeError("x is not a function"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("RouteChunkBoundary", () => {
  it("affiche le repli et signale l'erreur quand un chunk ne se charge pas", () => {
    const error = new Error("Loading chunk 42 failed.");
    render(
      <RouteChunkBoundary routeKey="/a">
        <Boom error={error} />
      </RouteChunkBoundary>
    );

    expect(container.querySelector('[data-testid="route-load-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="route-load-error-retry"]')).not.toBeNull();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("relance les erreurs applicatives vers l'ErrorBoundary racine", () => {
    const appError = new Error("Cannot read properties of undefined (reading 'map')");
    expect(() =>
      render(
        <RouteChunkBoundary routeKey="/a">
          <Boom error={appError} />
        </RouteChunkBoundary>
      )
    ).toThrow(appError);
    // Une vraie régression ne doit pas être maquillée en problème de connexion.
    expect(captureException).not.toHaveBeenCalled();
  });

  it("réessaie un rendu propre lorsque la route change", () => {
    const error = new Error("Loading chunk 42 failed.");
    render(
      <RouteChunkBoundary routeKey="/a">
        <Boom error={error} />
      </RouteChunkBoundary>
    );
    expect(container.querySelector('[data-testid="route-load-error"]')).not.toBeNull();

    render(
      <RouteChunkBoundary routeKey="/b">
        <p data-testid="ok">Page suivante</p>
      </RouteChunkBoundary>
    );

    expect(container.querySelector('[data-testid="route-load-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="ok"]')).not.toBeNull();
  });

  it("rend les enfants sans interférer quand tout va bien", () => {
    render(
      <RouteChunkBoundary routeKey="/a">
        <p data-testid="ok">Contenu</p>
      </RouteChunkBoundary>
    );
    expect(container.querySelector('[data-testid="ok"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="route-load-error"]')).toBeNull();
  });
});
