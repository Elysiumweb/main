import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { Mail, Handshake } from "lucide-react";
import { toast } from "sonner";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { logAdminAction } from "../../lib/notify";

const inputCls = "bg-[#111111] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export const AdminPartnerRequests = () => {
  const { user, displayName } = useAuth();
  const { t, lang } = useLang();
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState("");

  const STATUSES = [
    { id: "new", label: t("admin.partnerRequests.statusNew"), cls: "text-sky-300 border-sky-300/40" },
    { id: "contacted", label: t("admin.partnerRequests.statusContacted"), cls: "text-[#D8CA82] border-[#D8CA82]/40" },
    { id: "won", label: t("admin.partnerRequests.statusWon"), cls: "text-emerald-300 border-emerald-300/40" },
  ];

  const statusLabel = (status) => STATUSES.find((s) => s.id === (status || "new"))?.label || t("admin.partnerRequests.statusNew");
  const statusCls = (status) => STATUSES.find((s) => s.id === (status || "new"))?.cls || STATUSES[0].cls;

  const fmtReqDate = (ts) => ts?.toDate ? ts.toDate().toLocaleString(lang === "en" ? "en-US" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—";

  useEffect(() => {
    return onSnapshot(collection(db, "partner_requests"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRequests(list);
    }, console.error);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => [r.name, r.company, r.email, r.budget, r.message]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)));
  }, [requests, query]);

  const setStatus = async (req, status) => {
    try {
      await updateDoc(doc(db, "partner_requests", req.id), { status });
      await logAdminAction({
        action: "partner_request_status_changed",
        label: `${req.company || req.name || req.email} → ${statusLabel(status)}`,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "partner_requests", id: req.id },
        details: { previousStatus: req.status || "new", status },
      });
      toast.success(t("common.saved"));
    } catch (e) {
      console.error(e);
      toast.error(t("common.error"));
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-partner-requests">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Handshake className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{t("admin.partnerRequests.title")}</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50">{t("admin.partnerRequests.sub")}</p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.search.partners")}
          className={`${inputCls} w-full sm:w-80`}
          data-testid="admin-partners-search"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-[#f7f7f7]/40 border border-white/10 bg-[#1A1A1A] p-6">{t("admin.partnerRequests.empty")}</p>
      ) : (
        <div className="grid gap-4">
          {filtered.map((r) => {
            const subject = encodeURIComponent(`Partenariat Elysium × ${r.company || "votre entreprise"}`);
            const body = encodeURIComponent(`Bonjour ${r.name || ""},\n\nMerci pour votre demande de partenariat avec Elysium.\n\n`);
            return (
              <article key={r.id} className="border border-white/10 bg-[#1A1A1A] p-5" data-testid={`admin-partner-request-${r.id}`}>
                <div className="flex flex-col lg:flex-row lg:items-start gap-4 justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 ${statusCls(r.status)}`}>{statusLabel(r.status)}</span>
                      <span className="text-xs text-[#f7f7f7]/35">{fmtReqDate(r.createdAt)}</span>
                    </div>
                    <h3 className="font-display font-bold text-[#f7f7f7] mt-3 text-lg truncate">{r.company || "Entreprise"}</h3>
                    <p className="text-sm text-[#f7f7f7]/55 mt-1">
                      {r.name || "Contact"} · <a className="text-[#D8CA82] hover:underline" href={`mailto:${r.email}`}>{r.email}</a>
                      {r.budget ? ` · Budget : ${r.budget}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap shrink-0">
                    <select
                      value={r.status || "new"}
                      onChange={(e) => setStatus(r, e.target.value)}
                      className={inputCls}
                      data-testid={`admin-partner-status-${r.id}`}
                    >
                      {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <a
                      href={`mailto:${r.email}?subject=${subject}&body=${body}`}
                      onClick={() => r.status !== "contacted" && setStatus(r, "contacted")}
                      className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-4 py-2.5 flex items-center gap-2 hover:shadow-[0_0_16px_rgba(216,202,130,0.35)]"
                      data-testid={`admin-partner-reply-${r.id}`}
                    >
                      <Mail size={14} /> {t("admin.partnerRequests.replyEmail")}
                    </a>
                  </div>
                </div>
                {r.message && <p className="mt-4 text-sm text-[#f7f7f7]/70 whitespace-pre-wrap border-t border-white/10 pt-4">{r.message}</p>}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
