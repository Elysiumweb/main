import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, ExternalLink, ShieldCheck, Repeat } from "lucide-react";
import { useLang } from "../lib/i18n";
import { loadPayPalSdk } from "../lib/paypal";
import { PAYPAL_HOSTED_BUTTON_ID, PAYPAL_SUBSCRIPTION_HOSTED_BUTTON_ID, paypalCheckoutUrl } from "../lib/constants";
import { CONTACT_EMAIL } from "../lib/notify";

let instanceCount = 0;

/**
 * Bouton de don PayPal (bouton hébergé « no-code checkout »).
 *
 * - Le SDK PayPal n'est chargé que lorsque le bouton entre dans le viewport.
 * - En cas d'échec (SDK bloqué, hors ligne), un lien vers la page de paiement
 *   PayPal hébergée prend le relais : le don reste toujours possible.
 */
export const DonateButton = ({
  hostedButtonId = PAYPAL_HOSTED_BUTTON_ID,
  testId = "donate-paypal-button",
  className = "",
}) => {
  const { t } = useLang();
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const domIdRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error

  if (domIdRef.current === null) {
    instanceCount += 1;
    domIdRef.current = `paypal-container-${hostedButtonId}-${instanceCount}`;
  }
  const domId = domIdRef.current;

  // Charge le SDK uniquement quand le bouton devient visible.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const container = containerRef.current;
    setStatus("loading");

    loadPayPalSdk()
      .then((paypal) => {
        if (cancelled || !containerRef.current) return;
        return paypal.HostedButtons({ hostedButtonId }).render(`#${domId}`);
      })
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((err) => {
        console.warn("[donate] PayPal indisponible :", err?.message || err);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
  }, [visible, hostedButtonId, domId]);

  return (
    <div ref={wrapperRef} className={className} data-testid={testId}>
      {/* Conteneur de rendu du bouton hébergé PayPal */}
      <div
        id={domId}
        ref={containerRef}
        className={status === "ready" ? "min-h-[52px]" : "sr-only"}
        data-testid="donate-paypal-container"
      />

      {status !== "ready" && status !== "error" && (
        <div
          className="min-h-[52px] flex items-center gap-3 border border-white/10 bg-[#141414] px-4 py-3"
          role="status"
          aria-live="polite"
          data-testid="donate-paypal-loading"
        >
          <span
            className="w-4 h-4 border-2 border-[#D8CA82]/60 border-t-transparent rounded-full animate-spin motion-reduce:animate-none shrink-0"
            aria-hidden="true"
          />
          <span className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8]">{t("donate.loading")}</span>
        </div>
      )}

      {status === "error" && (
        <div data-testid="donate-paypal-fallback">
          <a
            href={paypalCheckoutUrl(hostedButtonId)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="donate-paypal-fallback-link"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-4 inline-flex items-center gap-2 hover:shadow-[0_0_24px_rgba(216,202,130,0.45)] transition-shadow motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
          >
            <Heart size={16} aria-hidden="true" /> {t("donate.cta")}
            <ExternalLink size={13} aria-hidden="true" />
          </a>
          <p className="text-[11px] text-[#c8c8c8] mt-3 max-w-xs leading-relaxed">{t("donate.fallback")}</p>
        </div>
      )}
    </div>
  );
};

/**
 * Don récurrent / adhésion : bouton hébergé PayPal « abonnement ».
 * Si l'identifiant du bouton d'abonnement n'est pas configuré
 * (REACT_APP_PAYPAL_SUBSCRIPTION_HOSTED_BUTTON_ID), un message d'attente
 * avec contact email est affiché à la place.
 */
