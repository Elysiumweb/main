import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { Megaphone, Pencil, Power, Send, Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { createNotification, logAdminAction } from "../../lib/notify";
import { GAMES, ROLES } from "../../lib/constants";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const LEVELS = ["info", "success", "warning", "critical"];
const EMPTY = {
  title: "",
  message: "",
  level: "info",
  link: "",
  linkLabel: "En savoir plus",
  active: true,
  pinned: false,
  dismissible: true,
  targetRoles: [],
  targetGames: [],
  startsAt: "",
  endsAt: "",
};

const toDateInput = (value) => {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? Timestamp.fromDate(date) : null;
};

const fmtDate = (value, lang) => {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(lang === "en" ? "en-US" : "fr-FR", { dateStyle: "short", timeStyle: "short" })
    : "—";
};

const isLive = (item, now = Date.now()) => {
  if (!item || item.active === false) return false;
  const start = item.startsAt?.toDate ? item.startsAt.toDate().getTime() : null;
  const end = item.endsAt?.toDate ? item.endsAt.toDate().getTime() : null;
  if (start && start > now) return false;
  if (end && end < now) return false;
  return true;
};

export const AdminAnnouncements = () => {
  const { user, displayName, can } = useAuth();
  const { t, lang } = useLang();
  const canManage = can("announcements.manage");
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    return onSnapshot(
      collection(db, "announcements"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setItems(list);
      },
      (err) => console.error("announcements", err),
    );
  }, []);

  const stats = useMemo(() => ({
    total: items.length,
    live: items.filter((item) => isLive(item)).length,
    scheduled: items.filter((item) => {
      const start = item.startsAt?.toDate ? item.startsAt.toDate().getTime() : null;
      return item.active !== false && start && start > Date.now();
    }).length,
  }), [items]);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const toggleIn = (key, value) => setForm((prev) => ({
    ...prev,
    [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value],
  }));

  const reset = () => { setEditId(null); setForm(EMPTY); };

  const save = async (notify) => {
    if (!canManage) return;
    if (!form.title.trim() || !form.message.trim()) {
      toast.error("Titre et message sont obligatoires.");
      return;
    }
    if (form.link && !/^\//.test(form.link) && !/^https?:\/\//.test(form.link)) {
      toast.error("Le lien doit commencer par / ou https://");
      return;
    }
    const payload = {
      title: form.title.trim().slice(0, 120),
      message: form.message.trim().slice(0, 500),
      level: LEVELS.includes(form.level) ? form.level : "info",
      link: form.link.trim().slice(0, 300),
      linkLabel: form.linkLabel.trim().slice(0, 60),
      active: !!form.active,
      pinned: !!form.pinned,
      dismissible: !!form.dismissible,
      targetRoles: form.targetRoles,
      targetGames: form.targetGames,
      startsAt: toTimestamp(form.startsAt),
      endsAt: toTimestamp(form.endsAt),
      updatedAt: serverTimestamp(),
    };
    try {
      let id = editId;
      if (editId) await updateDoc(doc(db, "announcements", editId), payload);
      else {
        const ref = await addDoc(collection(db, "announcements"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || null,
          createdByName: displayName || "",
        });
        id = ref.id;
      }

      if (notify) {
        setSending(true);
        const roles = payload.targetRoles.length ? payload.targetRoles : [null];
        const games = payload.targetGames.length ? payload.targetGames : [null];
        const jobs = [];
        roles.forEach((role) => {
          games.forEach((game) => {
            jobs.push(createNotification({
              targetRoles: role ? [role] : null,
              targetGame: game,
              type: "announcement",
              extra: payload.title,
              message: payload.message,
              link: payload.link || "/",
            }));
          });
        });
        await Promise.all(jobs);
        await updateDoc(doc(db, "announcements", id), { notificationSentAt: serverTimestamp() });
        setSending(false);
        toast.success(`Annonce publiée et notification envoyée (${jobs.length} ciblage(s))`);
      } else {
        toast.success(t("common.saved"));
      }

      await logAdminAction({
        action: notify ? "announcement_broadcast" : "announcement_saved",
        label: payload.title,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "announcements", id },
        details: { roles: payload.targetRoles, games: payload.targetGames, notify },
      });
      reset();
    } catch (err) {
      console.error(err);
      setSending(false);
      toast.error(t("common.error"));
    }
  };

  const edit = (item) => {
    setEditId(item.id);
    setForm({
      title: item.title || "",
      message: item.message || "",
      level: item.level || "info",
      link: item.link || "",
      linkLabel: item.linkLabel || "En savoir plus",
      active: item.active !== false,
      pinned: !!item.pinned,
      dismissible: item.dismissible !== false,
      targetRoles: item.targetRoles || [],
      targetGames: item.targetGames || [],
      startsAt: toDateInput(item.startsAt),
      endsAt: toDateInput(item.endsAt),
    });
  };

  const toggleActive = async (item) => {
    try {
      await updateDoc(doc(db, "announcements", item.id), { active: item.active === false, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const remove = async (item) => {
    try {
      await deleteDoc(doc(db, "announcements", item.id));
      await logAdminAction({
        action: "announcement_deleted",
        label: item.title,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "announcements", id: item.id },
      });
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-8" data-testid="admin-announcements">
      <div className="lg:col-span-6 space-y-4 border border-white/10 bg-[#1A1A1A] p-6">
        <div className="flex items-center gap-3">
          <Megaphone className="text-[#D8CA82]" size={18} />
          <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">
            {editId ? "Modifier l'annonce" : "Nouvelle annonce"}
          </p>
        </div>
        <p className="text-xs text-[#c8c8c8]">
          Publie une bannière sur le site et/ou une notification ciblée (rôle et jeu). Le ciblage vide = tout le monde.
        </p>

        <input value={form.title} onChange={set("title")} placeholder="Titre (120 caractères max)" maxLength={120} className={inputCls} data-testid="admin-announcement-title" />
        <textarea value={form.message} onChange={set("message")} rows={3} maxLength={500} placeholder="Message affiché dans la bannière" className={inputCls} data-testid="admin-announcement-message" />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
            Niveau
            <select value={form.level} onChange={set("level")} className={`${inputCls} mt-1`} data-testid="admin-announcement-level">
              {LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
            Début (optionnel)
            <input type="datetime-local" value={form.startsAt} onChange={set("startsAt")} className={`${inputCls} mt-1`} data-testid="admin-announcement-start" />
          </label>
        </div>
        <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8] block">
          Fin (optionnel)
          <input type="datetime-local" value={form.endsAt} onChange={set("endsAt")} className={`${inputCls} mt-1`} data-testid="admin-announcement-end" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <input value={form.link} onChange={set("link")} placeholder="/recrutement ou https://…" className={inputCls} data-testid="admin-announcement-link" />
          <input value={form.linkLabel} onChange={set("linkLabel")} placeholder="Libellé du lien" className={inputCls} data-testid="admin-announcement-link-label" />
        </div>

        <fieldset>
          <legend className="text-[10px] uppercase tracking-widest text-[#c8c8c8] mb-2">Cibler un rôle</legend>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => (
              <label key={role} className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] uppercase tracking-widest cursor-pointer ${form.targetRoles.includes(role) ? "border-[#D8CA82] text-[#D8CA82]" : "border-white/15 text-[#c8c8c8]"}`}>
                <input type="checkbox" checked={form.targetRoles.includes(role)} onChange={() => toggleIn("targetRoles", role)} className="accent-[#D8CA82] h-3 w-3" />
                {t(`admin.role.${role}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[10px] uppercase tracking-widest text-[#c8c8c8] mb-2">Cibler un jeu</legend>
          <div className="flex flex-wrap gap-2">
            {GAMES.map((game) => (
              <label key={game} className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] uppercase tracking-widest cursor-pointer ${form.targetGames.includes(game) ? "border-[#D8CA82] text-[#D8CA82]" : "border-white/15 text-[#c8c8c8]"}`}>
                <input type="checkbox" checked={form.targetGames.includes(game)} onChange={() => toggleIn("targetGames", game)} className="accent-[#D8CA82] h-3 w-3" />
                {game}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4 text-xs text-[#f7f7f7]/70">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="accent-[#D8CA82]" data-testid="admin-announcement-active" />
            Active
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} className="accent-[#D8CA82]" />
            Épinglée
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.dismissible} onChange={(e) => setForm((f) => ({ ...f, dismissible: e.target.checked }))} className="accent-[#D8CA82]" />
            Fermable
          </label>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button onClick={() => save(true)} disabled={!canManage || sending} data-testid="admin-announcement-broadcast"
            className="inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-3 disabled:opacity-40">
            <Send size={13} /> {sending ? "Envoi…" : "Publier + notifier"}
          </button>
          <button onClick={() => save(false)} disabled={!canManage || sending} data-testid="admin-announcement-save"
            className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-5 py-3 hover:border-[#D8CA82] hover:text-[#D8CA82] disabled:opacity-40">
            Enregistrer sans notifier
          </button>
          {editId && <button onClick={reset} className="text-xs uppercase tracking-widest text-[#c8c8c8]">{t("common.cancel")}</button>}
        </div>
      </div>

      <div className="lg:col-span-6 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Annonces", value: stats.total },
            { label: "En ligne", value: stats.live },
            { label: "Programmées", value: stats.scheduled },
          ].map((card) => (
            <div key={card.label} className="border border-white/10 bg-[#141414] p-3 text-center">
              <p className="font-display text-2xl text-[#D8CA82]">{card.value}</p>
              <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">{card.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2" data-testid="admin-announcements-list">
          {items.length === 0 && <p className="text-sm text-[#c8c8c8]">Aucune annonce pour le moment.</p>}
          {items.map((item) => (
            <div key={item.id} className="border border-white/10 bg-[#1A1A1A] p-4 space-y-2" data-testid={`admin-announcement-${item.id}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${isLive(item) ? "text-emerald-300 border-emerald-300/40" : "text-[#c8c8c8] border-white/20"}`}>
                  {isLive(item) ? "En ligne" : item.active === false ? "Inactive" : "Programmée / terminée"}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">{item.level || "info"}</span>
                {item.notificationSentAt && <span className="text-[10px] uppercase tracking-widest text-[#D8CA82]">notifiée</span>}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => toggleActive(item)} title="Activer / désactiver" className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-announcement-toggle-${item.id}`}>
                    <Power size={14} />
                  </button>
                  <button onClick={() => edit(item)} title="Modifier" className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-announcement-edit-${item.id}`}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => remove(item)} title="Supprimer" className="text-red-400/70 hover:text-red-400" data-testid={`admin-announcement-delete-${item.id}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="font-display text-sm text-[#f7f7f7]">{item.title}</p>
              <p className="text-sm text-[#c8c8c8] whitespace-pre-wrap">{item.message}</p>
              <p className="text-[11px] text-[#c8c8c8]/60">
                {item.targetRoles?.length ? `Rôles : ${item.targetRoles.join(", ")}` : "Tous les rôles"}
                {" · "}
                {item.targetGames?.length ? `Jeux : ${item.targetGames.join(", ")}` : "Tous les jeux"}
                {" · "}{fmtDate(item.createdAt, lang)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
