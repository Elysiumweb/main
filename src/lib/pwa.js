/**
 * Enregistrement du service worker + détection des mises à jour.
 *
 * Le SW n'appelle plus `skipWaiting()` tout seul : quand une nouvelle version
 * est installée elle reste en attente, on prévient l'utilisateur (toast
 * « nouvelle version disponible ») et c'est lui qui déclenche l'activation.
 * Cela évite de recharger l'app en plein formulaire ou en pleine lecture.
 */

const UPDATE_EVENT = "elysium:sw-update";
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 h

let waitingWorker = null;
let reloading = false;

/** Diffuse la disponibilité d'une mise à jour aux composants React. */
const announceUpdate = (worker) => {
  if (!worker || waitingWorker === worker) return;
  waitingWorker = worker;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
};

/** Vrai si une nouvelle version attend déjà d'être activée. */
export const hasPendingUpdate = () => Boolean(waitingWorker);

/** S'abonne aux annonces de mise à jour. Renvoie la fonction de désabonnement. */
export const onServiceWorkerUpdate = (handler) => {
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
};

/** Active la version en attente puis recharge la page une fois le SW en place. */
export const applyServiceWorkerUpdate = () => {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
  // `controllerchange` déclenche le reload (cf. registerSW).
  // Filet de sécurité si l'événement n'arrive pas.
  setTimeout(() => {
    if (!reloading) {
      reloading = true;
      window.location.reload();
    }
  }, 3000);
};

export const registerSW = () => {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production") return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Une version est déjà installée et attend son activation.
        if (reg.waiting && navigator.serviceWorker.controller) {
          announceUpdate(reg.waiting);
        }

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // `controller` non nul => ce n'est pas la première installation,
            // donc il s'agit bien d'une mise à jour.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              announceUpdate(reg.waiting || installing);
            }
          });
        });

        // Recherche périodique + au retour sur l'onglet.
        const check = () => reg.update().catch(() => {});
        setInterval(check, CHECK_INTERVAL_MS);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
      })
      .catch((err) => {
        console.warn("SW registration failed:", err);
      });
  });
};
