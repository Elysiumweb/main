import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { ScrollText, ShieldCheck, Users, Landmark, Trophy, ArrowRight } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState } from "../components/States";
import { PlayerPhoto } from "./Team";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { useSEO } from "../lib/useSEO";
import { CONTACT_EMAIL } from "../lib/notify";

const VALUES = [
  { key: "1", icon: Trophy },
  { key: "2", icon: ShieldCheck },
  { key: "3", icon: Users },
];

export default function About() {
  const { t } = useLang();
  const [bureau, setBureau] = useState(null);

  useEffect(() => {
    return onSnapshot(collection(db, "roster"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status === "staff");
      list.sort((a, b) => (a.pseudo || "").localeCompare(b.pseudo || ""));
      setBureau(list);
    }, () => setBureau([]));
  }, []);

  useSEO({
    title: `${t("about.title")} — ELYSIUM Esport`,
    description: t("about.sub"),
    url: "/a-propos",
  });

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("about.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="about-title">{t("about.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("about.sub")}</p>
        </div>
      </section>

      {/* Histoire + chronologie — D-03 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="about-history">
        <div className="grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 mb-6">
              <ScrollText className="text-[#D8CA82]" size={18} aria-hidden="true" />
              <h2 className="font-display text-base tracking-[0.35em] uppercase text-[#f7f7f7]">{t("about.history.title")}</h2>
            </div>
            <p className="text-[#c8c8c8] leading-relaxed text-lg">{t("about.history.text")}</p>
            {/* Chronologie */}
            <div className="mt-10 border-l border-[#D8CA82]/30 pl-6 space-y-6" data-testid="about-timeline">
              <div className="relative"><span className="absolute -left-[29px] top-1 w-3 h-3 bg-[#D8CA82] rounded-full"/><p className="font-display font-bold text-[#f7f7f7]">2026 — Fondation</p><p className="text-sm text-[#c8c8c8]">Création de l’association, premier roster EVA, slogan “Not given. Earned.”</p></div>
              <div className="relative"><span className="absolute -left-[29px] top-1 w-3 h-3 bg-[#D8CA82]/60 rounded-full"/><p className="font-display font-bold text-[#f7f7f7]">2026 — Expansion RL</p><p className="text-sm text-[#c8c8c8]">Ouverture du pôle Rocket League — Junior → Esport.</p></div>
              <div className="relative"><span className="absolute -left-[29px] top-1 w-3 h-3 bg-[#FF4655] rounded-full"/><p className="font-display font-bold text-[#f7f7f7]">2026 — Valorant</p><p className="text-sm text-[#c8c8c8]">Deux rosters Valeureux & Vaillant, même exigence.</p></div>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="border border-white/10 bg-[#141414] p-4" data-testid="about-real-images">
              <div className="h-64 bg-[#0d0d0d] border border-white/5 flex items-center justify-center overflow-hidden">
                <img src="/brand/pattern.png" alt="" className="w-full h-full object-cover opacity-20 contrast-125 saturate-[0.85]" />
                <span className="absolute text-xs uppercase tracking-widest text-[#c8c8c8]">Photos réelles — entraînements, LAN, coulisses</span>
              </div>
              <p className="text-xs text-[#c8c8c8] mt-3 leading-relaxed">Bibliothèque visuelle : portraits cohérents, matchs EVA/LAN, captures RL/Valorant aux droits maîtrisés — traitement contraste fort, légère désaturation, grain.</p>
            </div>
            {/* Chiffres-clés */}
            <div className="grid grid-cols-3 gap-3 mt-6" data-testid="about-key-figures">
              <div className="border border-[#D8CA82]/30 bg-[#1A1A1A] p-4 text-center"><p className="font-display font-black text-2xl text-[#D8CA82]">3</p><p className="text-xs uppercase tracking-widest text-[#c8c8c8]">Pôles</p></div>
              <div className="border border-white/10 bg-[#141414] p-4 text-center"><p className="font-display font-black text-2xl text-[#f7f7f7]">2026</p><p className="text-xs uppercase tracking-widest text-[#c8c8c8]">Fondation</p></div>
              <div className="border border-white/10 bg-[#141414] p-4 text-center"><p className="font-display font-black text-2xl text-[#f7f7f7]">100%</p><p className="text-xs uppercase tracking-widest text-[#c8c8c8]">Bénévole</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* Valeurs */}
      <section className="border-y border-white/10 bg-[#0c0c0c]" data-testid="about-values">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
          <h2 className="font-display text-base tracking-[0.35em] uppercase text-[#f7f7f7] mb-8">{t("about.values.title")}</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {VALUES.map(({ key, icon: Icon }) => (
              <div key={key} className="border border-white/10 bg-[#141414] p-6" data-testid={`about-value-${key}`}>
                <Icon className="text-[#D8CA82] mb-4" size={22} aria-hidden="true" />
                <h3 className="font-display font-bold text-[#f7f7f7] mb-2">{t(`about.values.${key}`)}</h3>
                <p className="text-sm text-[#c8c8c8] leading-relaxed">{t(`about.values.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Organisation */}
      <section className="max-w-4xl mx-auto px-4 sm:px-8 py-16" data-testid="about-org">
        <div className="flex items-center gap-3 mb-6">
          <Landmark className="text-[#D8CA82]" size={18} aria-hidden="true" />
          <h2 className="font-display text-base tracking-[0.35em] uppercase text-[#f7f7f7]">{t("about.org.title")}</h2>
        </div>
        <p className="text-[#c8c8c8] leading-relaxed">{t("about.org.text")}</p>
      </section>

      {/* Bureau */}
      <section className="border-t border-white/10 bg-[#0c0c0c]" data-testid="about-bureau">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
          <h2 className="font-display text-base tracking-[0.35em] uppercase text-[#f7f7f7] mb-8">{t("about.bureau.title")}</h2>
          {bureau === null ? (
            <LoadingState testId="about-bureau-loading" />
          ) : bureau.length === 0 ? (
            <p className="text-[#c8c8c8]" data-testid="about-bureau-empty">{t("about.bureau.empty")}</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="about-bureau-grid">
              {bureau.map((m) => (
                <Link key={m.id} to={`/equipe/${m.id}`} className="group border border-white/10 bg-[#141414] hover:border-[#D8CA82]/50 transition-colors overflow-hidden" data-testid={`about-bureau-${m.id}`}>
                  <PlayerPhoto src={m.photo} alt={m.pseudo} className="w-full h-44" />
                  <div className="p-4">
                    <p className="font-display font-bold text-[#f7f7f7] group-hover:text-[#D8CA82] transition-colors">{m.pseudo}</p>
                    <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82]/70 mt-1">{m.ingameRole || t("team.status.staff")}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link to="/equipe" className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#D8CA82] hover:underline">
              {t("team.title")} <ArrowRight size={12} aria-hidden="true" />
            </Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#f7f7f7]/50 hover:text-[#D8CA82]">
              {t("footer.contact")}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
