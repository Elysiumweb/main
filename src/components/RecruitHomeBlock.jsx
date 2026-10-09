import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowRight, Briefcase, Sparkles } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { isRemovedGame } from "../lib/constants";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

/** Nombre de postes mis en avant sur l'accueil (la page recrutement les liste tous). */
const MAX_CARDS = 3;

/**
 * Bloc « Nous recrutons » de la page d'accueil.
 * ----------------------------------------------------------------------------
 * Les postes ouverts vivent dans Firestore (`positions`) et le CTA « Nous
 * rejoindre » est le bouton principal de la navbar — mais rien n'affichait le
 * moindre poste avant qu'on arrive sur /recrutement. On affiche ici les
 * eagerness-to-join : 2-3 postes avec leur date limite, et le compteur total.
 *
 * Le bloc disparaît complètement quand aucun poste n'est ouvert (le site n'a
 * pas toujours de recrutement ouvert — un encart vide serait un signal négatif).
 */
export const RecruitHomeBlock = () => {
  const { t, lang } = useLang();
  const [positions, setPositions] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    return onSnapshot(
      collection(db, "positions"),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.open !== false && p.title && !isRemovedGame(p.game));
        // Échéance la plus proche d'abord, les postes sans date en dernier.
        list.sort((a, b) => (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31"));
        setPositions(list);
        setLoaded(true);
      },
      (err) => {
        console.error("positions sync (accueil)", err);
        setLoaded(true);
      }
    );
  }, []);

  const visible = useMemo(() => positions.slice(0, MAX_CARDS), [positions]);

  const fmtDeadline = (d) => {
    if (!d) return t("home.recruit.noDeadline");
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return `${t("home.recruit.deadline")} : ${dt.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
  };

  if (!loaded || positions.length === 0) return null;

  return (
    <section className="border-y border-white/10 bg-[#141414]" data-testid="home-recruit" aria-labelledby="home-recruit-h2">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <Briefcase className="text-[#D8CA82]" size={20} aria-hidden="true" />
          <h2 id="home-recruit-h2" className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7]">
            {t("home.recruit.title")}
          </h2>
          <span className="text-xs font-display uppercase tracking-[0.2em] text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5" data-testid="home-recruit-count">
            {positions.length} {t("home.recruit.more")}
          </span>
          <div className="flex-1 h-px bg-white/10" />
          <Link
            to="/recrutement"
            data-testid="home-recruit-cta"
            onClick={() => trackEvent(ANALYTICS_EVENTS.RECRUIT_CLICK, { source: "home_recruit_block" })}
            className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
          >
            {t("home.recruit.cta")} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>

        <p className="text-[#c8c8c8] mb-8 max-w-2xl">{t("home.recruit.sub")}</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="home-recruit-grid">
          {visible.map((p) => (
            <article key={p.id} className="border border-white/10 bg-[#111111] p-6 flex flex-col gap-3 hover:border-[#D8CA82]/50 transition-colors" data-testid={`home-recruit-position-${p.id}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display font-bold text-[#f7f7f7]">{p.title}</h3>
                {p.game && (
                  <span className="text-[10px] font-display tracking-[0.25em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-1.5 py-0.5 shrink-0">
                    {p.game}
                  </span>
                )}
              </div>
              {p.prerequisites && <p className="text-sm text-[#c8c8c8]/70 line-clamp-3">{String(p.prerequisites).replace(/[#*_>`-]/g, " ").slice(0, 160)}</p>}
              <p className="text-xs text-[#c8c8c8] mt-auto pt-3 border-t border-white/10">{fmtDeadline(p.deadline)}</p>
            </article>
          ))}
        </div>

        <p className="mt-6 flex items-center gap-2 text-xs text-[#c8c8c8]/70">
          <Sparkles size={13} className="text-[#D8CA82]" aria-hidden="true" />
          <Link to="/recrutement" className="text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]" data-testid="home-recruit-spontaneous">
            {t("recruit.mode.spontaneous.hint")}
          </Link>
        </p>
      </div>
    </section>
  );
};