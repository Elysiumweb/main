import { Download, FileImage, Newspaper, Mail, Shield, Ruler, Palette, Ban, FileText, Package, Award, Users, Image as ImageIcon } from "lucide-react";
import { useLang } from "../lib/i18n";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { useSEO } from "../lib/useSEO";
import { CONTACT_EMAIL } from "../lib/notify";
import { SITE_URL } from "../lib/useSEO";

// Dimensions RÉELLES mesurées via `identify` (8-bit sRGB) — ne jamais mentir sur le ratio source.
// Ces métadonnées correspondent exactement aux fichiers PNG livrés dans /public/brand.
// Tout usage avec width/height doit conserver ce ratio (object-contain + h-auto) — voir OptimizedImage.
const ASSETS = [
  {
    group: "logo",
    kind: "logo",
    items: [
      { name: "Logo horizontal — blanc", file: "logo-horizontal-white.png", w: 963, h: 304, ratio: "963×304 · 3,17:1" },
      { name: "Logo horizontal — or", file: "logo-horizontal-gold.png", w: 963, h: 304, ratio: "963×304 · 3,17:1" },
      { name: "Logo vertical — or", file: "logo-vertical-gold.png", w: 817, h: 690, ratio: "817×690 · 1,18:1" },
      { name: "Icône — or", file: "logo-icon-gold.png", w: 808, h: 798, ratio: "808×798 · 1,01:1" },
      { name: "Icône — blanc", file: "logo-icon-white.png", w: 808, h: 798, ratio: "808×798 · 1,01:1" },
      { name: "Wordmark — blanc", file: "wordmark-white.png", w: 914, h: 126, ratio: "914×126 · 7,25:1" },
      { name: "Wordmark — or", file: "wordmark-gold.png", w: 914, h: 126, ratio: "914×126 · 7,25:1" },
    ],
  },
  {
    group: "charte",
    kind: "document",
    items: [
      { name: "Accent — lame dorée", file: "accent-blade.png", w: 787, h: 658, ratio: "787×658 · 1,20:1" },
      { name: "Accent — chevrons", file: "accent-brackets-gold.png", w: 600, h: 754, ratio: "600×754 · 0,80:1" },
      { name: "Motif / texture", file: "pattern.png", w: 756, h: 992, ratio: "756×992 · 0,76:1" },
    ],
  },
];

const GROUP_TITLES = { logo: "press.assets.logo", charte: "press.assets.charte" };

