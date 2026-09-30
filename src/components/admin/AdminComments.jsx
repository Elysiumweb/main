import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { MessageSquare, Check, X, Trash2, ExternalLink } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { logAdminAction } from "../../lib/notify";
import { ConfirmAction } from "../ConfirmAction";

/**
 * Modération des réactions aux articles (onglet Admin « Modération »).
 * ----------------------------------------------------------------------------
 * Pré-modération : les réactions soumises via `submitArticleComment` naissent
 * `pending`. Le bureau approuve (visible publiquement), refuse (masqué) ou
 * supprime définitivement. Chaque action est tracée dans le journal d'audit.
 */

const inputCls = "bg-[#111111] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const STATUS_FILTERS = ["all", "pending", "approved", "rejected"];

const STATUS_BADGE = {
  pending: "text-orange-300 border-orange-300/40",
  approved: "text-emerald-300 border-emerald-300/40",
  rejected: "text-red-400 border-red-400/40",
};

export const AdminComments = () => {
  const { user, displayName } = useAuth();
  const { t, lang } = useLang();
  const [comments, setComments] = useState([]);
  const [status, setStatus] = useState("pending");
  const [queryText, setQueryText] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "articleComments"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setComments(list);
    }, console.error);
  }, []);

  const counts = useMemo(() => {
    const c = { all: comments.length, pending: 0, approved: 0, rejected: 0 };
    comments.forEach((x) => { if (c[x.status] !== undefined) c[x.status] += 1; });
    return c;
  }, [comments]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return comments.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (!q) return true;
      return [c.authorName, c.text, c.articleId].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [comments, status, queryText]);

  const moderate = async (comment, next) => {
    try {
      await updateDoc(doc(db, "articleComments", comment.id), {
        status: next,
        moderatedAt: serverTimestamp(),
        moderatedBy: user?.uid || "",
      });
      await logAdminAction({
        action: next === "approved" ? "comment_approved" : "comment_rejected",
        label: `${(comment.text || "").slice(0, 60)}…`,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "articleComments", id: comment.id },
        details: { articleId: comment.articleId },
      });
      toast.success(t("common.saved"));
    } catch (e) {
      console.error(e);
      toast.error(t("common.error"));
    }
  };

  const hardDelete = async (comment) => {
    try {
      await deleteDoc(doc(db, "articleComments", comment.id));
      await logAdminAction({
        action: "comment_deleted",
        label: `${(comment.text || "").slice(0, 60)}…`,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "articleComments", id: comment.id },
        details: { articleId: comment.articleId },
      });
      toast.success(t("common.saved"));
    } catch (e) {
      console.error(e);
      toast.error(t("common.error"));
    }
  };

  const fmtDate = (c) =>
    c.createdAt?.toDate
      ? c.createdAt.toDate().toLocaleString(lang === "en" ? "en-US" : "fr-FR", { dateStyle: "medium", timeStyle: "short" })
      : "—";

  return (
    <div className="space-y-6" data-testid="admin-comments">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <MessageSquare className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{t("admin.comments.title")}</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50">{t("admin.comments.sub")}</p>
        </div>
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder={t("admin.comments.search")}
          className={`${inputCls} w-full lg:w-72`}
          data-testid="admin-comments-search"
        />
      </div>

      <div className="flex flex-wrap gap-2" data-testid="admin-comments-status-filters">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            data-testid={`admin-comments-status-${s}`}
            className={`text-xs uppercase tracking-[0.2em] border px-3 py-1.5 transition-colors ${
              status === s
                ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10"
                : "border-white/15 text-[#f7f7f7]/50 hover:text-[#f7f7f7]"
            }`}
          >
            {s === "all" ? t("media.all") : t(`admin.comments.status.${s}`)}
            <span className="ml-1.5 text-[#f7f7f7]/40">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-[#c8c8c8] border border-white/10 bg-[#1A1A1A] px-4 py-8 text-center" data-testid="admin-comments-empty">
            {t("admin.comments.empty")}
          </p>
        )}
        {filtered.map((c) => (
          <div key={c.id} className="border border-white/10 bg-[#1A1A1A] px-4 py-3" data-testid={`admin-comment-row-${c.id}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs uppercase tracking-widest border px-1.5 py-0.5 ${STATUS_BADGE[c.status] || ""}`}>
                {c.status ? t(`admin.comments.status.${c.status}`) : c.status}
              </span>
              <span className="text-sm font-semibold text-[#f7f7f7]">{c.authorName || t("comments.anonymous")}</span>
              <span className="text-xs text-[#c8c8c8]">{fmtDate(c)}</span>
              {c.articleId && (
                <Link
                  to={`/actus/${c.articleId}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-xs text-[#D8CA82]/70 hover:text-[#D8CA82]"
                  data-testid={`admin-comment-article-${c.id}`}
                >
                  {t("admin.comments.viewArticle")} <ExternalLink size={11} aria-hidden="true" />
                </Link>
              )}
              <div className="ml-auto flex items-center gap-2">
                {c.status !== "approved" && (
                  <button
                    onClick={() => moderate(c, "approved")}
                    title={t("admin.comments.approve")}
                    aria-label={`${t("admin.comments.approve")} ${c.id}`}
                    className="text-emerald-300/80 hover:text-emerald-300"
                    data-testid={`admin-comment-approve-${c.id}`}
                  >
                    <Check size={16} />
                  </button>
                )}
                {c.status !== "rejected" && (
                  <button
                    onClick={() => moderate(c, "rejected")}
                    title={t("admin.comments.reject")}
                    aria-label={`${t("admin.comments.reject")} ${c.id}`}
                    className="text-orange-300/80 hover:text-orange-300"
                    data-testid={`admin-comment-reject-${c.id}`}
                  >
                    <X size={16} />
                  </button>
                )}
                <ConfirmAction
                  title={t("admin.comments.deleteTitle")}
                  description={t("admin.comments.deleteDesc")}
                  confirmLabel={t("common.delete")}
                  onConfirm={() => hardDelete(c)}
                >
                  <button
                    className="text-red-400/70 hover:text-red-400"
                    title={t("common.delete")}
                    aria-label={`${t("common.delete")} ${c.id}`}
                    data-testid={`admin-comment-delete-${c.id}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </ConfirmAction>
              </div>
            </div>
            <p className="text-sm text-[#f7f7f7]/70 mt-2 whitespace-pre-line break-words">{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
