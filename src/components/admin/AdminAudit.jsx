import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { ScrollText } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";

const inputCls = "bg-[#111111] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

const ACTION_LABELS = {
  user_role_changed: "Changement de rôle",
  user_game_changed: "Changement de jeu",
  user_roster_changed: "Changement de roster",
  match_created: "Match créé",
  match_updated: "Match modifié",
  match_deleted: "Match supprimé",
  match_duplicated: "Match dupliqué",
  match_marked_upcoming: "Match passé à venir",
  matches_imported: "Calendrier importé",
  article_deleted: "Article supprimé",
  article_hard_deleted: "Article supprimé définitivement",
  chat_message_deleted: "Message modéré",
  partner_request_status_changed: "Demande partenaire",
  newsletter_unsubscribed_manually: "Désinscription newsletter",
};

export const AdminAudit = () => {
  const { t, lang } = useLang();
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState("");

  const fmtDate = (ts) => ts?.toDate ? ts.toDate().toLocaleString(lang === "en" ? "en-US" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—";

  useEffect(() => {
    return onSnapshot(collection(db, "admin_audit"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setLogs(list);
    }, console.error);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => [l.action, ACTION_LABELS[l.action], l.label, l.actorName, l.actorEmail, l.targetCollection, l.targetId]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)));
  }, [logs, query]);

  return (
    <div className="space-y-6" data-testid="admin-audit">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <ScrollText className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{t("admin.audit.title")}</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50">{t("admin.audit.sub")}</p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.search.audit")}
          className={`${inputCls} w-full sm:w-80`}
          data-testid="admin-audit-search"
        />
      </div>

      <div className="border border-white/10 bg-[#1A1A1A] overflow-x-auto">
        <table className="w-full text-sm" data-testid="admin-audit-table">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-[#c8c8c8]">
              <th className="px-4 py-3">{t("admin.table.date")}</th>
              <th className="px-4 py-3">{t("admin.table.action")}</th>
              <th className="px-4 py-3">{t("admin.table.target")}</th>
              <th className="px-4 py-3">{t("admin.table.actor")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-[#c8c8c8] text-center">{t("admin.audit.empty")}</td></tr>
            ) : filtered.slice(0, 250).map((l) => (
              <tr key={l.id} className="border-b border-white/5 hover:bg-white/5" data-testid={`admin-audit-row-${l.id}`}>
                <td className="px-4 py-3 text-[#f7f7f7]/50 whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className="text-xs uppercase tracking-widest border border-[#D8CA82]/40 text-[#D8CA82] px-2 py-0.5">
                    {ACTION_LABELS[l.action] || l.action}
                  </span>
                  {l.label && <p className="text-[#f7f7f7] mt-1">{l.label}</p>}
                </td>
                <td className="px-4 py-3 text-[#f7f7f7]/50">
                  {l.targetCollection || "—"}{l.targetId ? ` / ${l.targetId}` : ""}
                </td>
                <td className="px-4 py-3 text-[#f7f7f7]/60">
                  {l.actorName || "—"}{l.actorEmail ? <span className="block text-xs text-[#f7f7f7]/35">{l.actorEmail}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 250 && <p className="text-xs text-[#c8c8c8]">250 {t("admin.audit.lastLines")} {filtered.length} {t("admin.audit.results")}</p>}
    </div>
  );
};