// Exports dédiés par usage — ne JAMAIS écraser le ratio en CSS.
// Chaque usage a son export natif à bon ratio, ou utilise object-contain + h-auto.
const USAGE_EXPORTS = [
  { label: "Horizontal · header/nav · 963×304", file: "logo-horizontal-gold.png", use: "En-tête, barre de navigation, email signature — toujours width auto, height auto" },
  { label: "Icône · favicon / avatar · 808×798", file: "logo-icon-gold.png", use: "Icône carrée, favicon, réseaux — ratio 1:1, ne pas étirer en 512×512 si source 808×798" },
  { label: "Vertical · affiche / dossier presse · 817×690", file: "logo-vertical-gold.png", use: "Affiches, dossiers de presse — conserver ratio 1,18:1, ne pas forcer 400×500" },
  { label: "Wordmark · titrage · 914×126", file: "wordmark-gold.png", use: "Titrages larges, footer — 7,25:1, ne jamais écraser à 600×160" },
];

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
          <p className="text-[#c8c8c8] mt-4 tracking-wide max-w-3xl">{t("press.sub")}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <p className="text-sm text-[#c8c8c8] leading-relaxed max-w-3xl mb-8" data-testid="press-intro">{t("press.intro")}</p>

        {/* Note ratio source — D-01.1 */}
        <div className="border border-[#D8CA82]/30 bg-[#D8CA82]/5 px-4 py-3 mb-10" data-testid="press-ratio-note">
          <p className="text-xs text-[#D8CA82] flex items-start gap-2 leading-relaxed">
            <Shield size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong>Ratio source préservé :</strong> toutes les dimensions annoncées correspondent exactement aux fichiers livrés.
              Ne jamais forcer un <code className="bg-white/10 px-1 py-0.5">width/height</code> incohérent — utilisez <code className="bg-white/10 px-1 py-0.5">object-contain</code> + <code className="bg-white/10 px-1 py-0.5">height:auto</code> ou les exports dédiés ci-dessous.
            </span>
          </p>
        </div>

        {/* Kit complet + charte PDF — D-12 */}
        <div className="grid md:grid-cols-3 gap-5 mb-12" data-testid="press-kit-complete">
          <a href="/brand/elysium-press-kit.zip" download data-testid="press-download-zip"
            className="border border-[#D8CA82]/30 bg-[#1A1A1A] p-6 flex flex-col hover:border-[#D8CA82]/60 transition-colors group">
            <Package className="text-[#D8CA82] mb-3 group-hover:scale-105 transition-transform" size={22} aria-hidden="true" />
            <p className="font-display text-xs uppercase tracking-[0.25em] text-[#f7f7f7]">Kit presse complet · ZIP</p>
            <p className="text-xs text-[#c8c8c8] mt-2 leading-relaxed">Tous les logos PNG + SVG + PDF, pattern et accents aux bonnes dimensions. 10 fichiers vectoriels inclus.</p>
            <span className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#D8CA82]"><Download size={12} /> Télécharger le ZIP</span>
          </a>
          <a href="/brand/charte-elysium.pdf" download data-testid="press-download-charte"
            className="border border-white/10 bg-[#141414] p-6 flex flex-col hover:border-[#D8CA82]/40 transition-colors group">
            <FileText className="text-[#D8CA82] mb-3" size={22} aria-hidden="true" />
            <p className="font-display text-xs uppercase tracking-[0.25em] text-[#f7f7f7]">Charte graphique · PDF</p>
            <p className="text-xs text-[#c8c8c8] mt-2 leading-relaxed">Couleurs officielles, zone de protection, taille minimale, fonds autorisés & usages interdits.</p>
            <span className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#D8CA82]"><Download size={12} /> Télécharger le PDF</span>
          </a>
          <div className="border border-white/10 bg-[#0c0c0c] p-6 flex flex-col" data-testid="press-key-figures">
            <Award className="text-[#D8CA82] mb-3" size={22} aria-hidden="true" />
            <p className="font-display text-xs uppercase tracking-[0.25em] text-[#D8CA82]">Chiffres-clés — au 20 août 2026</p>
            <ul className="mt-3 space-y-1.5 text-xs text-[#c8c8c8] leading-relaxed">
              <li>• Fondée 2026 · Association loi 1901 · RNA W772011943</li>
              <li>• 3 pôles : EVA · Rocket League · Valorant (Valeureux/Vaillant)</li>
              <li>• Communauté Discord active · <a href="https://discord.gg/RH3ZZkMJsw" className="text-[#D8CA82] underline">discord.gg/RH3ZZkMJsw</a></li>
              <li>• Slogan : “Not given. Earned.”</li>
            </ul>
            <p className="text-xs text-[#f7f7f7]/50 mt-3">Mise à jour : 20 août 2026</p>
          </div>
        </div>

        {/* Présentations courte / longue — D-12 */}
        <div className="grid md:grid-cols-2 gap-5 mb-12" data-testid="press-presentations">
          <div className="border border-white/10 bg-[#141414] p-6">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-3">Présentation courte — 280 caractères</p>
            <p className="text-sm text-[#c8c8c8] leading-relaxed">Elysium Esport est une équipe esport française (EVA, Rocket League, Valorant) fondée en 2026. Association loi 1901 portée par des joueurs et bénévoles, elle porte l’écusson “Not given. Earned.” en compétition et communauté.</p>
            <button onClick={() => navigator.clipboard?.writeText("Elysium Esport est une équipe esport française (EVA, Rocket League, Valorant) fondée en 2026. Association loi 1901 portée par des joueurs et bénévoles, elle porte l’écusson “Not given. Earned.” en compétition et communauté.")} className="mt-3 text-xs uppercase tracking-widest text-[#D8CA82] hover:underline">Copier</button>
          </div>
          <div className="border border-white/10 bg-[#141414] p-6">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-3">Présentation longue — 600 caractères</p>
            <p className="text-sm text-[#c8c8c8] leading-relaxed">Dans la mythologie grecque, l’Elysium est la demeure des héros. Depuis 2026, Elysium Esport en fait son standard : excellence, intégrité et communauté. Trois pôles compétitifs — EVA (Esports Virtual Arenas), Rocket League et Valorant (Valeureux & Vaillant) — partagent le même ADN et le mêmeécusson. L’association (RNA W772011943) finance matériel, LAN et inscriptions grâce à ses partenaires et aux dons, avec comptes présentés chaque année en assemblée générale.</p>
            <button onClick={() => navigator.clipboard?.writeText("Dans la mythologie grecque, l’Elysium est la demeure des héros. Depuis 2026, Elysium Esport en fait son standard : excellence, intégrité et communauté. Trois pôles compétitifs — EVA, Rocket League et Valorant (Valeureux & Vaillant) — partagent le même ADN. L’association (RNA W772011943) finance matériel, LAN et inscriptions grâce à ses partenaires et dons.")} className="mt-3 text-xs uppercase tracking-widest text-[#D8CA82] hover:underline">Copier</button>
          </div>
        </div>

        {/* Guidelines — zone de protection, taille minimale, fonds, usages interdits — D-01.5 */}
        <div className="border border-white/10 bg-[#0c0c0c] p-6 sm:p-8 mb-12" data-testid="press-guidelines">
          <h2 className="font-display text-xs uppercase tracking-[0.35em] text-[#D8CA82] mb-6 flex items-center gap-2"><Ruler size={14} /> Charte d’usage — logos</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-xs font-display uppercase tracking-widest text-[#f7f7f7] mb-2 flex items-center gap-2"><Shield size={12} className="text-[#D8CA82]" /> Zone de protection</p>
              <p className="text-xs text-[#c8c8c8] leading-relaxed">Marge minimale = hauteur du “E” du wordmark sur tous les côtés. Aucun texte, bord ou autre logo ne doit empiéter.</p>
            </div>
            <div>
              <p className="text-xs font-display uppercase tracking-widest text-[#f7f7f7] mb-2 flex items-center gap-2"><Ruler size={12} className="text-[#D8CA82]" /> Taille minimale</p>
              <p className="text-xs text-[#c8c8c8] leading-relaxed">Horizontal : 120 px de large. Vertical : 80 px. Icône seule : 24 px. En dessous, utiliser l’icône seule.</p>
            </div>
            <div>
              <p className="text-xs font-display uppercase tracking-widest text-[#f7f7f7] mb-2 flex items-center gap-2"><Palette size={12} className="text-[#D8CA82]" /> Fonds autorisés</p>
              <p className="text-xs text-[#c8c8c8] leading-relaxed">Or #D8CA82 ou blanc sur fond #111111 / #0c0c0c. Noir sur fond clair (≥ 4,5:1). Pas d’ombre portée ni dégradé.</p>
            </div>
            <div>
              <p className="text-xs font-display uppercase tracking-widest text-[#f7f7f7] mb-2 flex items-center gap-2"><Ban size={12} className="text-red-300" /> Usages interdits</p>
              <ul className="text-xs text-[#c8c8c8] leading-relaxed list-disc list-inside">
                <li>Ne pas déformer (conserver ratio source)</li>
                <li>Ne pas recolorer hors palette</li>
                <li>Ne pas ajouter contour/ombre</li>
                <li>Ne pas pivoter l’icône</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-[#c8c8c8]/70 mt-6">Tous les exports ci-dessous respectent leur ratio source. Les variantes SVG/PDF sont vectorielles — privilégiez-les pour l’impression.</p>
        </div>

        {/* Exports dédiés par usage — D-01.3 */}
        <div className="border border-white/10 bg-[#141414] p-6 mb-12" data-testid="press-exports">
          <h2 className="font-display text-xs uppercase tracking-[0.35em] text-[#f7f7f7] mb-4">Exports dédiés par usage</h2>
          <p className="text-xs text-[#c8c8c8] mb-4 leading-relaxed">Chaque contexte utilise son fichier natif, pas un PNG étiré en CSS.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {USAGE_EXPORTS.map((u) => (
              <div key={u.file} className="border border-white/5 bg-[#111111] p-3">
                <p className="text-xs font-semibold text-[#f7f7f7]">{u.label}</p>
                <p className="text-xs text-[#c8c8c8] mt-1">{u.use}</p>
                <p className="text-xs text-[#D8CA82] mt-1 font-mono">{u.file}</p>
              </div>
            ))}
          </div>
        </div>

        {ASSETS.map((group) => (
          <div key={group.group} className="mb-12" data-testid={`press-group-${group.group}`}>
            <h2 className="font-display text-xs tracking-[0.35em] uppercase text-[#D8CA82] mb-6">{t(GROUP_TITLES[group.group])}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {group.items.map((item) => {
                const base = item.file.replace(/\.png$/, "");
                const svgFile = `${base}.svg`;
                const pdfFile = `${base}.pdf`;
                const webpFile = `optimized/${base}.webp`;
                return (
                  <div key={item.file} className="border border-white/10 bg-[#1A1A1A] p-4 flex flex-col" data-testid={`press-asset-${item.file.replace(/\./g, "-")}`}>
                    <div className="h-32 bg-[#0d0d0d] flex items-center justify-center p-4 mb-4 border border-white/5">
                      <img
                        src={`/brand/${item.file}`}
                        alt=""
                        width={item.w}
                        height={item.h}
                        className="max-h-full max-w-full object-contain h-auto"
                        loading="lazy"
                        style={{ aspectRatio: `${item.w}/${item.h}` }}
                      />
                    </div>
                    <p className="text-sm font-semibold text-[#f7f7f7]">{item.name}</p>
                    <p className="text-xs text-[#c8c8c8] mt-1">PNG · {item.w}×{item.h} · {item.ratio}</p>
                    <p className="text-xs text-[#c8c8c8]/70 mt-1">Ratio source préservé — ne pas étirer</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <a
                        href={`/brand/${item.file}`}
                        download
                        data-testid={`press-download-${item.file.replace(/\./g, "-")}`}
                        className="inline-flex items-center justify-center gap-1 border border-[#D8CA82]/40 text-[#D8CA82] text-xs uppercase tracking-widest px-2 py-2 hover:bg-[#D8CA82]/10 transition-colors"
                      >
                        <Download size={11} aria-hidden="true" /> PNG
                      </a>
                      <a
                        href={`/brand/${svgFile}`}
                        download
                        data-testid={`press-download-svg-${item.file.replace(/\./g, "-")}`}
                        className="inline-flex items-center justify-center gap-1 border border-white/15 text-[#c8c8c8] text-xs uppercase tracking-widest px-2 py-2 hover:border-[#D8CA82]/40 hover:text-[#D8CA82] transition-colors"
                      >
                        <Download size={11} aria-hidden="true" /> SVG
                      </a>
                      <a
                        href={`/brand/${pdfFile}`}
                        download
                        data-testid={`press-download-pdf-${item.file.replace(/\./g, "-")}`}
                        className="inline-flex items-center justify-center gap-1 border border-white/15 text-[#c8c8c8] text-xs uppercase tracking-widest px-2 py-2 hover:border-[#D8CA82]/40 hover:text-[#D8CA82] transition-colors"
                      >
                        <Download size={11} aria-hidden="true" /> PDF
                      </a>
                    </div>
                    <p className="text-xs text-[#c8c8c8]/50 mt-2">WEBP optimisé : <a href={`/brand/${webpFile}`} className="underline hover:text-[#D8CA82]">{webpFile}</a></p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Photos officielles — D-12 */}
        <div className="border border-white/10 bg-[#141414] p-6 sm:p-8 mb-12" data-testid="press-photos">
          <h2 className="font-display text-xs uppercase tracking-[0.35em] text-[#D8CA82] mb-6 flex items-center gap-2"><ImageIcon size={14} /> Photos officielles — libre d’usage éditorial</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { title: "Portrait équipe — EVA", file: "photo-equipe-eva.jpg", desc: "Roster EVA en tenue officielle, fond #111111" },
              { title: "Portrait équipe — RL", file: "photo-equipe-rl.jpg", desc: "Roster Rocket League, même traitement" },
              { title: "Match EVA — LAN", file: "photo-match-eva.jpg", desc: "Ambiance arène EVA, droits maîtrisés" },
            ].map((p) => (
              <div key={p.file} className="border border-white/5 bg-[#111111] p-3 flex flex-col">
                <div className="h-36 bg-[#0d0d0d] border border-white/5 flex items-center justify-center">
                  <FileImage size={24} className="text-[#c8c8c8]" aria-hidden="true" />
                </div>
                <p className="text-xs font-semibold text-[#f7f7f7] mt-3">{p.title}</p>
                <p className="text-xs text-[#c8c8c8] mt-1">{p.desc}</p>
                <a href={`/brand/photos/${p.file}`} download data-testid={`press-photo-${p.file.replace(/\./g,"-")}`}
                  className="mt-3 inline-flex items-center justify-center gap-2 border border-[#D8CA82]/40 text-[#D8CA82] text-xs uppercase tracking-widest px-3 py-2 hover:bg-[#D8CA82]/10"> <Download size={11}/> Télécharger JPG</a>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#c8c8c8]/60 mt-4">Traitement commun demandé : contraste fort, légère désaturation, cadrage et grain maîtrisés — voir charte PDF.</p>
        </div>

        <div className="border border-white/10 bg-[#141414] p-8" data-testid="press-contact">
          <div className="flex items-center gap-3 mb-3">
            <Mail className="text-[#D8CA82]" size={18} aria-hidden="true" />
            <h2 className="font-display text-xs tracking-[0.35em] uppercase text-[#f7f7f7]">{t("press.contact.title")}</h2>
          </div>
          <p className="text-sm text-[#c8c8c8]">
            {t("press.contact.text")}{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#D8CA82] hover:underline" data-testid="press-contact-email">{CONTACT_EMAIL}</a>
          </p>
          <p className="text-xs text-[#c8c8c8]/60 mt-4">
            {SITE_URL}/presse · Kit daté du 20 août 2026
          </p>
        </div>
      </section>
    </div>
  );
}
