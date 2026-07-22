import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Trash2, LayoutDashboard } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { InfiniteCanvas } from "../../components/InfiniteCanvas";
import { logActivity } from "../../lib/notify";

export default function CanvasSpace() {
  const { user, game, isOfficial, displayName } = useAuth();
  const { t } = useLang();
  const [canvases, setCanvases] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const gameKey = game || "EVA";

  useEffect(() => {
    return onSnapshot(collection(db, "canvases"), (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!isOfficial) list = list.filter((c) => c.game === gameKey);
      list.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setCanvases(list);
    }, console.error);
  }, [gameKey, isOfficial]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const ref = await addDoc(collection(db, "canvases"), {
        game: gameKey, title: name.trim(), status: "draft", items: [],
        createdBy: user.uid, createdByName: displayName,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setName(""); setOpenId(ref.id);
      logActivity({ game: gameKey, type: "canvas_created", label: name.trim(), byUid: user.uid, byName: displayName });
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const save = async (items, status) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "canvases", openId), { items, status, updatedAt: serverTimestamp() });
      toast.success(status === "draft" ? t("canvas.draft") : t("common.saved"));
    } catch (e) { console.error(e); toast.error(t("common.error")); }
    setSaving(false);
  };

  const del = async (id) => {
    try {
      const c = canvases.find((x) => x.id === id);
      await deleteDoc(doc(db, "canvases", id));
      if (c) logActivity({ game: gameKey, type: "canvas_deleted", label: c.title, byUid: user.uid, byName: displayName });
    } catch (e) { toast.error(t("common.error")); }
  };

  const current = canvases.find((c) => c.id === openId);

  if (current) {
    return <InfiniteCanvas key={current.id} initialItems={current.items || []} onSave={save} saving={saving}
      title={current.title} status={current.status} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <LayoutDashboard size={16} className="text-[#D8CA82]" />
          <h2 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("player.canvas")}</h2>
        </div>
        <form onSubmit={create} className="flex gap-3 mb-8" data-testid="canvas-create-form">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("canvas.name")} data-testid="canvas-name-input"
            className="flex-1 bg-[#1A1A1A] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
          <button type="submit" data-testid="canvas-create-btn"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 flex items-center gap-2 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow">
            <Plus size={14} /> {t("canvas.new")}
          </button>
        </form>
        {canvases.length === 0 ? (
          <p className="text-[#f7f7f7]/40" data-testid="canvas-list-empty">{t("canvas.empty")}</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="canvas-list">
            {canvases.map((c) => (
              <div key={c.id} className="group border border-white/10 bg-[#1A1A1A] p-5 hover:border-[#D8CA82]/50 transition-colors relative">
                <button onClick={() => setOpenId(c.id)} className="text-left w-full" data-testid={`canvas-open-${c.id}`}>
                  <p className="font-display text-[#f7f7f7] truncate">{c.title}</p>
                  <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 mt-2">
                    {c.status === "draft" ? t("canvas.draft") : t("common.saved")} · {c.game} · {(c.items || []).length} él.
                  </p>
                </button>
                <button onClick={() => del(c.id)} data-testid={`canvas-delete-${c.id}`}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-red-400/70 hover:text-red-400 transition-opacity">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
