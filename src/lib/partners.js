/* ---------------------------------------------------------------------------
 * Partenaires — helpers partagés entre l'admin et le site public.
 *
 * La collection Firestore `partners` est libre côté écriture (bureau
 * uniquement, cf. firestore.rules) mais doit rester tolérante côté lecture :
 * les documents historiques peuvent n'avoir qu'un `logo`/`website`, on accepte
 * donc les deux conventions (`logo` / `logoUrl`, `banner` / `bannerUrl`).
 * ------------------------------------------------------------------------- */

export const PARTNER_TIERS = ["gold", "silver", "bronze"];

/** Slug public stable utilisé dans /partenaires/:slug */
export const slugifyPartner = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

/** Slug d'un partenaire : celui saisi s'il existe, sinon dérivé du nom. */
export const partnerSlug = (partner) =>
  slugifyPartner(partner?.slug) || slugifyPartner(partner?.name) || String(partner?.id || "");

export const partnerFichePath = (partner) => `/partenaires/${partnerSlug(partner)}`;

/** Palier normalisé (les anciens documents sans palier sont « bronze »). */
export const partnerTier = (partner) =>
  PARTNER_TIERS.includes(partner?.tier) ? partner.tier : "bronze";

/** Un partenaire est publié sauf si le bureau l'a explicitement masqué. */
export const isPartnerVisible = (partner) =>
  partner?.active !== false && partner?.published !== false;

export const partnerLogoSrc = (partner) =>
  String(partner?.logoUrl || partner?.logo || "").trim();

export const partnerBannerSrc = (partner) =>
  String(partner?.bannerUrl || partner?.banner || "").trim();

/** Tri d'affichage : `order` croissant puis ordre alphabétique. */
export const sortPartners = (list = []) =>
  [...list].sort((a, b) => {
    const diff = Number(a?.order ?? 99) - Number(b?.order ?? 99);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
    return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity: "base" });
  });

/** Partenaires publiés, triés — ce que le site public affiche. */
export const visiblePartners = (list = []) => sortPartners(list.filter(isPartnerVisible));

/** Le CTA d'une fiche accepte une URL absolue ou un chemin interne. */
export const isPartnerLinkValue = (value) => {
  const v = String(value || "").trim();
  if (!v) return true;
  if (v.startsWith("/")) return !v.startsWith("//");
  return /^https?:\/\/[^\s]+$/i.test(v);
};