export const DonateSubscriptionBlock = ({ testId = "donate-subscription" }) => {
  const { t } = useLang();
  if (!PAYPAL_SUBSCRIPTION_HOSTED_BUTTON_ID) {
    return (
      <div className="border border-white/15 bg-[#141414] px-4 py-3 text-[11px] text-[#c8c8c8] leading-relaxed" data-testid={testId}>
        {t("donate.monthly.notConfigured")}{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#D8CA82] hover:underline">{CONTACT_EMAIL}</a>
      </div>
    );
  }
  return (
    <div data-testid={testId}>
      <DonateButton hostedButtonId={PAYPAL_SUBSCRIPTION_HOSTED_BUTTON_ID} testId="donate-monthly-paypal" />
    </div>
  );
};

/** Icône + libellé pour la carte « don mensuel ». */
export const DonateSubscriptionCard = ({ testId = "donate-subscription-card" }) => {
  const { t } = useLang();
  return (
    <div className="mt-6 pt-6 border-t border-white/10" data-testid={testId}>
      <div className="flex items-center gap-3 mb-3">
        <Repeat size={17} className="text-[#D8CA82]" aria-hidden="true" />
        <p className="font-display text-xs tracking-[0.3em] uppercase text-[#D8CA82]">{t("donate.monthly.title")}</p>
      </div>
      <p className="text-sm text-[#c8c8c8] leading-relaxed mb-4">{t("donate.monthly.text")}</p>
      <DonateSubscriptionBlock />
      <p className="text-[11px] text-[#f7f7f7]/40 mt-3">{t("donate.monthly.member.desc")}</p>
    </div>
  );
};

/** Mention « paiement sécurisé » à afficher sous un bouton de don. */
export const DonateSecureNote = ({ testId = "donate-secure-note" }) => {
  const { t } = useLang();
  return (
    <p
      className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-[#c8c8c8]"
      data-testid={testId}
    >
      <ShieldCheck size={14} className="text-[#D8CA82] shrink-0 mt-px" aria-hidden="true" />
      <span>{t("donate.secure")}</span>
    </p>
  );
};

/** Lien-bouton doré vers la page de dons (navigation, footer, sections courtes). */
export const DonateLink = ({ testId = "donate-link", compact = false, className = "" }) => {
  const { t } = useLang();
  return (
    <Link
      to="/soutenir"
      data-testid={testId}
      className={`bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2 hover:shadow-[0_0_24px_rgba(216,202,130,0.45)] transition-shadow motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] ${
        compact ? "text-[11px] px-4 py-2.5 min-h-[44px]" : "text-sm px-8 py-4"
      } ${className}`}
    >
      <Heart size={compact ? 13 : 16} aria-hidden="true" /> {t("donate.cta")}
    </Link>
  );
};

/**
 * Bloc de don complet, réutilisable (accueil, partenaires…).
 * Carte sombre à angles vifs, filets dorés, bouton PayPal intégré.
 */
export const DonateBlock = ({ testId = "donate-block" }) => {
  const { t } = useLang();
  return (
    <div
      className="relative border border-[#D8CA82]/30 bg-[#1A1A1A] p-8 sm:p-10 overflow-hidden"
      data-testid={testId}
    >
      <img
        src="/brand/accent-brackets-gold.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 w-40 opacity-[0.06]"
      />
      <div className="relative grid lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-7">
          <p className="text-[10px] font-display uppercase tracking-[0.35em] text-[#D8CA82] mb-4">
            {t("donate.badge")}
          </p>
          <h3 className="font-display font-black text-2xl sm:text-3xl uppercase text-[#f7f7f7] leading-tight">
            {t("donate.block.title")}
          </h3>
          <p className="text-[#c8c8c8] mt-4 leading-relaxed max-w-xl">{t("donate.block.text")}</p>
          <Link
            to="/soutenir"
            data-testid="donate-block-more-link"
            className="mt-5 inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
          >
            {t("donate.block.more")}
          </Link>
        </div>
        <div className="lg:col-span-5">
          <DonateButton testId="donate-block-paypal" />
          <DonateSecureNote testId="donate-block-secure-note" />
        </div>
      </div>
    </div>
  );
};
