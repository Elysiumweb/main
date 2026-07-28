import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Pencil, Eye, RotateCcw, Send } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { CATEGORIES } from "../../pages/News";
import { ActionButton } from "../ui/action-button";
import { ConfirmDelete } from "../ConfirmDelete";
import { SkeletonList } from "../Skeletons";
import { BrandImage, RATIOS } from "../BrandImage";
import { CharCounter } from "../FormControls";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { title: "", category: "announcement", coverUrl: "", content: "" };

export const AdminArticles = () => {
  const { t } = useLang();
  const { isOfficial } = useAuth();
  const [articles, setArticles] = useState(null);
  const [saving, setSaving] = useState(null); // "draft" | "published" | null
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "articles"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setArticles(list);
    }, (e) => { console.error(e); setArticles([]); });
  }, []);

  const TITLE_MAX = 120;
  const CONTENT_MAX = 8000;
  const titleError = form.title.trim().length === 0
    ? "Le titre est obligatoire."
    : form.title.length > TITLE_MAX ? `${TITLE_MAX} caractères maximum.` : null;
  const coverError = form.coverUrl && !/^https?:\/\/.+/.test(form.coverUrl) ? "Lien de couverture invalide." : null;
  const canSave = !titleError && !coverError;

  const save = async (status) => {
    if (!canSave) { toast.error(titleError || coverError); return; }
    setSaving(status);
    try {
      const data = { ...form, status, ...(status === "published" ? { publishedAt: serverTimestamp() } : {}) };
      if (editId) await updateDoc(doc(db, "articles", editId), data);
      else await addDoc(collection(db, "articles"), { ...data, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
    setSaving(null);
  };

  const setStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "articles", id), { status, ...(status === "published" ? { publishedAt: serverTimestamp() } : {}) });
      toast.success(t("common.saved"));
    } catch { toast.error(t("common.error")); }
  };

  const hardDelete = async (id) => { await deleteDoc(doc(db, "articles", id)); };

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
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <label htmlFor="admin-article-title" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8]">Titre <span className="text-[#D8CA82]">*</span></label>
            <CharCounter value={form.title} max={TITLE_MAX} />
          </div>
          <input id="admin-article-title" value={form.title} onChange={set("title")} placeholder="Titre de l'article" maxLength={TITLE_MAX}
            aria-invalid={form.title.length > 0 && Boolean(titleError) ? true : undefined}
            className={`${inputCls} ${form.title.length > 0 && titleError ? "border-[#ff9b95]" : ""}`} data-testid="admin-article-title" />
          {form.title.length > 0 && titleError && <p role="alert" className="mt-1.5 text-xs text-[#ff9b95]">{titleError}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <select value={form.category} onChange={set("category")} className={inputCls} data-testid="admin-article-category">
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`news.cat.${c}`)}</option>)}
          </select>
          <input value={form.coverUrl} onChange={set("coverUrl")} placeholder="Image de couverture (URL)" aria-label="Image de couverture (URL)"
            aria-invalid={Boolean(coverError) || undefined}
            className={`${inputCls} ${coverError ? "border-[#ff9b95]" : ""}`} data-testid="admin-article-cover" />
        </div>
        {coverError && <p role="alert" className="text-xs text-[#ff9b95]">{coverError}</p>}
        {form.coverUrl && !coverError && (
          <BrandImage src={form.coverUrl} alt="Aperçu de la couverture" ratio={RATIOS.card} className="w-full max-w-xs border border-white/10" />
        )}
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <label htmlFor="admin-article-content" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8]">Contenu</label>
            <CharCounter value={form.content} max={CONTENT_MAX} />
          </div>
          <textarea id="admin-article-content" value={form.content} onChange={set("content")} placeholder="Contenu de l'article..." rows={8}
            maxLength={CONTENT_MAX} className={inputCls} data-testid="admin-article-content" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <ActionButton variant="secondary" size="md" onClick={() => save("draft")} loading={saving === "draft"}
            loadingLabel="Enregistrement…" disabled={!canSave} disabledReason={titleError || coverError || undefined}
            data-testid="admin-article-draft-btn">
            {t("notes.draft")}
          </ActionButton>
          <ActionButton variant="primary" size="md" icon={Send} onClick={() => save("published")} loading={saving === "published"}
            loadingLabel="Publication…" disabled={!canSave} disabledReason={titleError || coverError || undefined}
            data-testid="admin-article-publish-btn">
            Publier
          </ActionButton>
          {editId && (
            <ActionButton variant="ghost" size="md" onClick={() => { setEditId(null); setForm(EMPTY); }} data-testid="admin-article-cancel">
              {t("common.cancel")}
            </ActionButton>
          )}
        </div>
      </div>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-articles-list">
        {articles === null ? (
          <SkeletonList count={5} testId="admin-articles-loading" label={t("common.loading")} />
        ) : articles.length === 0 ? (
          <p className="text-[#c8c8c8]">{t("news.empty")}</p>
        ) : (
          articles.map((a) => (
            <div key={a.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 border border-white/10 bg-[#1A1A1A] px-4 py-3">
              <span className={`text-[9px] uppercase tracking-widest border px-1.5 py-0.5 shrink-0 ${STATUS_BADGE[a.status] || ""}`}>
                {a.status === "published" ? "Publié" : a.status === "deleted" ? "Supprimé" : t("notes.draft")}
              </span>
              <div className="flex-1 min-w-[140px]">
                <p className="text-sm font-semibold text-[#f7f7f7] break-words">{a.title}</p>
                <p className="text-xs text-[#c8c8c8]">{t(`news.cat.${a.category}`)}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end ml-auto">
                <ActionButton as={Link} to={`/actus/${a.id}`} target="_blank" variant="ghost" size="icon"
                  icon={Eye} title="Prévisualiser" data-testid={`admin-article-preview-${a.id}`}>
                  Prévisualiser
                </ActionButton>
                {a.status !== "deleted" ? (
                  <>
                    <ActionButton variant="secondary" size="sm" icon={Pencil} onClick={() => edit(a)} data-testid={`admin-article-edit-${a.id}`}>
                      Modifier
                    </ActionButton>
                    {a.status === "published" ? (
                      <ActionButton variant="ghost" size="sm" onClick={() => setStatus(a.id, "draft")} data-testid={`admin-article-unpublish-${a.id}`}>
                        Dépublier
                      </ActionButton>
                    ) : (
                      <ActionButton variant="ghost" size="sm" onClick={() => setStatus(a.id, "published")} data-testid={`admin-article-publish-inline-${a.id}`}>
                        Publier
                      </ActionButton>
                    )}
                    <ConfirmDelete
                      testId={`admin-article-delete-${a.id}`}
                      itemLabel={`l'article « ${a.title} »`}
                      title="Mettre l'article à la corbeille"
                      description={<>L'article <span className="text-[#f7f7f7] font-semibold">« {a.title} »</span> sera masqué du site public. Vous pourrez le restaurer depuis cette liste.</>}
                      confirmLabel="Mettre à la corbeille"
                      successMessage="Article mis à la corbeille"
                      onConfirm={() => setStatus(a.id, "deleted")}
                      errorMessage={t("common.error")}
                    />
                  </>
                ) : (
                  <>
                    <ActionButton variant="secondary" size="sm" icon={RotateCcw} onClick={() => setStatus(a.id, "draft")} data-testid={`admin-article-restore-${a.id}`}>
                      Restaurer
                    </ActionButton>
                    {isOfficial && (
                      <ConfirmDelete
                        variant="button"
                        testId={`admin-article-harddelete-${a.id}`}
                        itemLabel={`définitivement l'article « ${a.title} »`}
                        triggerLabel="Suppression définitive"
                        confirmLabel="Supprimer définitivement"
                        onConfirm={() => hardDelete(a.id)}
                        errorMessage={t("common.error")}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
