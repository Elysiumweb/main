import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Target, CheckCircle2 } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";

/* ---------------------------------------------------------------------------
 * Barre de progression d'un objectif de campagne (ex : « Objectif LAN 2026 »).
 * Données saisies manuellement en admin (comptabilité de l'association).
 * ------------------------------------------------------------------------- */

export const CampaignProgress = ({ compact = false, testId = "campaign-progress" }) => {
  const { t, lang } = useLang();
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, "campaigns"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => c.active && Number(c.goalAmount) > 0)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setCampaigns(list);
    }, () => {});
  }, []);

  if (campaigns.length === 0) return null;
  const campaign = campaigns[0];
  const pct = Math.min(100, Math.round((Number(campaign.currentAmount) / Number(campaign.goalAmount)) * 100));
  const reached = pct >= 100;

  return (
    <div className="panel clip-blade-sm border border-primary/30 p-5" data-testid={testId}>
      <div className="flex items-center gap-2 mb-2">
        <Target size={14} className="text-primary shrink-0" aria-hidden="true" />
        <p className={`eyebrow ${compact ? "text-[0.62rem]" : "text-[0.68rem]"}`}>
          {campaign.title}
        </p>
        {reached && (
          <span className="ml-auto text-xs uppercase tracking-widest text-emerald-300 flex items-center gap-1">
            <CheckCircle2 size={11} aria-hidden="true" /> {t("campaign.reached")}
          </span>
        )}
      </div>
      <div className="clip-blade-sm h-2.5 bg-primary/10 overflow-hidden mb-2">
        <div
          className={`h-full transition-all ${reached ? "bg-emerald-400" : "bg-gold"}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${campaign.title} — ${pct}%`}
        />
      </div>
      <p className="text-xs text-foreground/60">
        {t("campaign.progress")} <span className="font-display font-bold text-primary">{Number(campaign.currentAmount).toLocaleString(lang === "en" ? "en-US" : "fr-FR")} €</span>
        {" / "}
        <span className="text-foreground">{Number(campaign.goalAmount).toLocaleString(lang === "en" ? "en-US" : "fr-FR")} €</span>
        <span className="text-muted-foreground ml-2">({pct}%)</span>
      </p>
    </div>
  );
};
