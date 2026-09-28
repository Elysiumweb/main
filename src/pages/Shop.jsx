import { ExternalLink, PackageCheck, Shirt, Sparkles } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { useLang } from "../lib/i18n";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

const PRODUCT_URL = "https://eliminate.fr/elysium";
const PRODUCT_IMAGE = "https://lmn8.s3.eu-west-3.amazonaws.com/wp-content/uploads/2026/08/11135852/elysium_2026.webp";
const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];

export default function Shop() {
  const { t } = useLang();

  const trackPurchaseClick = (source) => {
    trackEvent(ANALYTICS_EVENTS.MERCH_CLICK, { source, product: "jersey_2026" });
  };

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

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12 lg:py-20" aria-labelledby="jersey-title">
        <article className="grid lg:grid-cols-12 border border-white/10 bg-[#141414] overflow-hidden" data-testid="shop-jersey-2026">
          <div className="lg:col-span-7 relative min-h-[420px] sm:min-h-[620px] bg-[#ededeb] overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 opacity-[0.1]" style={{ backgroundImage: "radial-gradient(#111 1px, transparent 1px)", backgroundSize: "24px 24px" }} aria-hidden="true" />
            <img
              src={PRODUCT_IMAGE}
              alt={t("shop.imageAlt")}
              width="1000"
              height="1000"
              loading="eager"
              decoding="async"
              className="relative w-full h-full min-h-[420px] sm:min-h-[620px] object-contain p-4 sm:p-8"
            />
            <span className="absolute top-5 left-5 bg-[#111111] text-[#D8CA82] px-3 py-2 text-xs font-display font-bold uppercase tracking-[0.25em]">
              {t("shop.official")}
            </span>
          </div>

          <div className="lg:col-span-5 p-6 sm:p-10 lg:p-12 flex flex-col justify-center">
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

            <a
              href={PRODUCT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackPurchaseClick("shop_product")}
              data-testid="shop-buy-jersey"
              className="mt-9 min-h-[52px] inline-flex items-center justify-center gap-3 bg-[#D8CA82] text-[#111111] px-6 py-4 font-display font-black text-xs uppercase tracking-[0.22em] hover:bg-[#eadf9e] hover:shadow-[0_0_24px_rgba(216,202,130,0.3)] transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f7f7f7]"
              aria-label={`${t("shop.buy")} — ${t("common.opensInNewTab")}`}
            >
              {t("shop.buy")} <ExternalLink size={16} aria-hidden="true" />
            </a>
            <p className="text-xs text-[#c8c8c8] mt-3 text-center">{t("shop.partnerNote")}</p>
          </div>
        </article>
      </section>
    </div>
  );
}
