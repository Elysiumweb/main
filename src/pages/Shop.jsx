import { ExternalLink, PackageCheck, Shirt, Sparkles } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { ImageWithFallback } from "../components/ImageWithFallback";
import { useLang } from "../lib/i18n";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

const PRODUCT_URL = "https://eliminate.fr/elysium";
const PRODUCT_IMAGE = "/shop/maillot-2026.jpg";
const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];

const WARMERS_URL = "https://eliminate.fr/produit/elysium-manchette-2026/";
const WARMERS_IMAGE = "/shop/manchettes-2026.jpg";
/* Les deux quantités sont proposées sur la même fiche eliminate.fr : le choix se
   fait chez le marchand, le site affiche donc les deux prix sans sélecteur. */
const WARMERS_PRICES = [
  { id: "single", labelKey: "shop.manchettes.single", price: "19,90 €" },
  { id: "pair", labelKey: "shop.manchettes.pair", price: "29,90 €" },
];

/** Carte produit : visuel à gauche, arguments et achat à droite. */
const ProductCard = ({ id, alt, badge, children }) => (
  <article className="grid lg:grid-cols-12 border border-white/10 bg-[#141414] overflow-hidden" data-testid={`shop-${id}`}>
    <div className="lg:col-span-7 relative min-h-[420px] sm:min-h-[620px] bg-[#0c0c0c] overflow-hidden">
      <ImageWithFallback
        src={id === "jersey-2026" ? PRODUCT_IMAGE : WARMERS_IMAGE}
        alt={alt}
        loading={id === "jersey-2026" ? "eager" : "lazy"}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <span className="absolute top-5 left-5 bg-[#111111] text-[#D8CA82] px-3 py-2 text-xs font-display font-bold uppercase tracking-[0.25em]">
        {badge}
      </span>
    </div>
    <div className="lg:col-span-5 p-6 sm:p-10 lg:p-12 flex flex-col justify-center">{children}</div>
  </article>
);

export default function Shop() {
  const { t } = useLang();

  const trackPurchaseClick = (source, product) => {
    trackEvent(ANALYTICS_EVENTS.MERCH_CLICK, { source, product });
  };

  const BuyLink = ({ href, label, source, product, testId }) => (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackPurchaseClick(source, product)}
        data-testid={testId}
        className="mt-9 min-h-[52px] inline-flex items-center justify-center gap-3 bg-[#D8CA82] text-[#111111] px-6 py-4 font-display font-black text-xs uppercase tracking-[0.22em] hover:bg-[#eadf9e] hover:shadow-[0_0_24px_rgba(216,202,130,0.3)] transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f7f7f7]"
        aria-label={`${label} — ${t("common.opensInNewTab")}`}
      >
        {label} <ExternalLink size={16} aria-hidden="true" />
      </a>
      <p className="text-xs text-[#c8c8c8] mt-3 text-center">{t("shop.partnerNote")}</p>
    </>
  );

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pattern-overlay" />
        <div className="absolute -right-20 top-1/2 -translate-y-1/2 opacity-[0.05] pointer-events-none" aria-hidden="true">
          <img src="/brand/logo-icon-gold.png" alt="" className="w-[440px] sm:w-[620px] max-w-none" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("shop.title") }]} />
          <p className="font-display text-xs uppercase tracking-[0.4em] text-[#D8CA82] mb-4">Official merch • 2026</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="shop-title">
            {t("shop.title")}
          </h1>
          <p className="text-[#c8c8c8] mt-4 tracking-wide max-w-2xl">{t("shop.sub")}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12 lg:py-20 space-y-12 lg:space-y-16">
        {/* MAILLOT OFFICIEL */}
        <ProductCard id="jersey-2026" alt={t("shop.imageAlt")} badge={t("shop.official")}>
          <div className="flex items-center gap-3 text-[#D8CA82] mb-5">
            <Shirt size={20} aria-hidden="true" />
            <span className="text-xs font-display uppercase tracking-[0.35em]">Elysium • 2026</span>
          </div>
          <h2 id="jersey-title" className="font-display font-black text-3xl sm:text-4xl uppercase text-[#f7f7f7] leading-tight">
            {t("shop.productName")}
          </h2>
          <p className="font-display font-black text-3xl text-[#D8CA82] mt-5">49,90&nbsp;€ <span className="text-xs font-normal uppercase tracking-widest text-[#c8c8c8]">TTC</span></p>
          <p className="text-[#c8c8c8] mt-6 leading-relaxed">{t("shop.description")}</p>

          <ul className="mt-7 space-y-3 text-sm text-[#f7f7f7]" aria-label={t("shop.features") }>
            <li className="flex items-center gap-3"><Sparkles className="text-[#D8CA82] shrink-0" size={17} aria-hidden="true" />{t("shop.feature.fabric")}</li>
            <li className="flex items-center gap-3"><PackageCheck className="text-[#D8CA82] shrink-0" size={17} aria-hidden="true" />{t("shop.feature.made")}</li>
          </ul>

          <div className="mt-8">
            <p className="text-xs font-display uppercase tracking-[0.3em] text-[#c8c8c8] mb-3">{t("shop.sizes")}</p>
            <div className="flex flex-wrap gap-2" aria-label={SIZES.join(", ")}>
              {SIZES.map((size) => (
                <span key={size} className="min-w-10 h-10 px-2 border border-white/15 flex items-center justify-center text-xs font-display text-[#f7f7f7]">
                  {size}
                </span>
              ))}
            </div>
          </div>

          <BuyLink
            href={PRODUCT_URL}
            label={t("shop.buy")}
            source="shop_product"
            product="jersey_2026"
            testId="shop-buy-jersey"
          />
        </ProductCard>

        {/* MANCHETTES */}
        <ProductCard id="manchettes-2026" alt={t("shop.manchettes.imageAlt")} badge={t("shop.manchettes.badge")}>
          <div className="flex items-center gap-3 text-[#D8CA82] mb-5">
            <Sparkles size={20} aria-hidden="true" />
            <span className="text-xs font-display uppercase tracking-[0.35em]">Elysium • 2026</span>
          </div>
          <h2 id="manchettes-title" className="font-display font-black text-3xl sm:text-4xl uppercase text-[#f7f7f7] leading-tight">
            {t("shop.manchettes.name")}
          </h2>
          <p className="text-[#c8c8c8] mt-5 leading-relaxed">{t("shop.manchettes.sub")}</p>

          <div className="grid grid-cols-2 gap-3 mt-8" role="list" aria-label={t("shop.manchettes.prices")}>
            {WARMERS_PRICES.map((o) => (
              <div key={o.id} role="listitem" className="border border-white/15 p-4 flex flex-col gap-1" data-testid={`shop-price-${o.id}`}>
                <span className="text-[10px] font-display uppercase tracking-[0.25em] text-[#c8c8c8]">{t(o.labelKey)}</span>
                <span className="font-display font-black text-2xl text-[#D8CA82]">{o.price}</span>
              </div>
            ))}
          </div>

          <BuyLink
            href={WARMERS_URL}
            label={t("shop.manchettes.buy")}
            source="shop_manchettes"
            product="manchettes_2026"
            testId="shop-buy-manchettes"
          />
        </ProductCard>
      </section>
    </div>
  );
}