import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HeartHandshake, ExternalLink, ShieldCheck } from "lucide-react";
import { ActionButton } from "./ui/action-button";

/* =====================================================================
 * Dons PayPal — bouton hébergé Elysium
 * ---------------------------------------------------------------------
 * Le SDK PayPal est chargé dans public/index.html (components=hosted-buttons).
 * Ce composant attend que `window.paypal` soit disponible, puis rend le
 * bouton hébergé dans un conteneur unique. Un lien de repli marque est
 * affiché si le SDK est bloqué (bloqueur de pub, hors-ligne).
 * =================================================================== */

export const HOSTED_BUTTON_ID = "8R9PKMBPRB45N";
export const PAYPAL_FALLBACK_URL = `https://www.paypal.com/ncp/payment/${HOSTED_BUTTON_ID}`;

let instanceCount = 0;

const waitForPaypal = (timeoutMs = 12000) =>
  new Promise((resolve, reject) => {
    if (window.paypal?.HostedButtons) {
      resolve(window.paypal);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => {
      if (window.paypal?.HostedButtons) {
        clearInterval(id);
        resolve(window.paypal);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(id);
        reject(new Error("PayPal SDK indisponible"));
      }
    }, 200);
  });

export const PayPalDonateButton = ({ testId = "paypal-donate" }) => {
  const containerRef = useRef(null);
  const containerId = useRef(null);
  if (containerId.current === null) {
    instanceCount += 1;
    containerId.current = `paypal-container-${HOSTED_BUTTON_ID}-${instanceCount}`;
  }
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    const node = containerRef.current;

    waitForPaypal()
      .then((paypal) => {
        if (cancelled || !node) return;
        node.innerHTML = "";
        return paypal.HostedButtons({ hostedButtonId: HOSTED_BUTTON_ID }).render(`#${containerId.current}`);
      })
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((err) => {
        console.error("PayPal", err);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      if (node) node.innerHTML = "";
    };
  }, []);

  return (
    <div data-testid={testId}>
      {status === "loading" && (
        <div
          className="h-[52px] w-full bg-white/[0.07] animate-pulse motion-reduce:animate-none"
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-testid={`${testId}-skeleton`}
        >
          <span className="sr-only">Chargement du bouton de don sécurisé…</span>
        </div>
      )}

      <div
        id={containerId.current}
        ref={containerRef}
        className={status === "ready" ? "block" : "hidden"}
        data-testid={`${testId}-container`}
      />

      {status === "error" && (
        <div className="space-y-3" data-testid={`${testId}-fallback`}>
          <p className="text-xs text-[#c8c8c8] leading-relaxed">
            Le module de paiement n'a pas pu se charger (extension de blocage ou connexion). Vous
            pouvez faire un don directement sur la page sécurisée PayPal.
          </p>
          <ActionButton
            as="a"
            href={PAYPAL_FALLBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            variant="primary"
            size="md"
            icon={ExternalLink}
            className="w-full"
            data-testid={`${testId}-fallback-link`}
          >
            Faire un don sur PayPal
          </ActionButton>
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------------
 * DonateCard — bloc de don complet (brand identity : or #D8CA82,
 * angles nets, surface #1A1A1A, brackets décoratifs)
 * ------------------------------------------------------------------- */
export const DonateCard = ({
  title = "Soutenir Elysium",
  description = "Chaque don finance les inscriptions en tournoi, le matériel et les déplacements de nos rosters EVA & Rocket League.",
  compact = false,
  testId = "donate-card",
}) => (
  <section
    className="relative border border-[#D8CA82]/30 bg-[#1A1A1A] p-6 sm:p-8 overflow-hidden"
    data-testid={testId}
    aria-labelledby={`${testId}-title`}
  >
    <div className="pattern-overlay" aria-hidden="true" />
    <img
      src="/brand/accent-brackets-gold.png"
      alt=""
      aria-hidden="true"
      className="absolute -right-6 -top-6 w-28 opacity-20 pointer-events-none"
    />
    <div className="relative">
      <div className="flex items-center gap-3">
        <HeartHandshake className="text-[#D8CA82]" size={20} aria-hidden="true" />
        <h2
          id={`${testId}-title`}
          className="font-display font-bold uppercase tracking-[0.25em] text-sm text-[#D8CA82]"
        >
          {title}
        </h2>
      </div>
      {!compact && (
        <p className="text-sm text-[#c8c8c8] leading-relaxed mt-4 max-w-prose">{description}</p>
      )}
      <div className="mt-6">
        <PayPalDonateButton testId={`${testId}-paypal`} />
      </div>
      <p className="mt-4 flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#a0a0a0]">
        <ShieldCheck size={13} aria-hidden="true" /> Paiement sécurisé PayPal · EUR
      </p>
    </div>
  </section>
);

/* ---------------------------------------------------------------------
 * DonateLink — CTA compact (navbar / footer) vers la page de dons
 * ------------------------------------------------------------------- */
export const DonateLink = ({ className = "", testId = "donate-link", label = "Faire un don" }) => (
  <Link
    to="/soutenir"
    data-testid={testId}
    className={`inline-flex items-center gap-2 border border-[#D8CA82] bg-[#D8CA82]/10 text-[#D8CA82] font-display font-bold uppercase tracking-widest text-[11px] px-4 py-2 min-h-[44px] hover:bg-[#D8CA82] hover:text-[#111111] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D8CA82] ${className}`}
  >
    <HeartHandshake size={14} aria-hidden="true" />
    {label}
  </Link>
);
