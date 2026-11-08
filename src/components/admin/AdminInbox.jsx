import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, deleteDoc, doc, limit, onSnapshot, query, serverTimestamp, updateDoc, addDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  AlertTriangle, CheckSquare, ChevronLeft, Clock, Download, Filter, Inbox, Mail,
  MessageSquare, Plus, RotateCcw, Search, Send, Square, Tag, Trash2, UserCheck, X,
} from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { useAdminT } from "../../lib/adminI18n";
import { GAMES } from "../../lib/constants";
import { ChatMessages } from "../ChatMessages";
import { ConfirmAction } from "../ConfirmAction";
import { csvFileName, downloadCsv, toCsv } from "../../lib/csv";
import {
  EMPTY_FILTERS, SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, filterThreads, formatAge,
  inboxCounts, isThreadClosed, slaHoursFor, slaRemainingHours, slaState, sortThreads,
  statusOptionsFor, toMillis,
} from "../../lib/inbox";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const SLA_CLS = {
  ok: "border-emerald-400/40 text-emerald-300",
  soon: "border-amber-400/40 text-amber-300",
  overdue: "border-red-400/50 text-red-300",
};

const threadKey = (thread) => `${thread.source}:${thread.id}`;
const threadTitle = (thread) =>
  thread.source === "support" ? thread.subject || "—" : thread.pseudo || thread.name || "—";

/** Filtre rapide par source pour le compteur de la barre d'outils. */
const SOURCES = ["all", "support", "recruit"];

const EMPTY_CANNED = { title: "", body: "", scope: "all" };

