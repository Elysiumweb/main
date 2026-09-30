import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { MessageSquare, ShieldCheck, Clock3, XCircle } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { useAuth } from "../context/AuthContext";
import { getHoneypotProps, isHoneypotFilled, checkSessionRateLimit, rateLimitMessage } from "../lib/antiSpam";
import { callProtected, protectedErrorMessage } from "../lib/secureForms";

/**
 * Réactions / commentaires modérés sur un article.
 * ----------------------------------------------------------------------------
 * - Soumission exclusive via la Cloud Function `submitArticleComment`
 *   (validation serveur, quota IP/compte, CAPTCHA adaptatif) : la collection
 *   `articleComments` est en écriture directe interdite (firestore.rules).
 * - Pré-modération : un commentaire naît `pending` et n'est visible
 *   publiquement qu'une fois `approved` par le bureau.
 * - Chacun voit toujours ses propres commentaires (avec leur statut), le
 *   bureau dispose d'actions de modération rapides en contexte.
 */

const MAX_LENGTH = 1000;

const STATUS_BADGE = {
  pending: { key: "comments.pendingBadge", cls: "text-orange-300 border-orange-300/40", Icon: Clock3 },
  rejected: { key: "comments.rejectedBadge", cls: "text-red-400 border-red-400/40", Icon: XCircle },
};

