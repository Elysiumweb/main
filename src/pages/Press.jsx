import { Download, FileImage, Newspaper, Mail } from "lucide-react";
import { useLang } from "../lib/i18n";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { useSEO } from "../lib/useSEO";
import { CONTACT_EMAIL } from "../lib/notify";
import { SITE_URL } from "../lib/useSEO";

const ASSETS = [
  {
    group: "logo",
    kind: "logo",
    items: [
      { name: "Logo horizontal — blanc", file: "logo-horizontal-white.png", w: 600, h: 200 },
      { name: "Logo horizontal — or", file: "logo-horizontal-gold.png", w: 600, h: 200 },
      { name: "Logo vertical — or", file: "logo-vertical-gold.png", w: 400, h: 500 },
      { name: "Icône — or", file: "logo-icon-gold.png", w: 512, h: 512 },
      { name: "Icône — blanc", file: "logo-icon-white.png", w: 512, h: 512 },
      { name: "Wordmark — blanc", file: "wordmark-white.png", w: 600, h: 160 },
      { name: "Wordmark — or", file: "wordmark-gold.png", w: 600, h: 160 },
    ],
  },
  {
    group: "charte",
    kind: "document",
    items: [
      { name: "Accent — lame dorée", file: "accent-blade.png", w: 192, h: 32 },
      { name: "Accent — chevrons", file: "accent-brackets-gold.png", w: 176, h: 176 },
      { name: "Motif / texture", file: "pattern.png", w: 512, h: 512 },
    ],
  },
];

const GROUP_TITLES = { logo: "press.assets.logo", charte: "press.assets.charte" };

export default function Press() {
  const { t } = useLang();
  useSEO({
    title: `${t("press.title")} — ELYSIUM Esport`,
    description: t("press.sub"),
    url: "/presse",
  });

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("press.title") }]} />
          <div className="flex items-center gap-3">
            <Newspaper className="text-[#D8CA82]" size={26} aria-hidden="true" />
            <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="press-title">{t("press.title")}</h1>
          </div>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("press.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <p className="text-sm text-[#c8c8c8] leading-relaxed max-w-3xl mb-12" data-testid="press-intro">{t("press.intro")}</p>

        {ASSETS.map((group) => (
          <div key={group.group} className="mb-12" data-testid={`press-group-${group.group}`}>
            <h2 className="font-display text-sm tracking-[0.35em] uppercase text-[#D8CA82] mb-6">{t(GROUP_TITLES[group.group])}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {group.items.map((item) => (
                <div key={item.file} className="border border-white/10 bg-[#1A1A1A] p-4 flex flex-col" data-testid={`press-asset-${item.file.replace(/\./g, "-")}`}>
                  <div className="h-32 bg-[#0d0d0d] flex items-center justify-center p-4 mb-4 border border-white/5">
                    {group.kind === "logo" ? (
                      <img src={`/brand/${item.file}`} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                    ) : (
                      <FileImage size={28} className="text-[#f7f7f7]/30" aria-hidden="true" />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-[#f7f7f7]">{item.name}</p>
                  <p className="text-[11px] text-[#f7f7f7]/40 mt-0.5">PNG · {item.w}×{item.h}</p>
                  <a
                    href={`/brand/${item.file}`}
                    download
                    data-testid={`press-download-${item.file.replace(/\./g, "-")}`}
                    className="mt-3 inline-flex items-center justify-center gap-2 border border-[#D8CA82]/40 text-[#D8CA82] text-[11px] uppercase tracking-widest px-4 py-2 hover:bg-[#D8CA82]/10 transition-colors"
                  >
                    <Download size={12} aria-hidden="true" /> {t("press.download")}
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="border border-white/10 bg-[#141414] p-8" data-testid="press-contact">
          <div className="flex items-center gap-3 mb-3">
            <Mail className="text-[#D8CA82]" size={18} aria-hidden="true" />
            <h2 className="font-display text-sm tracking-[0.35em] uppercase text-[#f7f7f7]">{t("press.contact.title")}</h2>
          </div>
          <p className="text-sm text-[#c8c8c8]">
            {t("press.contact.text")}{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#D8CA82] hover:underline" data-testid="press-contact-email">{CONTACT_EMAIL}</a>
          </p>
          <p className="text-[11px] text-[#f7f7f7]/40 mt-4">
            {SITE_URL}/presse
          </p>
        </div>
      </section>
    </div>
  );
}
