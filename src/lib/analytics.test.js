jest.mock("firebase/firestore", () => ({
  addDoc: jest.fn(() => Promise.resolve()),
  collection: jest.fn(() => "analytics_events"),
  serverTimestamp: jest.fn(() => 0),
}));
jest.mock("./firebase", () => ({ db: {} }));

import { addDoc } from "firebase/firestore";
import {
  ANALYTICS_EVENTS,
  analyticsConsentGranted,
  setAnalyticsConsent,
  trackEvent,
  trackPageView,
} from "./analytics";

const collect = () => {
  const events = [];
  const handler = (event) => events.push(event.detail);
  window.addEventListener("elysium:analytics", handler);
  return { events, stop: () => window.removeEventListener("elysium:analytics", handler) };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("analytics — événement local", () => {
  beforeEach(() => {
    window.localStorage.clear();
    addDoc.mockClear();
  });

  test("émet toujours l'événement local, même sans consentement", () => {
    const sink = collect();
    trackEvent("unit_test_event", { page: "/equipe" });
    sink.stop();
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0].name).toBe("unit_test_event");
    expect(sink.events[0].path).toBe("/");
    expect(typeof sink.events[0].timestamp).toBe("string");
  });

  test("aucune écriture Firestore sans consentement", async () => {
    trackEvent("unit_test_no_consent", {});
    await flush();
    expect(analyticsConsentGranted()).toBe(false);
    expect(addDoc).not.toHaveBeenCalled();
  });

  test("écrit dans analytics_events après acceptation", async () => {
    setAnalyticsConsent(true);
    trackEvent("unit_test_consent", { page: "/soutenir" });
    await flush();
    expect(addDoc).toHaveBeenCalledTimes(1);
    const payload = addDoc.mock.calls[0][1];
    expect(payload.name).toBe("unit_test_consent");
    expect(payload.properties.page).toBe("/soutenir");
    expect(payload.sessionId).toBeTruthy();
  });

  test("anonymise les propriétés sensibles", async () => {
    setAnalyticsConsent(true);
    trackEvent("unit_test_scrub", {
      page: "/recrutement",
      email: "joueur@example.com",
      uid: "abc123",
      pseudo: "Joueur",
      partnerId: "p-1",
    });
    await flush();
    const payload = addDoc.mock.calls[0][1];
    expect(payload.properties).toEqual({ page: "/recrutement", partnerId: "p-1" });
  });

  test("refuser la mesure ne collecte rien", async () => {
    setAnalyticsConsent(false);
    trackEvent("unit_test_refused", {});
    await flush();
    expect(addDoc).not.toHaveBeenCalled();
  });
});

describe("analytics — taxonomie", () => {
  test("les événements du plan de tracking sont exposés", () => {
    expect(ANALYTICS_EVENTS.PAGE_VIEW).toBe("page_view");
    [
      "RECRUIT_CLICK",
      "APPLICATION_STARTED",
      "APPLICATION_SUBMITTED",
      "DONATE_CLICK",
      "PARTNER_CLICK",
      "NEWSLETTER_SIGNUP",
      "GLOBAL_SEARCH",
      "SHARE",
      "REDIRECT_HIT",
    ].forEach((key) => expect(typeof ANALYTICS_EVENTS[key]).toBe("string"));
  });

  test("trackPageView transmet le chemin et le titre", () => {
    const sink = collect();
    trackPageView("/actus", "Actualités");
    sink.stop();
    expect(sink.events[0].name).toBe("page_view");
    expect(sink.events[0].properties).toEqual({ page: "/actus", title: "Actualités" });
  });
});
