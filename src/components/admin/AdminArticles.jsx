import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil, Eye, RotateCcw, Send } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { CATEGORIES } from "../../pages/News";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { title: "", category: "announcement", coverUrl: "", content: "" };

export const AdminArticles = () => {
  const { t } = useLang();
  const { isOfficial } = useAuth();
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "articles"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setArticles(list);
    }, console.error);
  }, []);

  const save = async (status) => {
    if (!form.title.trim()) { toast.error(t("common.error")); return; }
    try {
      const data = { ...form, status, ...(status === "published" ? { publishedAt: serverTimestamp() } : {}) };
      if (editId) await updateDoc(doc(db, "articles", editId), data);
      else await addDoc(collection(db, "articles"), { ...data, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const setStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "articles", id), { status, ...(status === "published" ? { publishedAt: serverTimestamp() } : {}) });
      toast.success(t("common.saved"));
    } catch { toast.error(t("common.error")); }
  };

  const hardDelete = async (id) => {
    try { await deleteDoc(doc(db, "articles", id)); toast.success(t("common.saved")); }
    catch { toast.error(t("common.error")); }
  };

  const edit = (a) => { setEditId(a.id); setForm({ title: a.title || "", category: a.category || "announcement", coverUrl: a.coverUrl || "", content: a.content || "" }); };

  const STATUS_BADGE = {
    draft: "text-orange-300 border-orange-300/40",
    published: "text-emerald-300 border-emerald-300/40",
    deleted: "text-red-400 border-red-400/40",
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <div className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-articles-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{editId ? "Modifier" : "Nouvel"} article</p>
        <input value={form.title} onChange={set("title")} placeholder="Titre" className={inputCls} data-testid="admin-article-title" />
        <div className="grid grid-cols-2 gap-4">
          <select value={form.category} onChange={set("category")} className={inputCls} data-testid="admin-article-category">
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`news.cat.${c}`)}</option>)}
          </select>
          <input value={form.coverUrl} onChange={set("coverUrl")} placeholder="Image de couverture (URL)" className={inputCls} data-testid="admin-article-cover" />
        </div>
        {form.coverUrl && <img src={form.coverUrl} alt="" className="h-24 object-cover border border-white/10" onError={(e) => { e.target.style.display = "none"; }} />}
        <textarea value={form.content} onChange={set("content")} placeholder="Contenu de l'article..." rows={8} className={inputCls} data-testid="admin-article-content" />
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => save("draft")} data-testid="admin-article-draft-btn"
            className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-5 py-3 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">
            {t("notes.draft")}
          </button>
          <button onClick={() => save("published")} data-testid="admin-article-publish-btn"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-6 py-3 flex items-center gap-2 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
            <Send size={13} /> Publier
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm(EMPTY); }} data-testid="admin-article-cancel"
              className="text-[#f7f7f7]/50 text-xs uppercase tracking-widest px-3">{t("common.cancel")}</button>
          )}
        </div>
      </div>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-articles-list">
        {articles.length === 0 && <p className="text-[#f7f7f7]/40">{t("news.empty")}</p>}
        {articles.map((a) => (
          <div key={a.id} className="flex items-center gap-3 border border-white/10 bg-[#1A1A1A] px-4 py-3">
            <span className={`text-[9px] uppercase tracking-widest border px-1.5 py-0.5 shrink-0 ${STATUS_BADGE[a.status] || ""}`}>
              {a.status === "published" ? "Publié" : a.status === "deleted" ? "Supprimé" : t("notes.draft")}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate">{a.title}</p>
              <p className="text-xs text-[#f7f7f7]/40">{t(`news.cat.${a.category}`)}</p>
            </div>
            <Link to={`/actus/${a.id}`} target="_blank" title="Prévisualiser" className="text-[#f7f7f7]/50 hover:text-[#D8CA82]" data-testid={`admin-article-preview-${a.id}`}>
              <Eye size={15} />
            </Link>
            {a.status !== "deleted" ? (
              <>
                <button onClick={() => edit(a)} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-article-edit-${a.id}`}><Pencil size={15} /></button>
                {a.status === "published" ? (
                  <button onClick={() => setStatus(a.id, "draft")} title="Dépublier" className="text-orange-300/70 hover:text-orange-300 text-[10px] uppercase tracking-wider" data-testid={`admin-article-unpublish-${a.id}`}>Dépublier</button>
                ) : (
                  <button onClick={() => setStatus(a.id, "published")} title="Publier" className="text-emerald-300/70 hover:text-emerald-300 text-[10px] uppercase tracking-wider" data-testid={`admin-article-publish-inline-${a.id}`}>Publier</button>
                )}
                <button onClick={() => setStatus(a.id, "deleted")} className="text-red-400/70 hover:text-red-400" title="Supprimer (restaurable)" data-testid={`admin-article-delete-${a.id}`}><Trash2 size={15} /></button>
              </>
            ) : (
              <>
                <button onClick={() => setStatus(a.id, "draft")} className="text-emerald-300/70 hover:text-emerald-300" title="Restaurer" data-testid={`admin-article-restore-${a.id}`}><RotateCcw size={15} /></button>
                {isOfficial && (
                  <button onClick={() => hardDelete(a.id)} className="text-red-400 hover:text-red-300 text-[10px] uppercase tracking-wider" title="Suppression définitive" data-testid={`admin-article-harddelete-${a.id}`}>Définitif</button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
