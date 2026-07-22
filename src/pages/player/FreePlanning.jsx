import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { CalendarDays, Trash2, Plus } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { createNotification, logActivity } from "../../lib/notify";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export default function FreePlanning() {
  const { user, game, canManage, role, displayName } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ title: "", date: "", time: "", description: "" });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Pour Rocket League on utilise une collection dédiée "freerows"
  const collectionName = game === "Rocket League" ? "freerows_rl" : "freerows";

  useEffect(() => {
    return onSnapshot(collection(db, collectionName), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Pour les non-manageurs on filtre par jeu
      if (!canManage) {
        const userGame = role === "manager" ? game : game;
        const filtered = list.filter((r) => r.game === userGame || !r.game);
        filtered.sort((a, b) => (a.dateSort || "").localeCompare(b.dateSort || ""));
        setRows(filtered);
      } else {
        list.sort((a, b) => (a.dateSort || "").localeCompare(b.dateSort || ""));
        setRows(list);
      }
    }, console.error);
  }, [game, canManage, collectionName, role]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.date) return toast.error("Titre et date requis");
    try {
      const dateSort = `${form.date}${form.time ? "T" + form.time : "T00:00"}`;
      const userGame = role === "manager" ? game : (game || "EVA");
      await addDoc(collection(db, collectionName), {
        title: form.title.trim(),
        date: form.date,
        time: form.time || "",
        description: form.description.trim(),
        game: userGame,
        dateSort,
        createdBy: user.uid,
        createdByName: displayName,
        createdAt: serverTimestamp(),
      });
      setForm({ title: "", date: "", time: "", description: "" });
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const del = async (id) => {
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (e) { toast.error(t("common.error")); }
  };

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => (r.date || "") >= now);
  const past = rows.filter((r) => (r.date || "") < now).reverse();

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <CalendarDays size={20} className="text-[#D8CA82]" />
          <h2 className="font-display text-base uppercase tracking-[0.3em] text-[#f7f7f7]">
            {t("player.planning")} — {game || "EVA"}
          </h2>
        </div>

        {/* Formulaire - visible pour tous */}
        <form onSubmit={add} className="border border-white/10 bg-[#141414] p-5">
          <p className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4">{t("planning自由.add")}</p>
          <div className="grid sm:grid-cols-4 gap-3">
            <input
              value={form.title}
              onChange={set("title")}
              placeholder={t("planning自由.title")}
              required
              className={inputCls}
            />
            <input
              type="date"
              value={form.date}
              onChange={set("date")}
              required
              className={inputCls}
            />
            <input
              type="time"
              value={form.time}
              onChange={set("time")}
              placeholder={t("planning自由.time")}
              className={inputCls}
            />
            <input
              value={form.description}
              onChange={set("description")}
              placeholder={t("planning自由.description")}
              className={inputCls}
            />
          </div>
          <button type="submit"
            className="mt-4 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-6 py-2.5 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow flex items-center gap-2">
            <Plus size={14} /> {t("planning自由.add")}
          </button>
        </form>

        {/* Tableau style Google Sheets */}
        <div className="overflow-x-auto border border-white/10 bg-[#0d0d0d]">
          {/* Header du tableau */}
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-white/10 bg-[#141414]">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-[#D8CA82] font-display w-16">{t("planning自由.delete")}</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-[#f7f7f7]/60 font-display">{t("planning自由.title")}</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-[#f7f7f7]/60 font-display w-32">{t("planning自由.date")}</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-[#f7f7f7]/60 font-display w-24">{t("planning自由.time")}</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-[#f7f7f7]/60 font-display">{t("planning自由.description")}</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.length === 0 && past.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-[#f7f7f7]/40 text-sm">
                    {t("planning自由.empty")}
                  </td>
                </tr>
              ) : (
                <>
                  {upcoming.map((row) => (
                    <PlanningRow key={row.id} row={row} onDelete={del} canDelete={canManage} t={t} />
                  ))}
                  {past.length > 0 && (
                    <>
                      <tr className="border-t border-white/5">
                        <td colSpan={5} className="px-4 py-2 text-[10px] uppercase tracking-widest text-[#f7f7f7]/20">
                          Passés
                        </td>
                      </tr>
                      {past.map((row) => (
                        <PlanningRow key={row.id} row={row} onDelete={del} canDelete={canManage} t={t} past />
                      ))}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Hint pour manageurs */}
        {canManage && (
          <p className="text-xs text-[#f7f7f7]/30 text-center">{t("planning自由.managerHint")}</p>
        )}
      </div>
    </div>
  );
}

function PlanningRow({ row, onDelete, canDelete, t, past }) {
  const d = row.date ? new Date(row.date) : null;
  return (
    <tr className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${past ? "opacity-50" : ""}`}>
      <td className="px-4 py-3">
        {canDelete && (
          <button
            onClick={() => onDelete(row.id)}
            className="text-red-400/50 hover:text-red-400 transition-colors"
            title={t("planning自由.delete")}
          >
            <Trash2 size={14} />
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-[#f7f7f7] font-medium">{row.title}</td>
      <td className="px-4 py-3 text-sm text-[#f7f7f7]/70">
        {d ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
      </td>
      <td className="px-4 py-3 text-sm text-[#f7f7f7]/70">{row.time || "—"}</td>
      <td className="px-4 py-3 text-sm text-[#f7f7f7]/50">{row.description || "—"}</td>
    </tr>
  );
}