export const ArticleComments = ({ articleId, canModerate = false }) => {
  const { t, lang } = useLang();
  const { user, displayName, loading } = useAuth();
  const [approved, setApproved] = useState(null);
  const [mine, setMine] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: "success"|"error", message }

  useEffect(() => {
    setApproved(null); setMine(null);
    const unsubs = [
      onSnapshot(
        query(
          collection(db, "articleComments"),
          where("articleId", "==", articleId),
          where("status", "==", "approved")
        ),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
          setApproved(list);
        },
        (e) => { console.error(e); setApproved([]); }
      ),
    ];
    // Ses propres commentaires (y compris en attente de modération) :
    // lecture autorisée par les règles Firestore via resource.data.uid.
    if (user) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, "articleComments"),
            where("articleId", "==", articleId),
            where("uid", "==", user.uid)
          ),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
            setMine(list);
          },
          (e) => { console.error(e); setMine([]); }
        )
      );
    } else {
      setMine([]);
    }
    return () => unsubs.forEach((u) => u && u());
  }, [articleId, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vue fusionnée : commentaires approuvés + les siens (dédupliés), chronologiques.
  const comments = useMemo(() => {
    const map = new Map();
    (approved || []).forEach((c) => map.set(c.id, c));
    (mine || []).forEach((c) => map.set(c.id, c));
    return [...map.values()].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  }, [approved, mine]);

  const setStatus = async (comment, status) => {
    try {
      await updateDoc(doc(db, "articleComments", comment.id), { status, moderatedAt: serverTimestamp() });
    } catch (e) {
      console.error(e);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (isHoneypotFilled(fd.get("website"))) return;
    const value = text.trim();
    if (value.length < 2) return;
    const limit = checkSessionRateLimit("article_comment", { max: 5, windowMs: 10 * 60 * 1000 });
    if (!limit.allowed) {
      setFeedback({ type: "error", message: rateLimitMessage(limit.retryAt, lang) });
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      await callProtected("submitArticleComment", {
        articleId,
        text: value,
        authorName: displayName || "",
      });
      setText("");
      setFeedback({ type: "success", message: t("comments.pendingNotice") });
    } catch (err) {
      console.error(err);
      setFeedback({ type: "error", message: protectedErrorMessage(err, t("comments.error")) });
    }
    setSending(false);
  };

  const dateLabel = (c) =>
    c.createdAt?.toDate
      ? c.createdAt.toDate().toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })
      : "";

  return (
    <section data-testid="article-comments" aria-label={t("comments.title")}>
      <div className="flex items-center gap-3 mb-2">
        <MessageSquare size={16} className="text-[#D8CA82]" aria-hidden="true" />
        <h2 className="font-display font-bold text-lg text-[#f7f7f7] uppercase tracking-widest" data-testid="article-comments-title">
          {t("comments.title")}
        </h2>
        <span className="text-xs text-[#c8c8c8] ml-auto" data-testid="article-comments-count">
          {comments.length}
        </span>
      </div>
      <p className="text-xs text-[#f7f7f7]/40 flex items-center gap-1.5 mb-6">
        <ShieldCheck size={12} aria-hidden="true" /> {t("comments.moderationNote")}
      </p>

      {/* Formulaire (connecté) ou invitation à se connecter */}
      {!loading && user ? (
        <form onSubmit={submit} className="mb-10 space-y-3" data-testid="article-comments-form" noValidate>
          <input type="text" {...getHoneypotProps("website")} data-testid="article-comments-honeypot" />
          <label htmlFor={`comment-${articleId}`} className="sr-only">
            {t("comments.placeholder")}
          </label>
          <textarea
            id={`comment-${articleId}`}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
            placeholder={t("comments.placeholder")}
            rows={3}
            maxLength={MAX_LENGTH}
            data-testid="article-comments-input"
            className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] placeholder:text-[#a0a0a0] focus:outline-none focus:border-[#D8CA82] resize-y"
          />
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[#f7f7f7]/35">{text.length}/{MAX_LENGTH}</span>
            <button
              type="submit"
              disabled={sending || text.trim().length < 2}
              data-testid="article-comments-submit"
              className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-2.5 disabled:opacity-40 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow"
            >
              {sending ? t("comments.sending") : t("comments.submit")}
            </button>
          </div>
          {feedback && (
            <p
              role="status"
              aria-live="polite"
              className={`text-xs px-3 py-2 border ${feedback.type === "success" ? "text-emerald-300 border-emerald-300/30 bg-emerald-300/5" : "text-red-300 border-red-400/30 bg-red-400/5"}`}
              data-testid="article-comments-feedback"
            >
              {feedback.message}
            </p>
          )}
        </form>
      ) : !loading ? (
        <p className="text-sm text-[#f7f7f7]/50 mb-10" data-testid="article-comments-login-hint">
          <Link to="/connexion" className="text-[#D8CA82] hover:underline">{t("login.title")}</Link>
          {" — "}{t("comments.loginHint")}
        </p>
      ) : null}

      {/* Liste des réactions */}
      {comments.length === 0 ? (
        <p className="text-sm text-[#f7f7f7]/40" data-testid="article-comments-empty">{t("comments.empty")}</p>
      ) : (
        <ul className="space-y-4" data-testid="article-comments-list">
          {comments.map((c) => {
            const isMine = user?.uid && c.uid === user.uid;
            const badge = STATUS_BADGE[c.status];
            return (
              <li
                key={c.id}
                className={`border px-4 py-3 ${c.status === "approved" ? "border-white/10 bg-[#1A1A1A]" : "border-orange-300/30 bg-orange-300/5"}`}
                data-testid={`article-comment-${c.id}`}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-semibold text-[#f7f7f7]">
                    {c.authorName || t("comments.anonymous")}
                    {isMine && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-[#f7f7f7]/40">({t("comments.you")})</span>}
                  </span>
                  <span className="text-xs text-[#c8c8c8]">{dateLabel(c)}</span>
                  {badge && (
                    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${badge.cls}`}>
                      <badge.Icon size={10} aria-hidden="true" /> {t(badge.key)}
                    </span>
                  )}
                  {canModerate && c.status !== "approved" && (
                    <button
                      type="button"
                      onClick={() => setStatus(c, "approved")}
                      className="ml-auto text-[10px] uppercase tracking-widest text-emerald-300/80 hover:text-emerald-300 border border-emerald-300/30 px-2 py-0.5"
                      data-testid={`article-comment-approve-${c.id}`}
                    >
                      {t("admin.comments.approve")}
                    </button>
                  )}
                  {canModerate && c.status !== "rejected" && (
                    <button
                      type="button"
                      onClick={() => setStatus(c, "rejected")}
                      className={`text-[10px] uppercase tracking-widest text-red-300/80 hover:text-red-300 border border-red-400/30 px-2 py-0.5 ${canModerate && c.status !== "approved" ? "" : "ml-auto"}`}
                      data-testid={`article-comment-reject-${c.id}`}
                    >
                      {t("admin.comments.reject")}
                    </button>
                  )}
                </div>
                <p className="text-sm text-[#f7f7f7]/75 mt-2 whitespace-pre-line break-words">{c.text}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
