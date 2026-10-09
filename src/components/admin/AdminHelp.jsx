import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Download, Pencil, Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { HELP_ARTICLES, HELP_CATEGORIES, HELP_GAMES, normalizeHelpArticle } from "../../lib/helpDefaults";
import { ConfirmAction } from "../ConfirmAction";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { question: "", answer: "", questionEn: "", answerEn: "", category: "account", game: "all", published: true, order: 100 };

/**
 * Centre d'aide — édition des articles publiés sur /support.
 * ----------------------------------------------------------------------------
 * Les 15 questions de la FAQ étaient codées en dur dans `i18n.js` : corriger une
 * réponse imposait un redéploiement de tout le site. Elles vivent désormais dans
 * `helpArticles` ; ce panneau les crée, les classe (rubrique, jeu, ordre) et gère
 * les brouillons. Le bouton d'import reprend le contenu historique en un clic
 * pour migrer un site existant sans ressaisie.
 */
export const AdminHelp = () => {
  const { t } = useLang();
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(
      collection(db, "helpArticles"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.question || "").localeCompare(String(b.question || "")));
        setArticles(list);
      },
      (err) => { console.error(err); toast.error(t("admin.help.upsertFail")); }
    );
  }, [t]);

  const submit = async (e) => {
    e.preventDefault();
    const data = normalizeHelpArticle({ ...form, order: Number(form.order) || 0, published: form.published === "true" || form.published === true });
    if (!data.question || !data.answer) { toast.error(t("admin.help.question")); return; }
    try {
      if (editId) await updateDoc(doc(db, "helpArticles", editId), { ...data, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, "helpArticles"), { ...data, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("admin.help.upsertFail"));
    }
  };

  const edit = (a) => {
    setEditId(a.id);
    setForm({
      question: a.question || "",
      answer: a.answer || "",
      questionEn: a.questionEn || "",
      answerEn: a.answerEn || "",
      category: a.category || "account",
      game: a.game || "all",
      published: String(a.published !== false),
      order: String(a.order ?? 100),
    });
  };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "helpArticles", id)); } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      // Un article par défaut = un document : l'import est idempotent si l'on
      // filtre sur ceux qui existent déjà (relecture d'une question inchangée).
      const existing = new Set(articles.map((a) => a.question));
      const batch = HELP_ARTICLES
        .map((a, i) => ({ ...normalizeHelpArticle(a), order: (i + 1) * 10, published: true }))
        .filter((a) => !existing.has(a.question));
      if (batch.length === 0) { toast.success(t("admin.help.seeded")); return; }
      await Promise.all(batch.map((a) => addDoc(collection(db, "helpArticles"), { ...a, createdAt: serverTimestamp() })));
      toast.success(`${batch.length} ${t("admin.help.seeded")}`);
    } catch (err) {
      console.error(err);
      toast.error(t("admin.help.upsertFail"));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <div className="lg:col-span-5 space-y-4">
        <form onSubmit={submit} className="space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-help-form">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">
            {editId ? t("admin.help.edit") : t("admin.help.add")}
          </p>
          <div>
            <label htmlFor="admin-help-question" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.help.question")}</label>
            <input id="admin-help-question" value={form.question} onChange={set("question")} required className={inputCls} data-testid="admin-help-question" />
          </div>
          <div>
            <label htmlFor="admin-help-answer" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.help.answer")}</label>
            <textarea id="admin-help-answer" value={form.answer} onChange={set("answer")} required rows={4} className={inputCls} data-testid="admin-help-answer" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="admin-help-question-en" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8]/60 block mb-2">{t("admin.help.questionEn")}</label>
              <input id="admin-help-question-en" value={form.questionEn} onChange={set("questionEn")} className={inputCls} data-testid="admin-help-question-en" />
            </div>
            <div>
              <label htmlFor="admin-help-answer-en" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8]/60 block mb-2">{t("admin.help.answerEn")}</label>
              <textarea id="admin-help-answer-en" value={form.answerEn} onChange={set("answerEn")} rows={2} className={inputCls} data-testid="admin-help-answer-en" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="admin-help-category" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.help.category")}</label>
              <select id="admin-help-category" value={form.category} onChange={set("category")} className={inputCls} data-testid="admin-help-category">
                {HELP_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.labelKey)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="admin-help-game" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.help.game")}</label>
              <select id="admin-help-game" value={form.game} onChange={set("game")} className={inputCls} data-testid="admin-help-game">
                {HELP_GAMES.map((g) => <option key={g} value={g}>{g === "all" ? t("support.help.allGames") : g}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="admin-help-order" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.help.order")}</label>
              <input id="admin-help-order" type="number" min="0" max="999" value={form.order} onChange={set("order")} className={inputCls} data-testid="admin-help-order" />
            </div>
            <div>
              <label htmlFor="admin-help-published" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.help.published")}</label>
              <select id="admin-help-published" value={form.published} onChange={set("published")} className={inputCls} data-testid="admin-help-published">
                <option value="true">{t("admin.help.published")}</option>
                <option value="false">{t("admin.help.draft")}</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button type="submit" data-testid="admin-help-submit"
              className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
              {t("notes.save")}
            </button>
            {editId && (
              <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }} data-testid="admin-help-cancel"
                className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-5">{t("common.cancel")}</button>
            )}
          </div>
        </form>

        <button type="button" onClick={seed} disabled={seeding} data-testid="admin-help-seed"
          className="w-full border border-[#D8CA82]/40 text-[#D8CA82] text-xs font-display uppercase tracking-widest px-5 py-3 flex items-center justify-center gap-2 hover:bg-[#D8CA82]/10 disabled:opacity-50">
          <Download size={14} aria-hidden="true" /> {seeding ? "…" : t("admin.help.seed")}
        </button>
        <p className="text-xs text-[#c8c8c8]/60 -mt-6">{t("admin.help.seedDesc")}</p>
      </div>

      <div className="lg:col-span-7 space-y-2" data-testid="admin-help-list">
        {articles.length === 0 && <p className="text-[#c8c8c8]">{t("admin.help.empty")}</p>}
        {articles.map((a) => (
          <div key={a.id} className="border border-white/10 bg-[#1A1A1A] px-4 py-3 flex items-start gap-4">
            <span className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 shrink-0 mt-0.5 ${a.published !== false ? "text-emerald-300 border-emerald-300/40" : "text-[#c8c8c8] border-white/20"}`}>
              {a.published !== false ? t("admin.help.published") : t("admin.help.draft")}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7]">{a.question}</p>
              <p className="text-xs text-[#c8c8c8] line-clamp-2">{a.answer}</p>
              <p className="text-[11px] text-[#c8c8c8]/60 mt-1">
                {t(`support.faq.${a.category || "account"}`)} · {a.game === "all" ? t("support.help.allGames") : a.game} · #{a.order ?? 999}
              </p>
            </div>
            <button onClick={() => edit(a)} title={t("admin.edit")} aria-label={`${t("admin.edit")} ${a.question}`} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-help-edit-${a.id}`}><Pencil size={15} /></button>
            <ConfirmAction
              title={t("admin.help.deleteTitle")}
              description={t("admin.help.deleteDesc")}
              confirmLabel={t("common.delete")}
              onConfirm={() => del(a.id)}
            >
              <button className="text-red-400/70 hover:text-red-400" title={t("common.delete")} aria-label={`${t("common.delete")} ${a.question}`} data-testid={`admin-help-delete-${a.id}`}><Trash2 size={15} /></button>
            </ConfirmAction>
          </div>
        ))}
      </div>
    </div>
  );
};