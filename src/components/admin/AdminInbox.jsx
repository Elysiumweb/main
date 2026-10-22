import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  AlarmClock,
  ArrowUpRight,
  Check,
  Download,
  Inbox,
  MessageSquare,
  Plus,
  Trash2,
  UserCheck,
} from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { ChatMessages } from "../ChatMessages";
import { createNotification, logAdminAction } from "../../lib/notify";
import { downloadCsv, csvFilename } from "../../lib/csv";
import { useBulkSelection } from "../../hooks/useBulkSelection";
import { RECRUIT_STATUSES } from "../../lib/recruitment";
import { PERMISSION } from "../../lib/permissions";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const smallInput = "bg-[#111111] border border-white/20 px-2.5 py-2 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

const SUPPORT_STATUSES = ["open", "in_progress", "resolved"];
const SUPPORT_CATEGORIES = ["account", "technical", "team", "donate", "other"];
const PRIORITIES = ["low", "normal", "high"];
const CLOSED_STATUSES = ["resolved", "accepted", "rejected"];

const CATEGORY_LABELS = {
  account: "Compte",
  technical: "Technique",
  team: "Équipe",
  donate: "Dons",
  other: "Autre",
};

const DEFAULT_CANNED = [
  {
    id: "builtin-accuse",
    label: "Accusé de réception",
    text: "Bonjour,\n\nMerci pour votre message. Nous avons bien reçu votre demande et revenons vers vous sous 48 h ouvrées.\n\n— L'équipe Elysium",
  },
  {
    id: "builtin-infos",
    label: "Demande d'informations",
    text: "Bonjour,\n\nPour traiter votre demande au mieux, pouvez-vous nous préciser votre pseudo, la plateforme concernée et les étapes qui ont conduit au problème ?\n\nMerci d'avance,\n— L'équipe Elysium",
  },
  {
    id: "builtin-recruit",
    label: "Candidature reçue",
    text: "Bonjour,\n\nVotre candidature a bien été enregistrée. Nous étudions chaque dossier avec attention et reviendrons vers vous prochainement.\n\n— L'équipe Elysium",
  },
  {
    id: "builtin-close",
    label: "Clôture",
    text: "Bonjour,\n\nSans retour de votre part, nous clôturons cette demande. N'hésitez pas à rouvrir une conversation si le sujet revient.\n\n— L'équipe Elysium",
  },
];

const fmtDate = (ts, lang) => {
  if (!ts) return "—";
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(lang === "en" ? "en-US" : "fr-FR", { dateStyle: "short", timeStyle: "short" });
};

const ageHours = (ts, now = Date.now()) => {
  if (!ts) return null;
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.max(0, Math.round((now - date.getTime()) / 3600000));
};

