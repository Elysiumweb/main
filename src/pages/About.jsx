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
    <div className="min-h-[70vh] bg-transparent">
      <section className="relative overflow-hidden pt-6 sm:pt-10">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb className="opacity-80" items={[{ label: t("about.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl uppercase leading-[0.95] text-gold" data-testid="about-title">{t("about.title")}</h1>
          <p className="text-foreground/50 mt-4 tracking-wide">{t("about.sub")}</p>
        </div>
      </section>

      {/* Histoire + chronologie — D-03 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="about-history">
        <div className="grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 mb-6">
              <ScrollText className="text-primary" size={18} aria-hidden="true" />
              <h2 className="eyebrow">{t("about.history.title")}</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed text-lg">{t("about.history.text")}</p>
            {/* Chronologie */}
            <div className="mt-10 border-l border-primary/30 pl-6 space-y-6" data-testid="about-timeline">
              <div className="relative"><span className="absolute -left-[29px] top-1 w-3 h-3 bg-gold rounded-full"/><p className="font-display font-bold text-foreground">Juillet 2026 — Fondation</p><p className="text-sm text-muted-foreground">Création de l’association, premier roster EVA, slogan “Not given. Earned.”</p></div>
              <div className="relative"><span className="absolute -left-[29px] top-1 w-3 h-3 bg-primary/60 rounded-full"/><p className="font-display font-bold text-foreground">Juillet 2026 — Expansion RL</p><p className="text-sm text-muted-foreground">Ouverture du pôle Rocket League.</p></div>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="panel clip-blade-sm p-4" data-testid="about-real-images">
              <div className="h-64 bg-background/70 border border-border/20 flex items-center justify-center overflow-hidden">
                <img src="/brand/pattern.png" alt="" className="w-full h-full object-cover opacity-20 contrast-125 saturate-[0.85]" />
                <span className="absolute text-xs uppercase tracking-widest text-muted-foreground">Photos réelles — entraînements, LAN, coulisses</span>
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">Bibliothèque visuelle : portraits cohérents, matchs EVA/LAN, captures RL aux droits maîtrisés — traitement contraste fort, légère désaturation, grain.</p>
            </div>
            {/* Chiffres-clés */}
            <div className="grid grid-cols-3 gap-3 mt-6" data-testid="about-key-figures">
              <div className="border border-primary/30 bg-card p-4 text-center"><p className="font-display font-black text-2xl text-primary">2</p><p className="text-xs uppercase tracking-widest text-muted-foreground">Pôles</p></div>
              <div className="panel clip-blade-sm p-4 text-center"><p className="font-display font-black text-2xl text-foreground">2026</p><p className="text-xs uppercase tracking-widest text-muted-foreground">Fondation</p></div>
              <div className="panel clip-blade-sm p-4 text-center"><p className="font-display font-black text-2xl text-foreground">100%</p><p className="text-xs uppercase tracking-widest text-muted-foreground">Bénévole</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* Valeurs */}
      <section className="border-y border-border/25 bg-background/70" data-testid="about-values">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
          <h2 className="eyebrow mb-8">{t("about.values.title")}</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {VALUES.map(({ key, icon: Icon }) => (
              <div key={key} className="panel clip-blade-sm p-6" data-testid={`about-value-${key}`}>
                <Icon className="text-primary mb-4" size={22} aria-hidden="true" />
                <h3 className="font-display font-bold text-foreground mb-2">{t(`about.values.${key}`)}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t(`about.values.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Organisation */}
      <section className="max-w-4xl mx-auto px-4 sm:px-8 py-16" data-testid="about-org">
        <div className="flex items-center gap-3 mb-6">
          <Landmark className="text-primary" size={18} aria-hidden="true" />
          <h2 className="eyebrow">{t("about.org.title")}</h2>
        </div>
        <p className="text-muted-foreground leading-relaxed">{t("about.org.text")}</p>
      </section>

      {/* Bureau */}
      <section className="border-t border-border/25 bg-background/70" data-testid="about-bureau">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
          <h2 className="eyebrow mb-8">{t("about.bureau.title")}</h2>
          {bureau === null ? (
            <LoadingState testId="about-bureau-loading" />
          ) : bureau.length === 0 ? (
            <p className="text-muted-foreground" data-testid="about-bureau-empty">{t("about.bureau.empty")}</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="about-bureau-grid">
              {bureau.map((m) => (
                <Link key={m.id} to={`/equipe/${m.id}`} className="group panel clip-blade-sm hover:border-primary/50 transition-colors overflow-hidden" data-testid={`about-bureau-${m.id}`}>
                  <PlayerPhoto src={m.photo} alt={m.pseudo} className="w-full h-44" />
                  <div className="p-4">
                    <p className="font-display font-bold text-foreground group-hover:text-primary transition-colors">{m.pseudo}</p>
                    <p className="text-xs uppercase tracking-[0.25em] text-primary/70 mt-1">{m.ingameRole || t("team.status.staff")}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link to="/equipe" className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-primary hover:underline">
              {t("team.title")} <ArrowRight size={12} aria-hidden="true" />
            </Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-foreground/50 hover:text-primary">
              {t("footer.contact")}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
