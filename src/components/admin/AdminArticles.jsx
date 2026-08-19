import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil, Eye, RotateCcw, Send, Star } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { CATEGORIES } from "../../pages/News";
import { Markdown } from "../../lib/markdown";
import { logAdminAction } from "../../lib/notify";
import { ImageUpload } from "../ImageUpload";
import { ConfirmAction } from "../ConfirmAction";
import { GAMES, ROSTERS } from "../../lib/constants";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { title: "", category: "announcement", coverUrl: "", excerpt: "", content: "", featured: false, game: "EVA", roster: "", competition: "" };

export const AdminArticles = () => {
  const { t } = useLang();
  const { user, displayName, isOfficial } = useAuth();
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [editorTab, setEditorTab] = useState("write"); // write | preview
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
      const data = { ...form, status, updatedAt: serverTimestamp(), ...(status === "published" ? { publishedAt: serverTimestamp() } : {}) };
      if (editId) await updateDoc(doc(db, "articles", editId), data);
      else await addDoc(collection(db, "articles"), { ...data, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const setStatus = async (id, status) => {
    try {
      const article = articles.find((a) => a.id === id);
      await updateDoc(doc(db, "articles", id), { status, updatedAt: serverTimestamp(), ...(status === "published" ? { publishedAt: serverTimestamp() } : {}) });
      if (status === "deleted") {
        await logAdminAction({
          action: "article_deleted",
          label: article?.title || id,
          actor: { uid: user?.uid, name: displayName, email: user?.email },
          target: { collection: "articles", id },
        });
      }
      toast.success(t("common.saved"));
    } catch { toast.error(t("common.error")); }
  };

  const toggleFeatured = async (a) => {
    try {
      const others = articles.filter((x) => x.featured && x.id !== a.id);
      await Promise.all(others.map((x) => updateDoc(doc(db, "articles", x.id), { featured: false })));
      await updateDoc(doc(db, "articles", a.id), { featured: !a.featured });
      toast.success(t("common.saved"));
    } catch { toast.error(t("common.error")); }
  };

  const hardDelete = async (article) => {
    try {
      await deleteDoc(doc(db, "articles", article.id));
      await logAdminAction({
        action: "article_hard_deleted",
        label: article?.title || article.id,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "articles", id: article.id },
      });
      toast.success(t("common.saved"));
    }
    catch { toast.error(t("common.error")); }
  };

  const edit = (a) => {
    setEditId(a.id);
    setEditorTab("write");
    setForm({ title: a.title || "", category: a.category || "announcement", coverUrl: a.coverUrl || "", excerpt: a.excerpt || "", content: a.content || "", featured: !!a.featured, game: a.game || "EVA", roster: a.roster || "", competition: a.competition || "" });
  };

  const STATUS_BADGE = {
    draft: "text-orange-300 border-orange-300/40",
    published: "text-emerald-300 border-emerald-300/40",
    deleted: "text-red-400 border-red-400/40",
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <div className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-articles-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">
          {editId ? t("admin.article.edit") : t("admin.article.new")}
        </p>
        <input value={form.title} onChange={set("title")} placeholder={t("admin.article.title")} className={inputCls} data-testid="admin-article-title" />
        <div className="grid grid-cols-2 gap-4">
          <select value={form.category} onChange={set("category")} className={inputCls} data-testid="admin-article-category">
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`news.cat.${c}`)}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-[#f7f7f7]/70 cursor-pointer border border-white/15 px-3 py-2.5 bg-[#111111]" title={t("admin.article.featuredHint")}>
            <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
              className="accent-[#D8CA82] h-4 w-4" data-testid="admin-article-featured" />
            <Star size={12} className={form.featured ? "text-[#D8CA82] fill-[#D8CA82]" : "text-[#f7f7f7]/40"} aria-hidden="true" />
            {t("admin.article.featured")}
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <select value={form.game} onChange={(e) => setForm((current) => ({ ...current, game: e.target.value, roster: "" }))} className={inputCls} aria-label="Jeu associé">{GAMES.map((game) => <option key={game}>{game}</option>)}</select>
          <select value={form.roster} onChange={set("roster")} className={inputCls} aria-label="Roster associé"><option value="">Tous les rosters</option>{(ROSTERS[form.game] || []).map((roster) => <option key={roster}>{roster}</option>)}</select>
          <input value={form.competition} onChange={set("competition")} placeholder="Compétition" className={inputCls} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.article.cover")}</label>
          <ImageUpload value={form.coverUrl} onChange={(url) => setForm((f) => ({ ...f, coverUrl: url }))} folder="articles" maxWidth={1600} testId="admin-article-cover-upload" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.article.excerpt")}</label>
          <textarea
            value={form.excerpt}
            onChange={set("excerpt")}
            placeholder={t("admin.article.excerptPlaceholder")}
            rows={3}
            maxLength={220}
            className={inputCls}
            data-testid="admin-article-excerpt"
          />
          <p className="text-[10px] text-[#f7f7f7]/35 mt-1">{form.excerpt.length}/220</p>
        </div>

        {/* Onglets éditeur / aperçu markdown */}
        <div className="flex items-center gap-1 border-b border-white/10 pb-2" role="tablist" aria-label={t("admin.article.title")}>
          <button onClick={() => setEditorTab("write")} data-testid="admin-article-tab-write" role="tab" aria-selected={editorTab === "write"}
            className={`text-[10px] uppercase tracking-widest px-3 py-1.5 ${editorTab === "write" ? "text-[#D8CA82] border-b-2 border-[#D8CA82]" : "text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
            {t("admin.article.write")}
          </button>
          <button onClick={() => setEditorTab("preview")} data-testid="admin-article-tab-preview" role="tab" aria-selected={editorTab === "preview"}
            className={`text-[10px] uppercase tracking-widest px-3 py-1.5 ${editorTab === "preview" ? "text-[#D8CA82] border-b-2 border-[#D8CA82]" : "text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
            {t("admin.article.preview")}
          </button>
          <span className="ml-auto text-[10px] text-[#f7f7f7]/30">{t("admin.article.markdownHint")}</span>
        </div>
        {editorTab === "write" ? (
          <textarea value={form.content} onChange={set("content")} placeholder={t("admin.article.contentPlaceholder")} rows={12} className={inputCls} data-testid="admin-article-content" />
        ) : (
          <div className="border border-white/10 bg-[#141414] p-4 max-h-96 overflow-y-auto" data-testid="admin-article-preview">
            <Markdown source={form.content || `*${t("admin.article.previewEmpty")}*`} className="text-sm" />
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button onClick={() => save("draft")} data-testid="admin-article-draft-btn"
            className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-5 py-3 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">
            {t("notes.draft")}
          </button>
          <button onClick={() => save("published")} data-testid="admin-article-publish-btn"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-6 py-3 flex items-center gap-2 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
            <Send size={13} /> {t("admin.publish")}
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
              {a.status === "published" ? t("admin.published") : a.status === "deleted" ? t("admin.deleted") : t("notes.draft")}
            </span>
            <button
              onClick={() => toggleFeatured(a)}
              disabled={a.status !== "published"}
              title={t("admin.article.featuredHint")}
              aria-label={t("admin.article.featured")}
              aria-pressed={!!a.featured}
              data-testid={`admin-article-featured-${a.id}`}
              className={`shrink-0 transition-colors ${a.featured ? "text-[#D8CA82]" : "text-[#f7f7f7]/30 hover:text-[#f7f7f7]/60"} disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              <Star size={15} className={a.featured ? "fill-[#D8CA82]" : ""} aria-hidden="true" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate">{a.title}</p>
              <p className="text-xs text-[#f7f7f7]/40">{t(`news.cat.${a.category}`)}</p>
            </div>
            <Link to={`/actus/${a.id}`} target="_blank" title={t("admin.article.previewLink")} aria-label={t("admin.article.previewLink")} className="text-[#f7f7f7]/50 hover:text-[#D8CA82]" data-testid={`admin-article-preview-${a.id}`}>
              <Eye size={15} />
            </Link>
            {a.status !== "deleted" ? (
              <>
                <button onClick={() => edit(a)} title={t("admin.edit")} aria-label={`${t("admin.edit")} ${a.title}`} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-article-edit-${a.id}`}><Pencil size={15} /></button>
                {a.status === "published" ? (
                  <button onClick={() => setStatus(a.id, "draft")} title={t("admin.unpublish")} aria-label={`${t("admin.unpublish")} ${a.title}`} className="text-orange-300/70 hover:text-orange-300 text-[10px] uppercase tracking-wider" data-testid={`admin-article-unpublish-${a.id}`}>{t("admin.unpublish")}</button>
                ) : (
                  <button onClick={() => setStatus(a.id, "published")} title={t("admin.publish")} aria-label={`${t("admin.publish")} ${a.title}`} className="text-emerald-300/70 hover:text-emerald-300 text-[10px] uppercase tracking-wider" data-testid={`admin-article-publish-inline-${a.id}`}>{t("admin.publish")}</button>
                )}
                <ConfirmAction
                  title={t("admin.article.deleteConfirm")}
                  description={t("admin.article.deleteDesc")}
                  confirmLabel={t("common.delete")}
                  onConfirm={() => setStatus(a.id, "deleted")}
                >
                  <button className="text-red-400/70 hover:text-red-400" title={t("common.delete")} aria-label={`${t("common.delete")} ${a.title}`} data-testid={`admin-article-delete-${a.id}`}><Trash2 size={15} /></button>
                </ConfirmAction>
              </>
            ) : (
              <>
                <button onClick={() => setStatus(a.id, "draft")} className="text-emerald-300/70 hover:text-emerald-300" title={t("admin.restore")} aria-label={`${t("admin.restore")} ${a.title}`} data-testid={`admin-article-restore-${a.id}`}><RotateCcw size={15} /></button>
                {isOfficial && (
                  <ConfirmAction
                    title={t("admin.article.hardDeleteTitle")}
                    description={t("admin.article.hardDeleteDesc")}
                    confirmLabel={t("admin.hardDeleteConfirm")}
                    onConfirm={() => hardDelete(a)}
                  >
                    <button className="text-red-400 hover:text-red-300 text-[10px] uppercase tracking-wider" title={t("admin.hardDelete")} aria-label={`${t("admin.hardDelete")} ${a.title}`} data-testid={`admin-article-harddelete-${a.id}`}>{t("admin.hardDelete")}</button>
                  </ConfirmAction>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