const fmtAge = (hours) => {
  if (hours == null) return "—";
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} j`;
};

const slaLesson = (hours, status) => {
  if (hours == null) return { label: "—", cls: "text-[#c8c8c8] border-white/20" };
  if (CLOSED_STATUSES.includes(status)) return { label: fmtAge(hours), cls: "text-[#c8c8c8] border-white/20" };
  if (hours >= 72) return { label: `${fmtAge(hours)} · retard`, cls: "text-red-300 border-red-400/50 bg-red-500/10" };
  if (hours >= 24) return { label: `${fmtAge(hours)} · à traiter`, cls: "text-orange-300 border-orange-300/40 bg-orange-500/5" };
  return { label: fmtAge(hours), cls: "text-emerald-300 border-emerald-300/40" };
};

export const AdminInbox = () => {
  const { user, displayName, can } = useAuth();
  const { t, lang } = useLang();

  const canSupport = can(PERMISSION.INBOX_SUPPORT);
  const canRecruit = can(PERMISSION.INBOX_RECRUIT);
  const canManage = can(PERMISSION.INBOX_MANAGE);
  const canExport = can(PERMISSION.INBOX_EXPORT);
  const canCanned = can(PERMISSION.CANNED_REPLIES);

  const [source, setSource] = useState(canSupport ? "support" : "recruit");
  const [supportThreads, setSupportThreads] = useState([]);
  const [recruitThreads, setRecruitThreads] = useState([]);
  const [staff, setStaff] = useState([]);
  const [canned, setCanned] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [filters, setFilters] = useState({
    q: "",
    status: "all",
    category: "all",
    priority: "all",
    game: "all",
    assignee: "all",
  });
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [cannedForm, setCannedForm] = useState({ label: "", text: "" });
  const [showCannedForm, setShowCannedForm] = useState(false);

  useEffect(() => {
    if (!canSupport) return;
    return onSnapshot(
      collection(db, "supportThreads"),
      (snap) => setSupportThreads(snap.docs.map((d) => ({ id: d.id, kind: "support", ...d.data() }))),
      (err) => console.error("supportThreads", err),
    );
  }, [canSupport]);

  useEffect(() => {
    if (!canRecruit) return;
    return onSnapshot(
      collection(db, "recruitThreads"),
      (snap) => setRecruitThreads(snap.docs.map((d) => ({ id: d.id, kind: "recruit", ...d.data() }))),
      (err) => console.error("recruitThreads", err),
    );
  }, [canRecruit]);

  useEffect(() => {
    if (!canManage) return;
    return onSnapshot(
      query(collection(db, "users"), where("role", "in", ["manager", "bureau"])),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
        setStaff(list);
      },
      (err) => console.error("staff", err),
    );
  }, [canManage]);

  useEffect(() => {
    // Lecture des réponses types : permission `inbox.canned` (règle Firestore).
    if (!canCanned) return;
    return onSnapshot(
      collection(db, "cannedReplies"),
      (snap) => setCanned(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("cannedReplies", err),
    );
  }, [canCanned]);

  const allThreads = useMemo(
    () => [...(canSupport ? supportThreads : []), ...(canRecruit ? recruitThreads : [])],
    [supportThreads, recruitThreads, canSupport, canRecruit],
  );

  // Le compteur de la navbar et l'onglet par défaut reposent sur ces valeurs.
  const openCounts = useMemo(
    () => ({
      support: supportThreads.filter((th) => !CLOSED_STATUSES.includes(th.status)).length,
      recruit: recruitThreads.filter((th) => !CLOSED_STATUSES.includes(th.status)).length,
    }),
    [supportThreads, recruitThreads],
  );

  const scoped = useMemo(
    () => (source === "support" ? supportThreads : recruitThreads),
    [source, supportThreads, recruitThreads],
  );

  const statusOptions = source === "support" ? SUPPORT_STATUSES : RECRUIT_STATUSES;

  const filtered = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    const now = Date.now();
    return scoped
      .filter((th) => {
        if (filters.status !== "all" && (th.status || "open") !== filters.status) return false;
        if (filters.category !== "all" && th.category !== filters.category) return false;
        if (filters.priority !== "all" && (th.priority || "normal") !== filters.priority) return false;
        if (filters.game !== "all" && th.game !== filters.game) return false;
        if (filters.assignee === "unassigned" && th.assigneeUid) return false;
        if (filters.assignee === "me" && th.assigneeUid !== user?.uid) return false;
        if (filters.assignee !== "all" && filters.assignee !== "unassigned" && filters.assignee !== "me" && th.assigneeUid !== filters.assignee) return false;
        if (needle) {
          const haystack = [th.subject, th.position, th.meta, th.email, th.uid, th.assigneeName, th.category, th.status]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // SLA : les dossiers en retard d'abord, puis les plus anciens.
        const aHours = ageHours(a.createdAt, now) ?? 0;
        const bHours = ageHours(b.createdAt, now) ?? 0;
        const aLate = !CLOSED_STATUSES.includes(a.status) && aHours >= 72 ? 1 : 0;
        const bLate = !CLOSED_STATUSES.includes(b.status) && bHours >= 72 ? 1 : 0;
        if (aLate !== bLate) return bLate - aLate;
        return bHours - aHours;
      });
  }, [scoped, filters, user?.uid]);

  const bulk = useBulkSelection(filtered);
  const selectedThread = allThreads.find((th) => th.kind === source && th.id === selectedId)
    || scoped.find((th) => th.id === selectedId)
    || filtered[0]
    || null;

  useEffect(() => {
    if (selectedId && !filtered.some((th) => th.id === selectedId)) setSelectedId(filtered[0]?.id || null);
  }, [filtered, selectedId]);

  useEffect(() => {
    bulk.clear();
  }, [source, bulk.clear]); // eslint-disable-line react-hooks/exhaustive-deps

  const collectionName = source === "support" ? "supportThreads" : "recruitThreads";

  const labelOf = (th) => th.subject || th.position || "Sans titre";

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const updateThread = async (thread, patch, auditAction) => {
    if (!thread || !canManage) return;
    try {
      await updateDoc(doc(db, collectionName, thread.id), { ...patch, updatedAt: serverTimestamp() });
      await logAdminAction({
        action: auditAction || "inbox_thread_updated",
        label: labelOf(thread),
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: collectionName, id: thread.id },
        details: patch,
      });
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const applyBulkStatus = async (status) => {
    if (!canManage || bulk.count === 0) return;
    const targets = filtered.filter((th) => bulk.selectedSet.has(th.id));
    try {
      await Promise.all(targets.map((th) => updateDoc(doc(db, collectionName, th.id), { status, updatedAt: serverTimestamp() })));
      await logAdminAction({
        action: "inbox_bulk_status",
        label: `${targets.length} dossier(s) → ${status}`,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: collectionName, id: targets.map((th) => th.id).join(",") },
      });
      bulk.clear();
      toast.success(`${targets.length} dossier(s) mis à jour`);
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const applyBulkAssignee = async (uid) => {
    if (!canManage || bulk.count === 0) return;
    const person = staff.find((s) => s.id === uid);
    const targets = filtered.filter((th) => bulk.selectedSet.has(th.id));
    try {
      await Promise.all(targets.map((th) => updateDoc(doc(db, collectionName, th.id), {
        assigneeUid: uid || null,
        assigneeName: person?.displayName || (uid ? "Staff" : null),
        updatedAt: serverTimestamp(),
      })));
      bulk.clear();
      toast.success(`${targets.length} dossier(s) assigné(s)`);
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const exportRows = () => {
    const rows = bulk.count > 0 ? filtered.filter((th) => bulk.selectedSet.has(th.id)) : filtered;
    if (!rows.length) {
      toast.error("Aucun dossier à exporter");
      return;
    }
    downloadCsv(
      csvFilename(`elysium-${source}-${bulk.count > 0 ? "selection" : "filtre"}`),
      rows.map((th) => ({
        id: th.id,
        type: source,
        sujet: labelOf(th),
        statut: th.status || "open",
        categorie: th.category || "",
        priorite: th.priority || "normal",
        jeu: th.game || "",
        assigne: th.assigneeName || "",
        cree_le: (th.createdAt?.toDate ? th.createdAt.toDate() : new Date(th.createdAt || Date.now())).toISOString(),
        anciennete_heures: ageHours(th.createdAt) ?? "",
        uid: th.uid || "",
        email: th.email || "",
        message: th.meta || "",
      })),
      [
        { key: "id", label: "ID" },
        { key: "type", label: "Type" },
        { key: "sujet", label: "Sujet" },
        { key: "statut", label: "Statut" },
        { key: "categorie", label: "Catégorie" },
        { key: "priorite", label: "Priorité" },
        { key: "jeu", label: "Jeu" },
        { key: "assigne", label: "Assigné à" },
        { key: "cree_le", label: "Créé le (UTC)" },
        { key: "anciennete_heures", label: "Ancienneté (h)" },
        { key: "uid", label: "UID" },
        { key: "email", label: "Email" },
        { key: "message", label: "Message initial" },
      ],
    );
    toast.success(`${rows.length} ligne(s) exportée(s)`);
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!selectedThread || !canManage) return;
    const text = replyText.trim();
    if (!text) return;
    setSending(true);
    try {
      await addDoc(collection(db, collectionName, selectedThread.id, "messages"), {
        uid: user.uid,
        name: displayName || "Staff",
        text,
        createdAt: serverTimestamp(),
      });
      const patch = { lastReplyAt: serverTimestamp(), updatedAt: serverTimestamp() };
      if (selectedThread.status === "open" || selectedThread.status === "pending") patch.status = "in_progress";
      await updateDoc(doc(db, collectionName, selectedThread.id), patch);
      if (selectedThread.uid && selectedThread.uid !== user.uid) {
        await createNotification({
          targetUid: selectedThread.uid,
          type: "thread_reply",
          extra: labelOf(selectedThread),
          link: source === "support" ? "/support" : "/recrutement",
        });
      }
      setReplyText("");
      toast.success("Réponse envoyée");
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
    setSending(false);
  };

  const saveCanned = async (event) => {
    event.preventDefault();
    if (!cannedForm.label.trim() || !cannedForm.text.trim()) return;
    try {
      await addDoc(collection(db, "cannedReplies"), {
        label: cannedForm.label.trim().slice(0, 80),
        text: cannedForm.text.trim().slice(0, 4000),
        createdAt: serverTimestamp(),
      });
      setCannedForm({ label: "", text: "" });
      setShowCannedForm(false);
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const removeCanned = async (id) => {
    try {
      await deleteDoc(doc(db, "cannedReplies", id));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const cannedList = canned.length ? canned : DEFAULT_CANNED;
  const threadHref = source === "support" ? "/support" : "/recrutement";
  const selectedHours = selectedThread ? ageHours(selectedThread.createdAt) : null;
  const selectedSla = selectedThread ? slaLesson(selectedHours, selectedThread.status) : null;
  const selectedMeta = selectedThread?.meta || "";

  return (
    <div className="space-y-5" data-testid="admin-inbox">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Inbox className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">Boîte de réception</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50">
            Support et candidatures au même endroit : filtres, assignation, SLA, réponses types et export CSV.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canSupport && (
            <button
              onClick={() => { setSource("support"); setSelectedId(null); }}
              data-testid="admin-inbox-tab-support"
              className={`px-4 py-2 text-xs uppercase tracking-widest border ${source === "support" ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#f7f7f7]/60 hover:border-[#D8CA82]/50"}`}
            >
              Support <span className="ml-1 text-[#c8c8c8]">{openCounts.support}</span>
            </button>
          )}
          {canRecruit && (
            <button
              onClick={() => { setSource("recruit"); setSelectedId(null); }}
              data-testid="admin-inbox-tab-recruit"
              className={`px-4 py-2 text-xs uppercase tracking-widest border ${source === "recruit" ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#f7f7f7]/60 hover:border-[#D8CA82]/50"}`}
            >
              Candidatures <span className="ml-1 text-[#c8c8c8]">{openCounts.recruit}</span>
            </button>
          )}
          {canExport && (
            <button onClick={exportRows} data-testid="admin-inbox-export"
              className="inline-flex items-center gap-2 border border-[#D8CA82]/50 text-[#D8CA82] px-4 py-2 text-xs uppercase tracking-widest hover:bg-[#D8CA82]/10">
              <Download size={14} /> CSV
            </button>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-2" data-testid="admin-inbox-filters">
        <input
          value={filters.q}
          onChange={(e) => setFilter("q", e.target.value)}
          placeholder="Rechercher…"
          className={`${inputCls} lg:col-span-2`}
          data-testid="admin-inbox-search"
          aria-label="Rechercher un dossier"
        />
        <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={inputCls} data-testid="admin-inbox-filter-status" aria-label="Statut">
          <option value="all">Tous les statuts</option>
          {statusOptions.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
        {source === "support" ? (
          <select value={filters.category} onChange={(e) => setFilter("category", e.target.value)} className={inputCls} data-testid="admin-inbox-filter-category" aria-label="Catégorie">
            <option value="all">Toutes catégories</option>
            {SUPPORT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        ) : (
          <select value={filters.game} onChange={(e) => setFilter("game", e.target.value)} className={inputCls} data-testid="admin-inbox-filter-game" aria-label="Jeu">
            <option value="all">Tous les jeux</option>
            <option value="EVA">EVA</option>
            <option value="Rocket League">Rocket League</option>
          </select>
        )}
        <select value={filters.priority} onChange={(e) => setFilter("priority", e.target.value)} className={inputCls} data-testid="admin-inbox-filter-priority" aria-label="Priorité">
          <option value="all">Toutes priorités</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p === "high" ? "Haute" : p === "low" ? "Basse" : "Normale"}</option>)}
        </select>
        <select value={filters.assignee} onChange={(e) => setFilter("assignee", e.target.value)} className={inputCls} data-testid="admin-inbox-filter-assignee" aria-label="Assignation">
          <option value="all">Tout le staff</option>
          <option value="unassigned">Non assigné</option>
          <option value="me">Moi</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.displayName || s.email || s.id}</option>)}
        </select>
      </div>

      {bulk.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 border border-[#D8CA82]/40 bg-[#D8CA82]/5 px-3 py-2" data-testid="admin-inbox-bulk-bar">
          <span className="text-xs uppercase tracking-widest text-[#D8CA82]">{bulk.count} sélectionné(s)</span>
          {canManage && (
            <>
              <select onChange={(e) => { applyBulkStatus(e.target.value); e.target.value = ""; }} className={smallInput} defaultValue="" data-testid="admin-inbox-bulk-status">
                <option value="" disabled>Changer le statut…</option>
                {statusOptions.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
              <select onChange={(e) => { applyBulkAssignee(e.target.value); e.target.value = ""; }} className={smallInput} defaultValue="" data-testid="admin-inbox-bulk-assignee">
                <option value="" disabled>Assigner à…</option>
                <option value="">Désassigner</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.displayName || s.email || s.id}</option>)}
              </select>
            </>
          )}
          {canExport && <button onClick={exportRows} className="text-xs uppercase tracking-widest text-[#D8CA82] hover:underline">Exporter la sélection</button>}
          <button onClick={bulk.clear} className="ml-auto text-xs uppercase tracking-widest text-[#c8c8c8] hover:text-[#f7f7f7]">Annuler</button>
        </div>
      )}

      <div className="grid lg:grid-cols-12 border border-white/10 bg-[#141414] min-h-[520px] overflow-hidden">
        <div className="lg:col-span-5 border-r border-white/10 flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 text-[10px] uppercase tracking-widest text-[#c8c8c8]">
            <input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll}
              aria-label="Tout sélectionner" data-testid="admin-inbox-select-all"
              className="accent-[#D8CA82] h-3.5 w-3.5" />
            <span>{filtered.length} dossier(s)</span>
            <span className="ml-auto">Ancienneté</span>
          </div>
          <div className="overflow-y-auto max-h-[520px]" data-testid="admin-inbox-list">
            {filtered.length === 0 && <p className="text-sm text-[#c8c8c8] px-4 py-8">Aucun dossier ne correspond aux filtres.</p>}
            {filtered.map((th) => {
              const hours = ageHours(th.createdAt);
              const sla = slaLesson(hours, th.status);
              const isSelected = selectedThread?.id === th.id;
              return (
                <div key={th.id} className={`flex items-start gap-2 border-b border-white/5 ${isSelected ? "bg-[#D8CA82]/10 border-l-2 border-l-[#D8CA82]" : "hover:bg-white/5"}`}>
                  <input type="checkbox" checked={bulk.isSelected(th.id)} onChange={() => bulk.toggle(th.id)}
                    aria-label={`Sélectionner ${labelOf(th)}`} data-testid={`admin-inbox-select-${th.id}`}
                    className="accent-[#D8CA82] h-3.5 w-3.5 mt-4 ml-3 shrink-0" />
                  <button onClick={() => setSelectedId(th.id)} className="flex-1 text-left px-2 py-3 min-w-0" data-testid={`admin-inbox-thread-${th.id}`}>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#f7f7f7] truncate flex-1">{labelOf(th)}</p>
                      <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 shrink-0 ${sla.cls}`}>{sla.label}</span>
                    </div>
                    <p className="text-xs text-[#c8c8c8] truncate mt-0.5">
                      {t(`status.${th.status || "open"}`)}
                      {th.category ? ` · ${CATEGORY_LABELS[th.category] || th.category}` : ""}
                      {th.priority === "high" ? " · priorité haute" : ""}
                      {th.game ? ` · ${th.game}` : ""}
                    </p>
                    <p className="text-[11px] text-[#c8c8c8]/70 truncate">
                      {th.assigneeName ? `Assigné à ${th.assigneeName}` : th.assigneeUid ? "Assigné" : "Non assigné"}
                      {" · "}{fmtDate(th.createdAt, lang)}
                    </p>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col min-h-0">
          {!selectedThread ? (
            <p className="text-sm text-[#c8c8c8] px-5 py-8">Sélectionnez un dossier.</p>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-white/10 bg-[#1A1A1A] space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-widest text-[#c8c8c8] flex items-center gap-2">
                      <MessageSquare size={12} /> {source === "support" ? "Support" : "Candidature"} · {selectedThread.uid || "—"}
                    </p>
                    <p className="font-display text-base text-[#D8CA82] uppercase tracking-wide truncate">{labelOf(selectedThread)}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {selectedSla && (
                        <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 inline-flex items-center gap-1 ${selectedSla.cls}`} data-testid="admin-inbox-sla">
                          <AlarmClock size={10} /> {selectedSla.label}
                        </span>
                      )}
                      {selectedThread.category && <span className="text-[10px] uppercase tracking-widest border border-white/20 text-[#c8c8c8] px-1.5 py-0.5">{CATEGORY_LABELS[selectedThread.category] || selectedThread.category}</span>}
                      {selectedThread.priority && <span className="text-[10px] uppercase tracking-widest border border-white/20 text-[#c8c8c8] px-1.5 py-0.5">{selectedThread.priority}</span>}
                      {selectedThread.game && <span className="text-[10px] uppercase tracking-widest border border-white/20 text-[#c8c8c8] px-1.5 py-0.5">{selectedThread.game}</span>}
                      <Link to={threadHref} target="_blank" rel="noreferrer" className="text-[10px] uppercase tracking-widest text-[#D8CA82] hover:underline inline-flex items-center gap-1" data-testid="admin-inbox-public-link">
                        Page publique <ArrowUpRight size={10} />
                      </Link>
                    </div>
                  </div>
                </div>
                {canManage && (
                  <div className="grid sm:grid-cols-3 gap-2">
                    <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
                      Statut
                      <select
                        value={selectedThread.status || statusOptions[0]}
                        onChange={(e) => updateThread(selectedThread, { status: e.target.value }, "inbox_status_changed")}
                        className={`${inputCls} mt-1`}
                        data-testid="admin-inbox-status"
                      >
                        {statusOptions.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
                      Assigné à
                      <select
                        value={selectedThread.assigneeUid || ""}
                        onChange={(e) => {
                          const person = staff.find((s) => s.id === e.target.value);
                          updateThread(selectedThread, { assigneeUid: e.target.value || null, assigneeName: person?.displayName || null }, "inbox_assigned");
                        }}
                        className={`${inputCls} mt-1`}
                        data-testid="admin-inbox-assignee"
                      >
                        <option value="">Non assigné</option>
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.displayName || s.email || s.id}</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
                      Priorité
                      <select
                        value={selectedThread.priority || "normal"}
                        onChange={(e) => updateThread(selectedThread, { priority: e.target.value }, "inbox_priority_changed")}
                        className={`${inputCls} mt-1`}
                        data-testid="admin-inbox-priority"
                      >
                        {PRIORITIES.map((p) => <option key={p} value={p}>{p === "high" ? "Haute" : p === "low" ? "Basse" : "Normale"}</option>)}
                      </select>
                    </label>
                  </div>
                )}
                {selectedMeta && (
                  <p className="text-xs text-[#f7f7f7]/55 whitespace-pre-wrap border-t border-white/10 pt-2 max-h-24 overflow-y-auto" data-testid="admin-inbox-meta">{selectedMeta}</p>
                )}
                {canManage && (
                  <div className="flex items-center gap-2 flex-wrap border-t border-white/10 pt-2">
                    <UserCheck size={13} className="text-[#D8CA82]" />
                    <span className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">Réponse type</span>
                    <select
                      onChange={(e) => {
                        const item = cannedList.find((c) => c.id === e.target.value);
                        if (item) setReplyText(item.text);
                        e.target.value = "";
                      }}
                      defaultValue=""
                      className={smallInput}
                      data-testid="admin-inbox-canned-select"
                    >
                      <option value="" disabled>Choisir…</option>
                      {cannedList.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    {canCanned && (
                      <button onClick={() => setShowCannedForm((v) => !v)} className="text-[10px] uppercase tracking-widest text-[#D8CA82] hover:underline inline-flex items-center gap-1" data-testid="admin-inbox-canned-toggle">
                        <Plus size={10} /> Gérer
                      </button>
                    )}
                  </div>
                )}
              </div>

              {canCanned && showCannedForm && (
                <form onSubmit={saveCanned} className="px-4 py-3 border-b border-white/10 bg-[#101010] space-y-2" data-testid="admin-inbox-canned-form">
                  <input value={cannedForm.label} onChange={(e) => setCannedForm((f) => ({ ...f, label: e.target.value }))}
                    placeholder="Nom de la réponse type" className={inputCls} data-testid="admin-inbox-canned-label" />
                  <textarea value={cannedForm.text} onChange={(e) => setCannedForm((f) => ({ ...f, text: e.target.value }))}
                    rows={2} placeholder="Texte envoyé au demandeur" className={inputCls} data-testid="admin-inbox-canned-text" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="submit" className="bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2" data-testid="admin-inbox-canned-save">Enregistrer</button>
                    {canned.map((c) => (
                      <button type="button" key={c.id} onClick={() => removeCanned(c.id)} className="text-[10px] uppercase tracking-widest text-red-300/80 hover:text-red-300 inline-flex items-center gap-1">
                        <Trash2 size={10} /> {c.label}
                      </button>
                    ))}
                  </div>
                </form>
              )}

              <div className="flex-1 min-h-0">
                <ChatMessages
                  key={`${collectionName}/${selectedThread.id}`}
                  path={`${collectionName}/${selectedThread.id}/messages`}
                  testId="admin-inbox-chat"
                />
              </div>

              {canManage && (
                <form onSubmit={sendReply} className="border-t border-white/10 p-3 bg-[#1A1A1A] space-y-2" data-testid="admin-inbox-reply-form">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    maxLength={4000}
                    placeholder="Répondre au demandeur — la réponse part dans la conversation et notifie la personne…"
                    className={inputCls}
                    data-testid="admin-inbox-reply-input"
                  />
                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={sending || !replyText.trim()} data-testid="admin-inbox-reply-send"
                      className="inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-5 py-2.5 disabled:opacity-40">
                      <Check size={13} /> {sending ? "Envoi…" : "Envoyer"}
                    </button>
                    <span className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
                      {replyText.length}/4000
                    </span>
                    <button type="button" onClick={() => setReplyText("")} className="ml-auto text-[10px] uppercase tracking-widest text-[#c8c8c8] hover:text-[#f7f7f7]">
                      Effacer
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
