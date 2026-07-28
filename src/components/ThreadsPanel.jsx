import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where, doc, updateDoc } from "firebase/firestore";
import { MessageSquare } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { ChatMessages } from "./ChatMessages";
import { createNotification } from "../lib/notify";
import { useProgressiveList } from "./Pagination";
import { SkeletonList } from "./Skeletons";
import { ActionButton } from "./ui/action-button";

const STATUS_CLS = {
  open: "text-[#D8CA82] border-[#D8CA82]/40",
  closed: "text-[#f7f7f7]/40 border-white/20",
  pending: "text-orange-300 border-orange-300/40",
  reviewing: "text-sky-300 border-sky-300/40",
  accepted: "text-emerald-300 border-emerald-300/40",
  rejected: "text-red-400 border-red-400/40",
};

export const ThreadsPanel = ({ collectionName, canSeeAll, emptyKey, titleField, prefix, statusOptions = null, canSetStatus = false }) => {
  const { user } = useAuth();
  const { t } = useLang();
  const [threads, setThreads] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, collectionName);
    const q = canSeeAll ? ref : query(ref, where("uid", "==", user.uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setThreads(list);
      setSelected((s) => s && list.find((x) => x.id === s) ? s : list[0]?.id || null);
    }, (e) => { console.error(e); setThreads([]); });
  }, [user, canSeeAll, collectionName]);

  const list = threads || [];
  const progressive = useProgressiveList(list, 10, collectionName);
  const current = list.find((x) => x.id === selected);

  if (threads === null) {
    return <SkeletonList count={4} testId={`${prefix}-threads-loading`} label={t("common.loading")} />;
  }

  if (list.length === 0) {
    return <p className="text-[#f7f7f7]/40 tracking-wide py-8" data-testid={`${prefix}-threads-empty`}>{t(emptyKey)}</p>;
  }

  return (
    <div className="grid md:grid-cols-12 border border-white/10 bg-[#141414] h-[560px]">
      <div className="md:col-span-4 border-r border-white/10 overflow-y-auto" data-testid={`${prefix}-threads-list`}>
        {progressive.items.map((th) => (
          <button key={th.id} onClick={() => setSelected(th.id)} data-testid={`${prefix}-thread-${th.id}`}
            aria-current={selected === th.id ? "true" : undefined}
            className={`w-full text-left px-4 py-3 min-h-[56px] border-b border-white/5 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#D8CA82] ${selected === th.id ? "bg-[#D8CA82]/10 border-l-2 border-l-[#D8CA82]" : "hover:bg-white/5"}`}>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate flex-1">{th[titleField]}</p>
              {th.status && (
                <span className={`text-[9px] uppercase tracking-widest border px-1.5 py-0.5 shrink-0 ${STATUS_CLS[th.status] || "text-[#f7f7f7]/40 border-white/20"}`} data-testid={`${prefix}-status-${th.id}`}>
                  {t(`status.${th.status}`)}
                </span>
              )}
            </div>
            <p className="text-xs text-[#c8c8c8] truncate">{th.name} · {th.createdAt?.toDate ? th.createdAt.toDate().toLocaleDateString("fr-FR") : ""}</p>
          </button>
        ))}
        <div className="px-3 py-4 flex flex-col items-center gap-2 border-t border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8]" aria-live="polite">
            {progressive.shown} / {progressive.total}
          </p>
          {progressive.hasMore && (
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={progressive.loadMore}
              data-testid={`${prefix}-threads-load-more`}
              className="w-full"
            >
              Charger plus ({progressive.remaining})
            </ActionButton>
          )}
        </div>
      </div>
      <div className="md:col-span-8 flex flex-col min-h-0">
        {current && (
          <>
            <div className="px-4 py-3 border-b border-white/10 bg-[#1A1A1A] shrink-0 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display text-[#D8CA82] uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare size={14} /> {current[titleField]}
                </p>
                {current.meta && <p className="text-xs text-[#f7f7f7]/50 mt-1 whitespace-pre-wrap">{current.meta}</p>}
              </div>
              {canSetStatus && statusOptions && (
                <select value={current.status || statusOptions[0]} data-testid={`${prefix}-status-select`}
                  onChange={async (e) => { try { await updateDoc(doc(db, collectionName, current.id), { status: e.target.value }); } catch (err) { console.error(err); } }}
                  className="bg-[#111111] border border-white/20 px-2 py-1.5 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] shrink-0">
                  {statusOptions.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                </select>
              )}
            </div>
            <ChatMessages path={`${collectionName}/${current.id}/messages`} testId={`${prefix}-chat`}
              onSent={() => {
                if (current.uid !== user.uid) {
                  createNotification({ targetUid: current.uid, type: "thread_reply", extra: current[titleField], link: prefix === "support" ? "/support" : "/recrutement" });
                }
              }} />
          </>
        )}
      </div>
    </div>
  );
};

export const LoginPrompt = ({ messageKey, prefix }) => {
  const { t } = useLang();
  return (
    <div className="border border-[#D8CA82]/30 bg-[#1A1A1A] p-10 text-center" data-testid={`${prefix}-login-prompt`}>
      <p className="text-[#f7f7f7]/70 mb-6">{t(messageKey)}</p>
      <Link to="/connexion" data-testid={`${prefix}-login-link`}
        className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 inline-block hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
        {t("nav.login")}
      </Link>
    </div>
  );
};
