import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowLeft, ArrowRight, ArrowUpRight, ExternalLink, Globe, Handshake } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { Markdown, markdownToText } from "../lib/markdown";
import { SITE_URL, useSEO } from "../lib/useSEO";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { LoadingState, ErrorState } from "../components/States";
import { Button } from "../components/ui/button";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import {
  isPartnerVisible,
  partnerBannerSrc,
  partnerFichePath,
  partnerLogoSrc,
  partnerSlug,
  partnerTier,
  sortPartners,
  visiblePartners,
} from "../lib/partners";

/* ---------------------------------------------------------------------------
 * Fiche partenaire publique — /partenaires/:slug
 *
 * Contenu piloté depuis l'admin : logo, bannière, description Markdown et
 * bouton de lien (affiché sous la description). Un partenaire masqué depuis
 * l'admin n'est pas accessible, même par URL directe.
 * ------------------------------------------------------------------------- */

const PartnerLogo = ({ src, name, className = "" }) => {
  const [err, setErr] = useState(false);
  const safeName = (name || "Partenaire").trim();
  if (!src || err) {
    const initials =
      safeName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || "")
        .join("") || "?";
    return (
      <div
        role="img"
        aria-label={`Logo du partenaire indisponible : ${safeName}`}
        className={`${className} flex items-center justify-center bg-[#0c0c0c] text-[#a0a0a0] font-display tracking-[0.25em] uppercase`}
      >
        <span aria-hidden="true">{initials}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={`Logo du partenaire : ${safeName}`}
      onError={() => setErr(true)}
      className={`${className} object-contain`}
    />
  );
};

const isInternalLink = (url) => String(url || "").startsWith("/");