export const AdminInbox = () => {
  const { user, displayName, canSeeSupport, canSeeRecruit } = useAuth();
  const { t, lang } = useLang();
  const tx = useAdminT();

  const [support, setSupport] = useState([]);
  const [recruit, setRecruit] = useState([]);
  const [staff, setStaff] = useState([]);
  const [canned, setCanned] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [cannedOpen, setCannedOpen] = useState(false);
  const [cannedForm, setCannedForm] = useState(EMPTY_CANNED);
  const [draft, setDraft] = useState({ text: "", key: 0 });
  const listRef = useRef(null);

  const canSeeInbox = canSeeSupport || canSeeRecruit;

  /* Rafraîchit les compteurs SLA chaque minute, sans relire Firestore. */
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!canSeeSupport) { setSupport([]); return undefined; }
    return onSnapshot(collection(db, "supportThreads"), (snap) => {
      setSupport(snap.docs.map((d) => ({ id: d.id, source: "support", ...d.data() })));
    }, (e) => { console.error("inbox support", e); setError(tx("inbox.error")); });
  }, [canSeeSupport, tx]);

  useEffect(() => {
    if (!canSeeRecruit) { setRecruit([]); return undefined; }
    return onSnapshot(collection(db, "recruitThreads"), (snap) => {
      setRecruit(snap.docs.map((d) => ({ id: d.id, source: "recruit", ...d.data() })));
    }, (e) => { console.error("inbox recruit", e); setError(tx("inbox.error")); });
  }, [canSeeRecruit, tx]);

  /* Staff assignable : managers + bureau (lecture autorisée à partir de manager). */
  useEffect(() => {
    if (!canSeeInbox) return undefined;
    return onSnapshot(collection(db, "users"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => ["manager", "bureau"].includes(u.role))
        .map((u) => ({ id: u.id, name: u.displayName || u.email || u.id }));
      // Le compte officiel est bureau même si sa fiche n'a pas encore le rôle.
      if (user && !list.some((s) => s.id === user.uid)) {
        list.push({ id: user.uid, name: displayName || user.email || user.uid });
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      setStaff(list);
    }, () => {
      // Un manager peut toujours s'assigner lui-même même si la liste échoue.
      setStaff(user ? [{ id: user.uid, name: displayName || user.email || user.uid }] : []);
    });
  }, [canSeeInbox, user, displayName]);

  /* Réponses types (collection `cannedResponses`, bureau/manager). */
  useEffect(() => {
    if (!canSeeInbox) return undefined;
    return onSnapshot(query(collection(db, "cannedResponses"), limit(100)), (snap) => {
      setCanned(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setCanned([]));
  }, [canSeeInbox]);

  const threads = useMemo(
    () => sortThreads([...support, ...recruit].filter((th) => {
      if (th.source === "support" && !canSeeSupport) return false;
      if (th.source === "recruit" && !canSeeRecruit) return false;
      return true;
    }), now),
    [support, recruit, canSeeSupport, canSeeRecruit, now],
  );

  const counts = useMemo(() => inboxCounts(threads, now), [threads, now]);

  const filtered = useMemo(() => {
    const scoped = filterThreads(threads, filters, now);
    if (filters.assignee !== "mine" || !user) return scoped;
    return scoped.filter((th) => th.assignedTo === user.uid);
  }, [threads, filters, now, user]);

  /* Conserve une sélection valide quand les filtres changent. */
  useEffect(() => {
    if (!filtered.length) { setSelected(null); return; }
    setSelected((current) => {
      if (current && filtered.some((th) => threadKey(th) === current)) return current;
      return threadKey(filtered[0]);
    });
  }, [filtered]);

  const current = filtered.find((th) => threadKey(th) === selected) || null;

  const staffName = (uid) => {
    if (!uid) return "";
    if (uid === user?.uid) return displayName || uid;
    return staff.find((s) => s.id === uid)?.name || uid;
  };

  const patchThread = async (thread, payload, message) => {
    try {
      await updateDoc(doc(db, thread.source === "support" ? "supportThreads" : "recruitThreads", thread.id), payload);
      if (message) toast.success(message);
    } catch (e) {
      console.error("inbox update", e);
      toast.error(t("common.error"));
    }
  };

  const assign = (thread, uid, silent = false) => {
    const payload = uid
      ? { assignedTo: uid, assignedName: staffName(uid), assignedAt: serverTimestamp() }
      : { assignedTo: null, assignedName: null, assignedAt: null };
    return patchThread(thread, payload, silent ? "" : tx("inbox.assigned"));
  };

  const setStatus = (thread, status, silent = false) =>
    patchThread(thread, { status }, silent ? "" : tx("inbox.statusSaved"));

  const toggleChecked = (key) => setChecked((list) => (
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
  ));

  const allVisibleChecked = filtered.length > 0 && filtered.every((th) => checked.includes(threadKey(th)));

  const toggleAll = () => {
    if (allVisibleChecked) {
      setChecked((list) => list.filter((key) => !filtered.some((th) => threadKey(th) === key)));
    } else {
      setChecked((list) => [...new Set([...list, ...filtered.map(threadKey)])]);
    }
  };

  const bulkApply = async (field, value) => {
    const selectedThreads = threads.filter((th) => checked.includes(threadKey(th)));
    if (!selectedThreads.length) { toast.error(tx("inbox.bulk.none")); return; }
    await Promise.all(selectedThreads.map((th) => {
      if (field === "status") return setStatus(th, value, true);
      return assign(th, value === "__unassigned__" ? null : value, true);
    }));
    toast.success(tx("inbox.bulk.done"));
  };

  const exportRows = (scoped) => {
    if (!scoped.length) { toast.error(tx("inbox.exportEmpty")); return; }
    const mixed = new Set(scoped.map((th) => th.source)).size > 1;
    const columns = mixed
      ? [
        { key: "source", label: tx("inbox.source") },
        { key: "id", label: tx("inbox.col.id") },
        { key: "createdAt", label: tx("inbox.col.createdAt"), value: (r) => formatDate(r.createdAt) },
        { key: "status", label: tx("inbox.col.status"), value: (r) => r.status || "open" },
        { key: "assignedName", label: tx("inbox.col.assignee"), value: (r) => staffName(r.assignedTo) },
        { key: "title", label: tx("inbox.col.subject"), value: (r) => threadTitle(r) },
        { key: "requester", label: tx("inbox.col.requester"), value: (r) => r.name || r.pseudo || "" },
        { key: "email", label: tx("inbox.col.email") },
        { key: "category", label: tx("inbox.col.category") },
        { key: "priority", label: tx("inbox.col.priority") },
        { key: "position", label: tx("inbox.col.position") },
        { key: "game", label: tx("inbox.col.game") },
        { key: "country", label: tx("inbox.col.country") },
      ]
      : scoped[0].source === "support"
        ? [
          { key: "id", label: tx("inbox.col.id") },
          { key: "createdAt", label: tx("inbox.col.createdAt"), value: (r) => formatDate(r.createdAt) },
          { key: "status", label: tx("inbox.col.status"), value: (r) => r.status || "open" },
          { key: "assignedName", label: tx("inbox.col.assignee"), value: (r) => staffName(r.assignedTo) },
          { key: "subject", label: tx("inbox.col.subject") },
          { key: "category", label: tx("inbox.col.category") },
          { key: "priority", label: tx("inbox.col.priority") },
          { key: "name", label: tx("inbox.col.requester") },
          { key: "email", label: tx("inbox.col.email") },
          { key: "ageHours", label: tx("inbox.col.ageHours"), value: (r) => Math.round((now - toMillis(r.createdAt)) / 3_600_000) },
          { key: "sla", label: tx("inbox.col.sla"), value: (r) => slaState(r, now) },
        ]
        : [
          { key: "id", label: tx("inbox.col.id") },
          { key: "createdAt", label: tx("inbox.col.createdAt"), value: (r) => formatDate(r.createdAt) },
          { key: "status", label: tx("inbox.col.status"), value: (r) => r.status || "pending" },
          { key: "assignedName", label: tx("inbox.col.assignee"), value: (r) => staffName(r.assignedTo) },
          { key: "pseudo", label: tx("inbox.col.pseudo") },
          { key: "position", label: tx("inbox.col.position") },
          { key: "game", label: tx("inbox.col.game") },
          { key: "ageRange", label: tx("inbox.col.ageRange") },
          { key: "country", label: tx("inbox.col.country") },
          { key: "name", label: tx("inbox.col.requester") },
          { key: "email", label: tx("inbox.col.email") },
        ];
    const prefix = mixed ? tx("inbox.csv.mixed") : scoped[0].source === "support" ? tx("inbox.csv.support") : tx("inbox.csv.recruit");
    downloadCsv(csvFileName(prefix), toCsv(scoped, columns));
  };

  const formatDate = (value) => {
    const ms = toMillis(value);
    if (!ms) return "";
    return new Date(ms).toLocaleString(lang === "en" ? "en-US" : "fr-FR", {
      dateStyle: "short", timeStyle: "short",
    });
  };

  const saveCanned = async (e) => {
    e.preventDefault();
    if (cannedForm.title.trim().length < 2 || cannedForm.body.trim().length < 2) {
      toast.error(t("common.error"));
      return;
    }
    try {
      await addDoc(collection(db, "cannedResponses"), {
        title: cannedForm.title.trim().slice(0, 120),
        body: cannedForm.body.trim().slice(0, 4000),
        scope: cannedForm.scope,
        createdBy: user?.uid || null,
        createdAt: serverTimestamp(),
      });
      setCannedForm(EMPTY_CANNED);
      toast.success(tx("inbox.canned.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const removeCanned = async (id) => {
    try {
      await deleteDoc(doc(db, "cannedResponses", id));
      toast.success(tx("inbox.canned.deleted"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const insertCanned = (item) => {
    setDraft((d) => ({ text: item.body, key: d.key + 1 }));
  };

  if (!canSeeInbox) {
    return <p className="text-[#f7f7f7]/50" data-testid="admin-inbox-denied">{t("player.noAccess")}</p>;
  }

  const scopedCanned = canned.filter((c) => c.scope === "all" || !c.scope || c.scope === current?.source);

  return (
    <div data-testid="admin-inbox">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Inbox className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{tx("inbox.title")}</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50 max-w-2xl">{tx("inbox.sub")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => exportRows(filtered)} data-testid="admin-inbox-export"
            className="inline-flex items-center gap-2 border border-white/20 text-[#f7f7f7] text-xs uppercase tracking-widest px-3 py-2 hover:border-[#D8CA82] hover:text-[#D8CA82]">
            <Download size={14} /> {tx("inbox.export")}
          </button>
          <button type="button" onClick={() => setCannedOpen((v) => !v)} data-testid="admin-inbox-canned-toggle"
            className="inline-flex items-center gap-2 border border-white/20 text-[#f7f7f7] text-xs uppercase tracking-widest px-3 py-2 hover:border-[#D8CA82] hover:text-[#D8CA82]">
            <MessageSquare size={14} /> {tx("inbox.canned.title")}
          </button>
        </div>
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" data-testid="admin-inbox-counters">
        {[
          { key: "open", value: counts.open, cls: "text-[#D8CA82] border-[#D8CA82]/30" },
          { key: "unassigned", value: counts.unassigned, cls: "text-sky-300 border-sky-300/30" },
          { key: "overdue", value: counts.overdue, cls: "text-red-300 border-red-400/40" },
          { key: "results", value: filtered.length, cls: "text-[#f7f7f7] border-white/15" },
        ].map((c) => (
          <div key={c.key} className={`border bg-[#141414] px-4 py-3 ${c.cls}`}>
            <p className="text-2xl font-display font-bold">{c.value}</p>
            <p className="text-xs uppercase tracking-widest text-[#c8c8c8]">{tx(`inbox.counter.${c.key}`)}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-300 mb-4" role="alert">{error}</p>}

      {/* Filtres */}
      <div className="border border-white/10 bg-[#141414] p-4 mb-4" data-testid="admin-inbox-filters">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82] inline-flex items-center gap-2">
            <Filter size={13} /> {tx("inbox.filters")}
          </p>
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} data-testid="admin-inbox-reset"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#c8c8c8] hover:text-[#D8CA82]">
            <RotateCcw size={12} /> {tx("inbox.reset")}
          </button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <label className="relative lg:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c8c8c8]" />
            <input value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder={tx("inbox.search")} className={`${inputCls} pl-9`} data-testid="admin-inbox-search" />
          </label>
          <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
            className={inputCls} aria-label={tx("inbox.source")} data-testid="admin-inbox-filter-source">
            {SOURCES.filter((s) => s !== "support" || canSeeSupport).filter((s) => s !== "recruit" || canSeeRecruit)
              .map((s) => <option key={s} value={s}>{tx(`inbox.source.${s}`)}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className={inputCls} aria-label={tx("inbox.filter.status")} data-testid="admin-inbox-filter-status">
            <option value="all">{tx("inbox.filter.status")} — {tx("inbox.filter.all")}</option>
            {[...new Set([...statusOptionsFor("support"), ...statusOptionsFor("recruit")])]
              .map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
          <select value={filters.assignee} onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))}
            className={inputCls} aria-label={tx("inbox.filter.assignee")} data-testid="admin-inbox-filter-assignee">
            <option value="all">{tx("inbox.filter.assignee")} — {tx("inbox.filter.all")}</option>
            <option value="unassigned">{tx("inbox.filter.unassigned")}</option>
            <option value="mine">{tx("inbox.filter.mine")}</option>
            <option value="overdue">{tx("inbox.filter.overdue")}</option>
          </select>
          <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            className={inputCls} aria-label={tx("inbox.filter.category")} data-testid="admin-inbox-filter-category">
            <option value="all">{tx("inbox.filter.category")} — {tx("inbox.filter.all")}</option>
            {SUPPORT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`support.cat.${c}`)}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
            className={inputCls} aria-label={tx("inbox.filter.priority")} data-testid="admin-inbox-filter-priority">
            <option value="all">{tx("inbox.filter.priority")} — {tx("inbox.filter.all")}</option>
            {SUPPORT_PRIORITIES.map((p) => <option key={p} value={p}>{t(`support.prio.${p}`)}</option>)}
          </select>
          <select value={filters.game} onChange={(e) => setFilters((f) => ({ ...f, game: e.target.value }))}
            className={inputCls} aria-label={tx("inbox.filter.game")} data-testid="admin-inbox-filter-game">
            <option value="all">{tx("inbox.filter.game")} — {tx("inbox.filter.all")}</option>
            {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>

      {/* Actions groupées */}
      <div className="flex flex-wrap items-center gap-2 mb-4" data-testid="admin-inbox-bulk">
        <button type="button" onClick={toggleAll} data-testid="admin-inbox-select-all"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#c8c8c8] hover:text-[#D8CA82]">
          {allVisibleChecked ? <CheckSquare size={14} /> : <Square size={14} />} {tx("inbox.selectAll")}
        </button>
        <span className="text-xs text-[#c8c8c8]">{checked.length} {tx("inbox.selected")}</span>
        <span className="flex-1" />
        <select onChange={(e) => { if (e.target.value) { bulkApply("status", e.target.value); e.target.value = ""; } }}
          className="bg-[#111111] border border-white/20 px-3 py-2 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
          aria-label={tx("inbox.bulk.status")} disabled={!checked.length} data-testid="admin-inbox-bulk-status">
          <option value="">{tx("inbox.bulk.status")}…</option>
          {[...new Set([...statusOptionsFor("support"), ...statusOptionsFor("recruit")])]
            .map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
        <select onChange={(e) => { if (e.target.value) { bulkApply("assign", e.target.value); e.target.value = ""; } }}
          className="bg-[#111111] border border-white/20 px-3 py-2 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
          aria-label={tx("inbox.bulk.assign")} disabled={!checked.length} data-testid="admin-inbox-bulk-assign">
          <option value="">{tx("inbox.bulk.assign")}…</option>
          <option value="__unassigned__">{tx("inbox.detail.unassigned")}</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" onClick={() => exportRows(threads.filter((th) => checked.includes(threadKey(th))))}
          disabled={!checked.length} data-testid="admin-inbox-export-selected"
          className="inline-flex items-center gap-2 border border-white/20 text-[#f7f7f7] text-xs uppercase tracking-widest px-3 py-2 hover:border-[#D8CA82] hover:text-[#D8CA82] disabled:opacity-40">
          <Download size={13} /> {tx("inbox.exportSelected")}
        </button>
      </div>

      {/* Réponses types : gestion */}
      {cannedOpen && (
        <div className="border border-[#D8CA82]/25 bg-[#141414] p-4 mb-4" data-testid="admin-inbox-canned-panel">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82]">{tx("inbox.canned.title")}</p>
            <button type="button" onClick={() => setCannedOpen(false)} aria-label={t("common.close")}>
              <X size={14} className="text-[#c8c8c8] hover:text-[#f7f7f7]" />
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {canned.length === 0 && <p className="text-sm text-[#c8c8c8]">{tx("inbox.canned.empty")}</p>}
              {canned.map((c) => (
                <div key={c.id} className="flex items-start gap-2 border border-white/10 bg-[#1A1A1A] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#f7f7f7] font-semibold truncate">{c.title}</p>
                    <p className="text-xs text-[#c8c8c8] line-clamp-2">{c.body}</p>
                    <p className="text-[10px] uppercase tracking-widest text-[#D8CA82]/70 mt-1">{c.scope || "all"}</p>
                  </div>
                  <button type="button" onClick={() => insertCanned(c)} title={tx("inbox.canned.insert")}
                    className="text-[#D8CA82] hover:text-[#f7f7f7]" data-testid={`admin-canned-insert-${c.id}`}>
                    <Send size={14} />
                  </button>
                  <ConfirmAction title={tx("inbox.canned.delete")} description={c.title}
                    confirmLabel={t("common.delete")} onConfirm={() => removeCanned(c.id)}>
                    <button type="button" className="text-red-400/70 hover:text-red-400" aria-label={`${tx("inbox.canned.delete")} ${c.title}`}>
                      <Trash2 size={14} />
                    </button>
                  </ConfirmAction>
                </div>
              ))}
            </div>
            <form onSubmit={saveCanned} className="space-y-2" data-testid="admin-inbox-canned-form">
              <p className="text-xs uppercase tracking-widest text-[#c8c8c8]">{tx("inbox.canned.new")}</p>
              <input value={cannedForm.title} onChange={(e) => setCannedForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={tx("inbox.canned.fieldTitle")} className={inputCls} required maxLength={120} />
              <textarea value={cannedForm.body} onChange={(e) => setCannedForm((f) => ({ ...f, body: e.target.value }))}
                placeholder={tx("inbox.canned.fieldBody")} className={inputCls} rows={3} required maxLength={4000} />
              <select value={cannedForm.scope} onChange={(e) => setCannedForm((f) => ({ ...f, scope: e.target.value }))}
                className={inputCls} aria-label={tx("inbox.canned.fieldScope")}>
                <option value="all">{tx("inbox.canned.scope.all")}</option>
                <option value="support">{tx("inbox.canned.scope.support")}</option>
                <option value="recruit">{tx("inbox.canned.scope.recruit")}</option>
              </select>
              <button type="submit" data-testid="admin-inbox-canned-save"
                className="inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-2.5">
                <Plus size={13} /> {tx("inbox.canned.save")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Liste + détail */}
      <div className="grid lg:grid-cols-12 border border-white/10 bg-[#141414] min-h-[520px]">
        <div ref={listRef} className={`lg:col-span-5 border-r border-white/10 overflow-y-auto max-h-[720px] ${current ? "hidden lg:block" : "block"}`}
          data-testid="admin-inbox-list">
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-[#c8c8c8]">
              {threads.length === 0 ? tx("inbox.empty") : tx("inbox.noResults")}
            </p>
          ) : filtered.map((th) => {
            const key = threadKey(th);
            const state = slaState(th, now);
            const isChecked = checked.includes(key);
            return (
              <div key={key} className={`border-b border-white/5 transition-colors ${selected === key ? "bg-[#D8CA82]/10 border-l-2 border-l-[#D8CA82]" : "hover:bg-white/5"}`}>
                <div className="flex items-start gap-2 px-3 py-3">
                  <button type="button" onClick={() => toggleChecked(key)} className="mt-0.5 text-[#c8c8c8] hover:text-[#D8CA82]"
                    aria-pressed={isChecked} aria-label={`${tx("inbox.selectAll")} ${threadTitle(th)}`} data-testid={`admin-inbox-check-${th.source}-${th.id}`}>
                    {isChecked ? <CheckSquare size={15} /> : <Square size={15} />}
                  </button>
                  <button type="button" onClick={() => setSelected(key)} className="flex-1 text-left min-w-0"
                    data-testid={`admin-inbox-thread-${th.source}-${th.id}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 shrink-0 ${th.source === "support" ? "border-[#D8CA82]/40 text-[#D8CA82]" : "border-sky-300/40 text-sky-300"}`}>
                        {tx(`inbox.source.${th.source}`)}
                      </span>
                      <p className="text-sm font-semibold text-[#f7f7f7] truncate flex-1">{threadTitle(th)}</p>
                      {!isThreadClosed(th) && (
                        <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 shrink-0 ${SLA_CLS[state]}`}>
                          {state === "overdue" ? <AlertTriangle size={10} className="inline" /> : <Clock size={10} className="inline" />} {formatAge(th, lang, now)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-[#c8c8c8] truncate">{th.name || th.pseudo || "—"}</span>
                      <span className="text-[#c8c8c8]/40">·</span>
                      <span className="text-xs text-[#f7f7f7]/50 truncate">
                        {th.source === "support" ? t(`support.cat.${th.category || "other"}`) : th.position || th.game || "—"}
                      </span>
                      {!th.assignedTo && (
                        <span className="text-[10px] uppercase tracking-widest text-sky-300/80">{tx("inbox.filter.unassigned")}</span>
                      )}
                      <span className="text-[10px] uppercase tracking-widest border border-white/15 px-1.5 py-0.5 text-[#c8c8c8]">
                        {t(`status.${th.status || (th.source === "support" ? "open" : "pending")}`)}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className={`lg:col-span-7 flex flex-col min-h-0 ${current ? "flex" : "hidden lg:flex"}`} data-testid="admin-inbox-detail">
          {!current ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <p className="text-sm text-[#c8c8c8]">{tx("inbox.detail.empty")}</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-white/10 bg-[#1A1A1A] shrink-0">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => setSelected(null)} className="lg:hidden text-[#c8c8c8] hover:text-[#D8CA82]" aria-label={t("common.close")}>
                    <ChevronLeft size={18} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display text-[#D8CA82] uppercase tracking-wider truncate">
                      {threadTitle(current)}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#c8c8c8]">
                      <span>{current.name || current.pseudo}</span>
                      {current.email && (
                        <a href={`mailto:${current.email}`} className="inline-flex items-center gap-1 text-[#D8CA82] hover:underline">
                          <Mail size={11} /> {current.email}
                        </a>
                      )}
                      {current.source === "recruit" && current.game && <span>{current.game}</span>}
                      {current.source === "recruit" && current.position && <span>{current.position}</span>}
                      {current.source === "support" && <span>{t(`support.cat.${current.category || "other"}`)} · {t(`support.prio.${current.priority || "normal"}`)}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${SLA_CLS[slaState(current, now)]}`}
                        data-testid="admin-inbox-sla">
                        {slaState(current, now) === "overdue" ? tx("inbox.detail.overdue") : slaState(current, now) === "soon" ? tx("inbox.detail.slaSoon") : tx("inbox.detail.slaOk")}
                        {" · "}{tx("inbox.detail.sla")} {slaHoursFor(current)} h
                        {!isThreadClosed(current) && ` · ${Math.abs(slaRemainingHours(current, now))} h ${slaState(current, now) === "overdue" ? "+" : tx("inbox.detail.remaining")}`}
                      </span>
                      <span className="text-xs text-[#c8c8c8]">{tx("inbox.detail.created")} {formatDate(current.createdAt)}</span>
                      {current.spontaneous && <span className="text-[10px] uppercase tracking-widest text-sky-300">{tx("inbox.detail.spontaneous")}</span>}
                      {current.parentalConsent && <span className="text-[10px] uppercase tracking-widest text-amber-300">{tx("inbox.detail.parental")}</span>}
                    </div>
                  </div>
                  <a href={current.source === "support" ? "/support" : "/recrutement"} target="_blank" rel="noopener noreferrer"
                    className="text-xs uppercase tracking-widest text-[#c8c8c8] hover:text-[#D8CA82] shrink-0">
                    {tx("inbox.detail.publicPage")} ↗
                  </a>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#c8c8c8]">
                    {tx("inbox.detail.assignee")}
                    <select value={current.assignedTo || ""} onChange={(e) => assign(current, e.target.value || null)}
                      className="bg-[#111111] border border-white/20 px-2 py-1.5 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
                      data-testid="admin-inbox-assign">
                      <option value="">{tx("inbox.detail.unassigned")}</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      {current.assignedTo && !staff.some((s) => s.id === current.assignedTo) && (
                        <option value={current.assignedTo}>{current.assignedName || current.assignedTo}</option>
                      )}
                    </select>
                  </label>
                  {!current.assignedTo && user && (
                    <button type="button" onClick={() => assign(current, user.uid)} data-testid="admin-inbox-assign-me"
                      className="inline-flex items-center gap-1.5 border border-[#D8CA82]/40 text-[#D8CA82] text-xs uppercase tracking-widest px-2 py-1.5 hover:bg-[#D8CA82]/10">
                      <UserCheck size={12} /> {tx("inbox.filter.mine")}
                    </button>
                  )}
                  <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#c8c8c8]">
                    {tx("inbox.detail.status")}
                    <select value={current.status || ""} onChange={(e) => setStatus(current, e.target.value)}
                      className="bg-[#111111] border border-white/20 px-2 py-1.5 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
                      data-testid="admin-inbox-status">
                      {statusOptionsFor(current.source).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              {scopedCanned.length > 0 && (
                <div className="px-4 py-2 border-b border-white/10 bg-[#141414] shrink-0 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-widest text-[#c8c8c8] inline-flex items-center gap-1">
                    <Tag size={11} /> {tx("inbox.canned.title")}
                  </span>
                  {scopedCanned.slice(0, 6).map((c) => (
                    <button key={c.id} type="button" onClick={() => insertCanned(c)} data-testid={`admin-inbox-canned-${c.id}`}
                      className="text-[11px] border border-white/15 px-2 py-1 text-[#f7f7f7]/80 hover:border-[#D8CA82] hover:text-[#D8CA82]">
                      {c.title}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 min-h-0">
                <ChatMessages path={`${current.source === "support" ? "supportThreads" : "recruitThreads"}/${current.id}/messages`}
                  testId="admin-inbox-chat" draft={draft.text} draftKey={draft.key} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
