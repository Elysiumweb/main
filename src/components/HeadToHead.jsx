import { useMemo, useState } from "react";
import { Swords, Trophy, Skull, Minus } from "lucide-react";
import { useLang } from "../lib/i18n";
import { getElysiumTeamName } from "../lib/constants";

/* ---------------------------------------------------------------------------
 * Face-à-face (H2H) : historique des confrontations contre un adversaire.
 * Utilisé sur la page Résultats ; alimenté par les matchs saisis en admin.
 * ------------------------------------------------------------------------- */

export const computeHeadToHead = (matches, opponentName) => {
  if (!opponentName || !matches || !Array.isArray(matches)) return null;
  const name = String(opponentName).trim().toLowerCase();
  const list = matches
    .filter((m) => (m.opponentName || "").trim().toLowerCase() === name && m.status !== "upcoming")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (list.length === 0) return null;

  const wins = list.filter((m) => Number(m.scoreUs) > Number(m.scoreThem)).length;
  const losses = list.filter((m) => Number(m.scoreUs) < Number(m.scoreThem)).length;
  const draws = list.length - wins - losses;
  const scoreFor = list.reduce((s, m) => s + (Number(m.scoreUs) || 0), 0);
  const scoreAgainst = list.reduce((s, m) => s + (Number(m.scoreThem) || 0), 0);

  return { opponentName: list[0].opponentName, total: list.length, wins, losses, draws, scoreFor, scoreAgainst, matches: list.slice(0, 6) };
};

export const HeadToHead = ({ matches, opponentName, testId = "h2h" }) => {
  const { t } = useLang();
  const h2h = useMemo(() => computeHeadToHead(matches, opponentName), [matches, opponentName]);

  if (!h2h) return null;

  const rows = [
    { label: t("h2h.wins"), value: h2h.wins, cls: "text-emerald-300", Icon: Trophy },
    { label: t("h2h.losses"), value: h2h.losses, cls: "text-red-300", Icon: Skull },
    { label: t("h2h.draws"), value: h2h.draws, cls: "text-[#c8c8c8]", Icon: Minus },
  ];

  return (
    <div className="border border-white/10 bg-[#141414] p-5" data-testid={testId}>
      <div className="flex items-center gap-3 mb-4">
        <Swords size={15} className="text-[#D8CA82]" aria-hidden="true" />
        <p className="font-display text-xs uppercase tracking-[0.3em] text-[#f7f7f7]">
          {t("h2h.title")} <span className="text-[#D8CA82]">{h2h.opponentName}</span>
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {rows.map(({ label, value, cls, Icon }) => (
          <div key={label} className="border border-white/10 bg-[#1A1A1A] p-3 text-center">
            <Icon size={13} className={`mx-auto mb-1 ${cls}`} aria-hidden="true" />
            <p className={`font-display font-black text-2xl ${cls}`}>{value}</p>
            <p className="text-[9px] uppercase tracking-widest text-[#f7f7f7]/40">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[#f7f7f7]/50 mb-3">
        {t("h2h.total")} : <span className="text-[#f7f7f7]">{h2h.total}</span> — {t("h2h.score")} :{" "}
        <span className="text-[#f7f7f7]">{h2h.scoreFor} — {h2h.scoreAgainst}</span>
      </p>
      <div className="space-y-1.5" data-testid={`${testId}-matches`}>
        {h2h.matches.map((m) => {
          const r = Number(m.scoreUs) > Number(m.scoreThem) ? "win" : Number(m.scoreUs) < Number(m.scoreThem) ? "loss" : "draw";
          return (
            <div key={m.id} className="flex items-center gap-3 text-xs text-[#c8c8c8]">
              <span className="w-24 shrink-0 text-[#f7f7f7]/50">{m.date}</span>
              <span className="flex-1 truncate">
                {getElysiumTeamName(m.roster)} vs {m.opponentName}
              </span>
              <span className={`font-display font-bold ${r === "win" ? "text-emerald-300" : r === "loss" ? "text-red-300" : "text-[#c8c8c8]"}`}>
                {m.scoreUs}—{m.scoreThem}
              </span>
              {m.competition && <span className="w-24 truncate text-right text-[#f7f7f7]/40">{m.competition}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Sélecteur d'adversaire (issu des matchs existants) + panneau H2H. */
export const HeadToHeadPanel = ({ matches, testId = "h2h-panel" }) => {
  const { t } = useLang();
  const opponents = useMemo(() =>
    [...new Map((matches || [])
      .filter((m) => m.opponentName)
      .map((m) => [m.opponentName.trim().toLowerCase(), m.opponentName]))
      .values()].sort((a, b) => a.localeCompare(b)),
  [matches]);
  const [selected, setSelected] = useState("");

  if (opponents.length === 0) return null;

  return (
    <div className="space-y-4" data-testid={testId}>
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label htmlFor="h2h-opponent" className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">
            {t("h2h.choose")}
          </label>
          <select id="h2h-opponent" value={selected} onChange={(e) => setSelected(e.target.value)} data-testid={`${testId}-select`}
            className="bg-[#1A1A1A] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]">
            <option value="">{t("h2h.placeholder")}</option>
            {opponents.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      {selected && <HeadToHead matches={matches} opponentName={selected} testId={`${testId}-content`} />}
    </div>
  );
};
