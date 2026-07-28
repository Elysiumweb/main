import { PAYPAL_CLIENT_ID, PAYPAL_CURRENCY } from "./constants";

/**
 * Chargeur paresseux du SDK PayPal (composant « hosted-buttons »).
 *
 * Le script n'est injecté qu'au moment où un bouton de don est sur le point
 * d'être affiché : aucune requête vers PayPal (ni cookie tiers) n'est émise sur
 * les pages qui ne proposent pas de don. Le script n'est chargé qu'une seule
 * fois par session, même si plusieurs boutons sont montés.
 */

const SDK_SCRIPT_ID = "paypal-sdk-hosted-buttons";
const SDK_TIMEOUT_MS = 15000;

let sdkPromise = null;

export const paypalSdkUrl = () => {
  const params = new URLSearchParams({
    "client-id": PAYPAL_CLIENT_ID,
    components: "hosted-buttons",
    "disable-funding": "venmo",
    currency: PAYPAL_CURRENCY,
  });
  return `https://www.paypal.com/sdk/js?${params.toString()}`;
};

export const loadPayPalSdk = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("PayPal SDK: environnement non navigateur"));
  }
  if (window.paypal?.HostedButtons) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SDK_SCRIPT_ID);
    const script = existing || document.createElement("script");
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };

    const fail = (message) => {
      cleanup();
      sdkPromise = null;
      script.remove();
      reject(new Error(message));
    };

    function onLoad() {
      cleanup();
      if (window.paypal?.HostedButtons) resolve(window.paypal);
      else fail("PayPal SDK chargé sans le composant hosted-buttons");
    }

    function onError() {
      fail("Chargement du SDK PayPal impossible");
    }

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    timer = setTimeout(() => fail("Délai dépassé lors du chargement du SDK PayPal"), SDK_TIMEOUT_MS);

    if (!existing) {
      script.id = SDK_SCRIPT_ID;
      script.src = paypalSdkUrl();
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }
  });

  return sdkPromise;
};
