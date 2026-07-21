import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Trash2, Users, Lock } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";

export default function Notes() {
  const { user, game, isOfficial, displayName } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState("collective");
  const [notes, setNotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const gameKey = game || "EVA";

  useEffect(() => {
    const ref = collection(db, "notes");
    const q = tab === "collective"
      ? query(ref, where("type", "==", "collective"))
      : query(ref, where("ownerUid", "==", user.uid), where("type", "==", "private"));
    return onSnapshot(q, (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (tab === "collective" && !isOfficial) list = list.filter((n) => n.game === gameKey);
      list.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setNotes(list);
    }, console.error);
  }, [tab, user.uid, gameKey, isOfficial]);

  useEffect(() => {
    const n = notes.find((x) => x.id === selected);
    if (n) { setTitle(n.title); setContent(n.content); }
  }, [selected]); // eslint-disable-line

  const create = async () => {
    try {
      const ref = await addDoc(collection(db, "notes"), {
        type: tab, game: gameKey, ownerUid: user.uid, ownerName: displayName,
        title: t("notes.new"), content: "", status: "draft",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setSelected(ref.id); setTitle(t("notes.new")); setContent("");
    } catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  const save = async (status) => {
    if (!selected) return;
    try {
      await updateDoc(doc(db, "notes", selected), { title, content, status, updatedAt: serverTimestamp() });
      toast.success(status === "draft" ? t("notes.draft") : t("notes.saved"));
    } catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "notes", id)); if (selected === id) setSelected(null); }
    catch (e) { toast.error(t("common.error")); }
  };

  return (
    <div className="flex h-full">
      <div className="w-72 border-r border-white/10 bg-[#0f0f0f] flex flex-col shrink-0">
        <div className="flex border-b border-white/10 shrink-0">
          {[["collective", Users, "notes.collective"], ["private", Lock, "notes.private"]].map(([k, Icon, label]) => (
            <button key={k} onClick={() => { setTab(k); setSelected(null); }} data-testid={`notes-tab-${k}`}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-[11px] uppercase tracking-wider border-b-2 transition-colors ${tab === k ? "border-[#D8CA82] text-[#D8CA82]" : "border-transparent text-[#f7f7f7]/50"}`}>
              <Icon size={13} /> {t(label)}
            </button>
          ))}
        </div>
        <button onClick={create} data-testid="notes-new-btn"
          className="m-3 border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest py-2 flex items-center justify-center gap-2 hover:bg-[#D8CA82]/10 transition-colors shrink-0">
          <Plus size={14} /> {t("notes.new")}
        </button>
        <div className="flex-1 overflow-y-auto" data-testid="notes-list">
          {notes.length === 0 && <p className="text-xs text-[#f7f7f7]/30 px-4 py-2">{t("notes.empty")}</p>}
          {notes.map((n) => (
            <div key={n.id} className={`group flex items-center border-b border-white/5 ${selected === n.id ? "bg-[#D8CA82]/10" : "hover:bg-white/5"}`}>
              <button onClick={() => setSelected(n.id)} data-testid={`notes-item-${n.id}`} className="flex-1 text-left px-4 py-3 min-w-0">
                <p className="text-sm text-[#f7f7f7] truncate">{n.title || "—"}</p>
                <p className="text-[10px] text-[#f7f7f7]/40 uppercase tracking-wider">
                  {n.status === "draft" ? t("notes.draft") : t("common.saved")}{tab === "collective" ? ` · ${n.ownerName || ""}` : ""}
                </p>
              </button>
              <button onClick={() => del(n.id)} className="opacity-0 group-hover:opacity-100 px-2 text-red-400/70 hover:text-red-400 transition-opacity" data-testid={`notes-delete-${n.id}`}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="border-b border-white/10 p-3 flex gap-3 items-center shrink-0 bg-[#141414]">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("notes.title")} data-testid="notes-title-input"
                className="flex-1 bg-transparent font-display text-lg text-[#f7f7f7] focus:outline-none" />
              <button onClick={() => save("draft")} data-testid="notes-draft-btn"
                className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-4 py-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">
                {t("notes.draft")}
              </button>
              <button onClick={() => save("saved")} data-testid="notes-save-btn"
                className="bg-[#D8CA82] text-[#111111] text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow">
                {t("notes.save")}
              </button>
            </div>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("notes.content")} data-testid="notes-content-input"
              className="flex-1 bg-[#111111] p-6 text-[#f7f7f7]/90 text-sm leading-relaxed resize-none focus:outline-none" />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#f7f7f7]/30 text-sm" data-testid="notes-no-selection">{t("notes.empty")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
