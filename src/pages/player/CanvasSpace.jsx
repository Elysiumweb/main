import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
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
    // Le filtrage pôle est imposé côté règles : on ne souscrit qu'aux
    // tableaux du pôle du membre (l'officiel voit tout).
    const q = isOfficial
      ? collection(db, "canvases")
      : query(collection(db, "canvases"), where("game", "==", gameKey));
    return onSnapshot(q, (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setCanvases((prev) => {
        const snapIds = new Set(list.map((c) => c.id));
        const localOnly = prev.filter((c) => !snapIds.has(c.id) && c.id.startsWith("canvas_local_"));
        return [...list, ...localOnly];
      });
    }, (err) => {
      console.warn("Firestore canvases onSnapshot error:", err);
    });
  }, [gameKey, isOfficial]);

  const create = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const localId = "canvas_local_" + Date.now();
    const newCanvas = {
      id: localId,
      game: gameKey,
      title: trimmed,
      status: "draft",
      items: [],
      createdBy: user?.uid || "anon",
      createdByName: displayName || "Joueur",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const ref = await addDoc(collection(db, "canvases"), {
        game: gameKey,
        title: trimmed,
        status: "draft",
        items: [],
        createdBy: user?.uid || "anon",
        createdByName: displayName || "Joueur",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      newCanvas.id = ref.id;
      logActivity({ game: gameKey, type: "canvas_created", label: trimmed, byUid: user?.uid || "anon", byName: displayName || "Joueur" });
    } catch (err) {
      console.warn("Firestore canvas creation error:", err);
    }

    setCanvases((prev) => [newCanvas, ...prev.filter((c) => c.id !== newCanvas.id)]);
    setName("");
    setOpenId(newCanvas.id);
  };

  const save = async (items, status) => {
    if (!openId) return;
    setSaving(true);
    try {
      if (!openId.startsWith("canvas_local_")) {
        await updateDoc(doc(db, "canvases", openId), { items, status, updatedAt: serverTimestamp() });
      }
    } catch (e) {
      console.warn("Firestore update canvas warning:", e);
    }
    setCanvases((prev) =>
      prev.map((c) => (c.id === openId ? { ...c, items, status, updatedAt: new Date() } : c))
    );
    toast.success(status === "draft" ? t("canvas.draft") : t("common.saved"));
    setSaving(false);
  };

  const del = async (id) => {
    try {
      const c = canvases.find((x) => x.id === id);
      if (!id.startsWith("canvas_local_")) {
        await deleteDoc(doc(db, "canvases", id));
      }
      if (c) logActivity({ game: gameKey, type: "canvas_deleted", label: c.title, byUid: user?.uid || "anon", byName: displayName || "Joueur" });
    } catch (e) {
      console.warn("Firestore delete canvas warning:", e);
    }
    setCanvases((prev) => prev.filter((x) => x.id !== id));
    if (openId === id) setOpenId(null);
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
                  aria-label={`Supprimer le tableau ${c.title}`}
                  className={`absolute top-3 right-3 transition-opacity ${isOfficial || c.createdBy === user?.uid ? "opacity-0 group-hover:opacity-100 text-red-400/70 hover:text-red-400" : "hidden"}`}>
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
