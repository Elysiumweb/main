import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, orderBy, deleteField } from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Trash2, Users, Lock, Search, History, RotateCcw, Trash, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { logActivity } from "../../lib/notify";

const TRASH_RETENTION_DAYS = 30;

export default function Notes() {
  const { user, game, isOfficial, displayName } = useAuth();
  const { t, lang } = useLang();
  const [tab, setTab] = useState("collective");
  const [view, setView] = useState("active"); // active | trash
  const [notes, setNotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [search, setSearch] = useState("");
  const [versions, setVersions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
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
    if (n) { setTitle(n.title); setContent(n.content); setTagsInput((n.tags || []).join(", ")); }
  }, [selected]); // eslint-disable-line

  // Historique des versions de la note sélectionnée.
  useEffect(() => {
    if (!selected) { setVersions([]); return; }
    const q = query(collection(db, "notes", selected, "versions"), orderBy("savedAt", "desc"));
    return onSnapshot(q, (snap) => setVersions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
  }, [selected]);

  const create = async () => {
    try {
      const ref = await addDoc(collection(db, "notes"), {
        type: tab, game: gameKey, ownerUid: user.uid, ownerName: displayName,
        title: t("notes.new"), content: "", tags: [], status: "draft",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      if (tab === "collective") logActivity({ game: gameKey, type: "note_created", label: t("notes.new"), byUid: user.uid, byName: displayName });
      setView("active");
      setSelected(ref.id); setTitle(t("notes.new")); setContent(""); setTagsInput("");
    } catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  // Sauvegarde une version (snapshot de l'état précédent) puis met à jour la note.
  const snapshotVersion = async (n) => {
    if (!n) return;
    try {
      await addDoc(collection(db, "notes", n.id, "versions"), {
        title: n.title || "", content: n.content || "", tags: n.tags || [],
        savedAt: serverTimestamp(), by: displayName, uid: user.uid,
      });
    } catch (e) { console.error("version snapshot", e); }
  };

  const save = async (status) => {
    if (!selected) return;
    try {
      const tags = tagsInput.split(",").map((s) => s.trim()).filter(Boolean);
      const current = notes.find((x) => x.id === selected);
      // On archive l'état précédent avant d'écraser (seulement s'il y a du contenu).
      if (current && ((current.content && current.content !== content) || (current.title !== title))) {
        await snapshotVersion(current);
      }
      await updateDoc(doc(db, "notes", selected), { title, content, tags, status, updatedAt: serverTimestamp() });
      toast.success(status === "draft" ? t("notes.draft") : t("notes.saved"));
    } catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  // Corbeille : suppression douce (deletedAt), restauration, suppression définitive.
  const moveToTrash = async (id) => {
    try {
      const n = notes.find((x) => x.id === id);
      await updateDoc(doc(db, "notes", id), { deletedAt: serverTimestamp() });
      if (n?.type === "collective") logActivity({ game: gameKey, type: "note_deleted", label: n.title, byUid: user.uid, byName: displayName });
      if (selected === id) setSelected(null);
    } catch (e) { toast.error(t("common.error")); }
  };

  const restore = async (id) => {
    try {
      await updateDoc(doc(db, "notes", id), { deletedAt: deleteField() });
      toast.success(t("notes.restore"));
    } catch (e) { toast.error(t("common.error")); }
  };

  const deleteForever = async (id) => {
    if (!window.confirm(t("notes.deleteConfirm"))) return;
    try {
      await deleteDoc(doc(db, "notes", id));
      if (selected === id) setSelected(null);
    } catch (e) { toast.error(t("common.error")); }
  };

  const restoreVersion = async (v) => {
    if (!selected || !window.confirm(t("notes.restoreVersionConfirm"))) return;
    try {
      const current = notes.find((x) => x.id === selected);
      if (current) await snapshotVersion(current); // ne pas perdre l'état courant
      await updateDoc(doc(db, "notes", selected), {
        title: v.title || "", content: v.content || "", tags: v.tags || [], updatedAt: serverTimestamp(),
      });
      setTitle(v.title || ""); setContent(v.content || ""); setTagsInput((v.tags || []).join(", "));
      toast.success(t("notes.saved"));
      setShowHistory(false);
    } catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  const isWithinRetention = (n) => {
    if (!n.deletedAt) return false;
    const ms = (n.deletedAt.seconds || 0) * 1000;
    return Date.now() - ms < TRASH_RETENTION_DAYS * 86400000;
  };

  const visible = notes.filter((n) => {
    const inTrash = !!n.deletedAt;
    if (view === "active" && inTrash) return false;
    if (view === "trash" && !isWithinRetention(n)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (n.title || "").toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q) || (n.tags || []).some((tg) => tg.toLowerCase().includes(q));
  });

  const currentNote = notes.find((x) => x.id === selected);

  return (
    <div className="flex h-full">
      <div className="w-72 border-r border-white/10 bg-[#0f0f0f] flex flex-col shrink-0">
        <div className="flex border-b border-white/10 shrink-0">
          {[[("collective"), Users, "notes.collective"], ["private", Lock, "notes.private"]].map(([k, Icon, label]) => (
            <button key={k} onClick={() => { setTab(k); setSelected(null); }} data-testid={`notes-tab-${k}`}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs uppercase tracking-wider border-b-2 transition-colors ${tab === k ? "border-[#D8CA82] text-[#D8CA82]" : "border-transparent text-[#f7f7f7]/50"}`}>
              <Icon size={13} /> {t(label)}
            </button>
          ))}
        </div>
        {/* Bascule actif / corbeille */}
        <div className="flex border-b border-white/10 shrink-0">
          <button onClick={() => { setView("active"); setSelected(null); }} data-testid="notes-view-active"
            className={`flex-1 py-2 text-xs uppercase tracking-widest ${view === "active" ? "text-[#D8CA82] bg-[#D8CA82]/10" : "text-[#c8c8c8] hover:text-[#f7f7f7]"}`}>
            {t("notes.all")}
          </button>
          <button onClick={() => { setView("trash"); setSelected(null); }} data-testid="notes-view-trash"
            className={`flex-1 py-2 text-xs uppercase tracking-widest flex items-center justify-center gap-1 ${view === "trash" ? "text-red-300 bg-red-500/10" : "text-[#c8c8c8] hover:text-[#f7f7f7]"}`}>
            <Trash size={11} /> {t("notes.trash")}
          </button>
        </div>
        {view === "active" && (
          <button onClick={create} data-testid="notes-new-btn"
            className="m-3 border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest py-2 flex items-center justify-center gap-2 hover:bg-[#D8CA82]/10 transition-colors shrink-0">
            <Plus size={14} /> {t("notes.new")}
          </button>
        )}
        {view === "trash" && (
          <p className="mx-3 my-3 text-xs text-[#c8c8c8] leading-relaxed shrink-0">{t("notes.trashHint")}</p>
        )}
        <div className="mx-3 mb-2 relative shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#c8c8c8]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("notes.search")} data-testid="notes-search-input"
            className="w-full bg-[#111111] border border-white/15 pl-8 pr-2 py-1.5 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
        </div>
        <div className="flex-1 overflow-y-auto" data-testid="notes-list">
          {visible.length === 0 && <p className="text-xs text-[#c8c8c8] px-4 py-2" data-testid="notes-empty">{view === "trash" ? t("notes.trash.empty") : t("notes.empty")}</p>}
          {visible.map((n) => (
            <div key={n.id} className={`group flex items-center border-b border-white/5 ${selected === n.id ? "bg-[#D8CA82]/10" : "hover:bg-white/5"}`}>
              <button onClick={() => { setSelected(n.id); setShowHistory(false); }} data-testid={`notes-item-${n.id}`} className="flex-1 text-left px-4 py-3 min-w-0">
                <p className="text-sm text-[#f7f7f7] truncate">{n.title || "—"}</p>
                <p className="text-xs text-[#c8c8c8] uppercase tracking-wider">
                  {n.status === "draft" ? t("notes.draft") : t("common.saved")}{tab === "collective" ? ` · ${n.ownerName || ""}` : ""}
                  {(n.tags || []).length > 0 && <span className="text-[#D8CA82]/60"> · {n.tags.join(", ")}</span>}
                </p>
              </button>
              {view === "active" ? (
                <button onClick={() => moveToTrash(n.id)} title={t("chat.delete")} className="opacity-0 group-hover:opacity-100 px-2 text-red-400/70 hover:text-red-400 transition-opacity" data-testid={`notes-delete-${n.id}`}>
                  <Trash2 size={13} />
                </button>
              ) : (
                <div className="flex items-center px-1">
                  <button onClick={() => restore(n.id)} title={t("notes.restore")} data-testid={`notes-restore-${n.id}`} className="px-1.5 text-[#D8CA82]/70 hover:text-[#D8CA82]"><RotateCcw size={13} /></button>
                  <button onClick={() => deleteForever(n.id)} title={t("notes.deleteForever")} data-testid={`notes-forever-${n.id}`} className="px-1.5 text-red-400/70 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {selected && currentNote && !currentNote.deletedAt ? (
          <>
            <div className="border-b border-white/10 p-3 flex gap-3 items-center shrink-0 bg-[#141414]">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("notes.title")} data-testid="notes-title-input"
                className="flex-1 bg-transparent font-display text-lg text-[#f7f7f7] focus:outline-none" />
              <button onClick={() => setShowHistory((s) => !s)} title={t("notes.history")} data-testid="notes-history-btn"
                className={`flex items-center gap-1.5 border px-3 py-2 text-xs uppercase tracking-widest ${showHistory ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/25 text-[#f7f7f7]/70 hover:border-[#D8CA82] hover:text-[#D8CA82]"}`}>
                <History size={13} /> {t("notes.history")} {versions.length > 0 && <span className="text-xs opacity-60">({versions.length})</span>}
              </button>
              <button onClick={() => save("draft")} data-testid="notes-draft-btn"
                className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-4 py-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">
                {t("notes.draft")}
              </button>
              <button onClick={() => save("saved")} data-testid="notes-save-btn"
                className="bg-[#D8CA82] text-[#111111] text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow">
                {t("notes.save")}
              </button>
            </div>
            <div className="flex-1 flex min-h-0">
              <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("notes.content")} data-testid="notes-content-input"
                className="flex-1 bg-[#111111] p-6 text-[#f7f7f7]/90 text-sm leading-relaxed resize-none focus:outline-none" />
              {showHistory && (
                <aside className="w-72 border-l border-white/10 bg-[#0f0f0f] overflow-y-auto shrink-0" data-testid="notes-history-panel">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <p className="text-xs uppercase tracking-[0.25em] text-[#f7f7f7]/50">{t("notes.history")}</p>
                    <button onClick={() => setShowHistory(false)} className="text-[#c8c8c8] hover:text-[#f7f7f7]"><X size={14} /></button>
                  </div>
                  {versions.length === 0 ? (
                    <p className="text-xs text-[#c8c8c8] px-4 py-3" data-testid="notes-history-empty">{t("notes.history.empty")}</p>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {versions.map((v) => (
                        <div key={v.id} className="px-4 py-3 hover:bg-white/5" data-testid={`notes-version-${v.id}`}>
                          <p className="text-xs text-[#c8c8c8] uppercase tracking-wider">
                            {v.savedAt?.toDate ? v.savedAt.toDate().toLocaleString(lang === "en" ? "en-US" : "fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                            {v.by ? ` · ${t("notes.versionBy")} ${v.by}` : ""}
                          </p>
                          <p className="text-sm text-[#f7f7f7] truncate mt-0.5">{v.title || "—"}</p>
                          <p className="text-xs text-[#c8c8c8] line-clamp-2 mt-0.5">{v.content}</p>
                          <button onClick={() => restoreVersion(v)} data-testid={`notes-restore-version-${v.id}`}
                            className="mt-2 flex items-center gap-1.5 text-xs uppercase tracking-widest border border-[#D8CA82]/40 text-[#D8CA82] px-2.5 py-1 hover:bg-[#D8CA82]/10">
                            <RotateCcw size={11} /> {t("notes.restoreVersion")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </aside>
              )}
            </div>
            <div className="border-t border-white/10 px-4 py-2 bg-[#141414] shrink-0">
              <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder={t("notes.tags")} data-testid="notes-tags-input"
                className="w-full bg-transparent text-xs text-[#D8CA82] focus:outline-none placeholder:text-[#f7f7f7]/25" />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#c8c8c8] text-sm" data-testid="notes-no-selection">{view === "trash" ? t("notes.trash.empty") : t("notes.empty")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