export default function PartnerDetail() {
  const { slug } = useParams();
  const { t } = useLang();
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setPartners(null);
    setError(false);
    const unsub = onSnapshot(
      collection(db, "partners"),
      (snap) => setPartners(sortPartners(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      (err) => {
        console.error(err);
        setError(true);
      }
    );
    return unsub;
  }, [retryKey]);

  const partner = useMemo(() => {
    if (!partners) return null;
    return (
      partners.find((p) => partnerSlug(p) === slug && isPartnerVisible(p)) ||
      partners.find((p) => p.id === slug && isPartnerVisible(p)) ||
      null
    );
  }, [partners, slug]);

  const others = useMemo(() => {
    if (!partners) return [];
    return visiblePartners(partners).filter((p) => p.id !== partner?.id).slice(0, 6);
  }, [partners, partner]);

  const description = String(partner?.description || "");
  const descriptionText = markdownToText(description);
  // Les logos sont généralement stockés en base64 (Firestore) : seules les
  // URL absolues peuvent servir d'image Open Graph.
  const publicLogo = /^https?:\/\//i.test(partnerLogoSrc(partner)) ? partnerLogoSrc(partner) : undefined;

  useSEO({
    title: partner ? `${partner.name} — Partenaire | ELYSIUM Esport` : t("partners.sheet.title"),
    description:
      descriptionText.slice(0, 160) ||
      (partner ? `${partner.name}, partenaire d'ELYSIUM Esport.` : "Fiche partenaire ELYSIUM Esport."),
    url: partner ? partnerFichePath(partner) : "/partenaires",
    image: partner ? publicLogo : undefined,
    jsonLd: partner
      ? {
          "@type": "Organization",
          "@id": `${SITE_URL}/partenaires/${partnerSlug(partner)}#partner`,
          name: partner.name,
          logo: publicLogo,
          url: partner.website || undefined,
          description: descriptionText.slice(0, 300) || undefined,
        }
      : undefined,
  });

  if (error) {
    return (
      <div className="min-h-[60vh] bg-[#111111]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="partner-detail-error" />
        </div>
      </div>
    );
  }

  if (partners === null) {
    return (
      <div className="min-h-[60vh] bg-[#111111]">
        <LoadingState label={t("partners.loading")} testId="partner-detail-loading" />
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="min-h-[60vh] bg-[#111111]">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-24 text-center" data-testid="partner-detail-not-found">
          <Handshake className="text-[#D8CA82]/50 mx-auto mb-6" size={40} aria-hidden="true" />
          <h1 className="font-display font-black text-3xl text-[#f7f7f7] uppercase mb-4">{t("partners.sheet.title")}</h1>
          <p className="text-[#c8c8c8] mb-8">{t("partners.notFound")}</p>
          <Button variant="outline" asChild>
            <Link to="/partenaires">
              <ArrowLeft size={14} aria-hidden="true" /> {t("partners.back")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const banner = partnerBannerSrc(partner);
  const logo = partnerLogoSrc(partner);
  const tier = partnerTier(partner);
  const website = String(partner.website || "").trim();
  // Le bouton est piloté depuis l'admin ; à défaut de lien dédié, on retombe
  // sur le site officiel pour ne jamais afficher une description sans action.
  const ctaUrl = String(partner.ctaUrl || "").trim() || website;
  const ctaLabel =
    String(partner.ctaLabel || "").trim() ||
    (website ? t("partners.sheet.website") : t("partners.sheet.button"));

  const onCtaClick = () =>
    trackEvent(ANALYTICS_EVENTS.PARTNER_CLICK, { partnerId: partner.id, tier, source: "partner_fiche" });

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      {/* HERO / BANNIÈRE */}
      <section className="relative border-b border-white/10 overflow-hidden">
        {banner && (
          <img
            src={banner}
            alt={`Bannière de ${partner.name}`}
            className="absolute inset-0 w-full h-full object-cover opacity-40"
            aria-hidden="true"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/90 to-[#111111]/60" aria-hidden="true" />
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("nav.partners"), to: "/partenaires" }, { label: partner.name }]} />
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 border border-[#D8CA82]/40 bg-[#0c0c0c] p-3 flex items-center justify-center">
              <PartnerLogo src={logo} name={partner.name} className="h-full w-full" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[11px] uppercase tracking-[0.4em] text-[#D8CA82] mb-2">
                {t("partners.sheet.title")}
              </p>
              <h1
                className="font-display font-black text-3xl sm:text-4xl lg:text-5xl text-[#f7f7f7] uppercase break-words"
                data-testid="partner-detail-title"
              >
                {partner.name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-[#c8c8c8]">
                <span
                  className={`border px-2 py-0.5 uppercase tracking-widest ${
                    tier === "gold"
                      ? "text-[#D8CA82] border-[#D8CA82]/40"
                      : tier === "silver"
                      ? "text-[#C0C0C0] border-[#C0C0C0]/40"
                      : "text-[#CD7F32] border-[#CD7F32]/40"
                  }`}
                >
                  {t(`partners.tiers.${tier}`)}
                </span>
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-[#D8CA82] transition-colors"
                  >
                    <Globe size={12} aria-hidden="true" /> {t("partners.sheet.website")}
                    <ExternalLink size={10} aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12 grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8">
          <div className="border border-white/10 bg-[#1A1A1A] p-6 sm:p-8" data-testid="partner-detail-content">
            {description.trim() ? (
              <div className="text-[#c8c8c8] leading-relaxed">
                <Markdown source={description} />
              </div>
            ) : (
              <p className="text-[#a0a0a0]">{t("partners.sheet.noDescription")}</p>
            )}

            {/* BOUTON SOUS LA DESCRIPTION */}
            {ctaUrl && (
              <div className="mt-8 pt-6 border-t border-white/10" data-testid="partner-detail-cta">
                <Button variant="gold" size="lg" asChild>
                  {isInternalLink(ctaUrl) ? (
                    <Link to={ctaUrl} onClick={onCtaClick}>
                      {ctaLabel} <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  ) : (
                    <a href={ctaUrl} target="_blank" rel="noopener noreferrer" onClick={onCtaClick}>
                      {ctaLabel} <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  )}
                </Button>
                {!isInternalLink(ctaUrl) && (
                  <p className="text-[11px] text-[#a0a0a0] mt-3">{t("partners.sheet.newTab")}</p>
                )}
              </div>
            )}
          </div>

          <div className="mt-8">
            <Link
              to="/partenaires"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[#D8CA82] hover:underline"
            >
              <ArrowLeft size={14} aria-hidden="true" /> {t("partners.back")}
            </Link>
          </div>
        </div>

        <aside className="lg:col-span-4 space-y-6">
          <div className="border border-white/10 bg-[#1A1A1A] p-6">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4">
              {t("partners.sheet.title")}
            </p>
            <ul className="text-xs text-[#c8c8c8] space-y-2">
              <li>
                {t("partners.sheet.tier")} :{" "}
                <span className="text-[#f7f7f7]">{t(`partners.tiers.${tier}`)}</span>
              </li>
              {website && (
                <li className="break-all">
                  {t("partners.sheet.website")} :{" "}
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D8CA82] hover:underline"
                  >
                    {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {others.length > 0 && (
            <div className="border border-white/10 bg-[#0c0c0c] p-6" data-testid="partner-detail-others">
              <p className="font-display text-xs uppercase tracking-[0.3em] text-[#f7f7f7] mb-4">
                {t("partners.sheet.others")}
              </p>
              <ul className="space-y-3">
                {others.map((other) => (
                  <li key={other.id}>
                    <Link
                      to={partnerFichePath(other)}
                      className="group flex items-center gap-3 text-sm text-[#c8c8c8] hover:text-[#D8CA82] transition-colors"
                    >
                      <span className="h-10 w-10 shrink-0 border border-white/10 bg-[#0c0c0c] p-1.5 flex items-center justify-center">
                        <PartnerLogo src={partnerLogoSrc(other)} name={other.name} className="h-full w-full" />
                      </span>
                      <span className="truncate font-medium">{other.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
