import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { Download, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { logAdminAction } from "../../lib/notify";
import { ConfirmAction } from "../ConfirmAction";

const inputCls = "bg-[#111111] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const fmtDate = (ts) => ts?.toDate ? ts.toDate().toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—";
const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export const AdminNewsletter = () => {
  const { user, displayName } = useAuth();
  const [subs, setSubs] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "newsletter"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.subscribedAt?.seconds || 0) - (a.subscribedAt?.seconds || 0));
      setSubs(list);
    }, console.error);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter((s) => [s.email, s.lang, s.confirmed ? "confirmé" : "non confirmé"].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [subs, query]);

  const exportCsv = () => {
    const rows = [
      ["email", "langue", "confirmé", "date_inscription"],
      ...filtered.map((s) => [s.email, s.lang || "fr", s.confirmed ? "oui" : "non", fmtDate(s.subscribedAt)]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-elysium-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const unsubscribe = async (sub) => {
    try {
      await deleteDoc(doc(db, "newsletter", sub.id));
      await logAdminAction({
        action: "newsletter_unsubscribed_manually",
        label: sub.email,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "newsletter", id: sub.id },
      });
      toast.success("Abonné désinscrit");
    } catch (e) {
      console.error(e);
      toast.error("Impossible de désinscrire cet email");
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-newsletter">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Mail className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">Newsletter / abonnés</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50">{subs.length} inscrit(s), dont {subs.filter((s) => s.confirmed).length} confirmé(s).</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un email..."
            className={`${inputCls} w-full sm:w-72`}
            data-testid="admin-newsletter-search"
          />
          <button
            type="button"
            onClick={exportCsv}
            className="border border-[#D8CA82]/50 text-[#D8CA82] font-display font-bold uppercase tracking-widest text-xs px-4 py-2.5 flex items-center justify-center gap-2 hover:bg-[#D8CA82]/10"
            data-testid="admin-newsletter-export"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="border border-white/10 bg-[#1A1A1A] overflow-x-auto">
        <table className="w-full text-sm" data-testid="admin-newsletter-table">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-[#f7f7f7]/40">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Langue</th>
              <th className="px-4 py-3">Confirmé</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-[#f7f7f7]/40 text-center">Aucun abonné.</td></tr>
            ) : filtered.map((s) => (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/5" data-testid={`admin-newsletter-row-${s.id}`}>
                <td className="px-4 py-3 text-[#f7f7f7] font-medium">{s.email}</td>
                <td className="px-4 py-3 text-[#f7f7f7]/60 uppercase">{s.lang || "fr"}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 ${s.confirmed ? "text-emerald-300 border-emerald-300/40" : "text-orange-300 border-orange-300/40"}`}>
                    {s.confirmed ? "Oui" : "Non"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#f7f7f7]/50">{fmtDate(s.subscribedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <ConfirmAction
                    title="Désinscrire cet email ?"
                    description={`${s.email} sera retiré de la newsletter.`}
                    confirmLabel="Désinscrire"
                    onConfirm={() => unsubscribe(s)}
                  >
                    <button className="inline-flex items-center gap-1.5 text-red-300/80 hover:text-red-300 text-xs uppercase tracking-widest" data-testid={`admin-newsletter-unsubscribe-${s.id}`}>
                      <Trash2 size={13} /> Désinscrire
                    </button>
                  </ConfirmAction>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
