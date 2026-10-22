import { useLang } from "../lib/i18n";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Markdown } from "../lib/markdown";
import { useSiteContent } from "../lib/siteContent";

const TITLE_KEYS = {
  mentions: "legal.mentions",
  privacy: "legal.privacy",
  terms: "legal.terms",
};

/**
 * Pages légales — le texte vient de `siteContent/legal` (Markdown), éditable
 * depuis l'admin. Les valeurs par défaut de `siteContent.js` assurent le repli
 * si le document n'existe pas encore.
 */
export default function LegalPage({ kind }) {
  const { t } = useLang();
  const { content, isFallback } = useSiteContent("legal");
  const doc = content[kind] || content.mentions;
  const title = isFallback ? t(TITLE_KEYS[kind] || "legal.mentions") : doc?.title || t(TITLE_KEYS[kind] || "legal.mentions");
  const updatedAt = doc?.updatedAt || "juillet 2026";

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 relative">
          <PageBreadcrumb items={[{ label: title }]} />
          <h1 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl text-[#f7f7f7] uppercase" data-testid={`legal-title-${kind}`}>{title}</h1>
        </div>
      </section>
      <section className="max-w-4xl mx-auto px-4 sm:px-8 py-12" data-testid={`legal-content-${kind}`}>
        <Markdown source={doc?.markdown || ""} className="text-[#f7f7f7]/70" />
        <p className="text-xs text-[#c8c8c8] mt-12">Dernière mise à jour : {updatedAt}</p>
      </section>
    </div>
  );
}
