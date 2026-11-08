import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Bell, Megaphone, Plus, Send, Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_LEVELS, useAdminT } from "../../lib/adminI18n";
import { GAMES } from "../../lib/constants";
import { createNotification } from "../../lib/notify";
import { ConfirmAction } from "../ConfirmAction";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

const LEVEL_CLS = {
  info: "border-[#D8CA82]/40 text-[#D8CA82]",
  success: "border-emerald-400/40 text-emerald-300",
  warning: "border-amber-400/40 text-amber-300",
  critical: "border-red-400/50 text-red-300",
};

const AUDIENCE_ROLES = {
  all: ["visitor", "player", "manager", "bureau"],
  visitor: ["visitor"],
  player: ["player"],
  manager: ["manager"],
  bureau: ["bureau"],
};

const EMPTY = {
  title: "",
  body: "",
  level: "info",
  link: "",
  audience: "all",
  targetGame: "all",
  expiresAt: "",
  active: true,
  banner: true,
  notify: true,
};

const isValidLink = (value) => !value || /^https?:\/\//.test(value) || value.startsWith("/");

export const AdminAnnouncements = () => {
  const { user, displayName } = useAuth();
  const { t, lang } = useLang();
  const tx = useAdminT();
  const [form, setForm] = useState(EMPTY);
  const [items, setItems] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, "announcements"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setItems(list);
    }, console.error);
  }, []);

  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const title = form.title.trim();
    const body = form.body.trim();
    if (title.length < 3 || title.length > 120) { toast.error(tx("ann.validation.title")); return; }
    if (body.length < 3 || body.length > 600) { toast.error(tx("ann.validation.body")); return; }
    if (!isValidLink(form.link.trim())) { toast.error(tx("ann.validation.link")); return; }
    setSending(true);
    try {
      await addDoc(collection(db, "announcements"), {
        title,
        body,
        level: form.level,
        link: form.link.trim(),
        audience: form.audience,
        targetGame: form.targetGame === "all" ? "all" : form.targetGame,
        explicit: form.audience !== "all",
        expiresAt: form.expiresAt || "",
        active: form.active === true,
        banner: form.banner === true,
        createdBy: user?.uid || null,
        createdByName: displayName || "",
        createdAt: serverTimestamp(),
      });
      if (form.notify) {
        await createNotification({
          targetRoles: AUDIENCE_ROLES[form.audience] || AUDIENCE_ROLES.all,
          targetGame: form.targetGame === "all" ? null : form.targetGame,
          type: "announcement",
          extra: title,
          link: form.link.trim() || "/",
        });
      }
      setForm(EMPTY);
      toast.success(tx("ann.saved"));
    } catch (err) {
      console.error("announcement", err);
      toast.error(t("common.error"));
    }
    setSending(false);
  };

  const toggleActive = async (item) => {
    try {
      await updateDoc(doc(db, "announcements", item.id), { active: !item.active });
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const remove = async (id) => {
    try {
      await deleteDoc(doc(db, "announcements", id));
      toast.success(tx("ann.deleted"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const statusOf = (item) => {
    if (item.expiresAt && Date.parse(item.expiresAt) < Date.now()) return "expired";
    if (item.startsAt && Date.parse(item.startsAt) > Date.now()) return "scheduled";
    return item.active ? "active" : "inactive";
  };

  const formatDate = (value) => {
    if (!value) return "";
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) return "";
    return new Date(ms).toLocaleString(lang === "en" ? "en-US" : "fr-FR", { dateStyle: "short", timeStyle: "short" });
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10" data-testid="admin-announcements">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6 self-start" data-testid="admin-announcements-form">
        <div className="flex items-center gap-3">
          <Megaphone size={18} className="text-[#D8CA82]" />
          <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{tx("ann.new")}</p>
        </div>
        <div>
          <label htmlFor="ann-title" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{tx("ann.field.title")}</label>
          <input id="ann-title" value={form.title} onChange={set("title")} required maxLength={120}
            className={inputCls} data-testid="admin-announcement-title" />
        </div>
        <div>
          <label htmlFor="ann-body" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{tx("ann.field.body")}</label>
          <textarea id="ann-body" value={form.body} onChange={set("body")} rows={4} required maxLength={600}
            className={inputCls} data-testid="admin-announcement-body" />
          <p className="text-xs text-[#c8c8c8]/60 mt-1">{form.body.length}/600</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ann-level" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{tx("ann.field.level")}</label>
            <select id="ann-level" value={form.level} onChange={set("level")} className={inputCls} data-testid="admin-announcement-level">
              {ANNOUNCEMENT_LEVELS.map((l) => <option key={l} value={l}>{tx(`ann.level.${l}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ann-audience" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{tx("ann.field.audience")}</label>
            <select id="ann-audience" value={form.audience} onChange={set("audience")} className={inputCls} data-testid="admin-announcement-audience">
              {ANNOUNCEMENT_AUDIENCES.map((a) => <option key={a} value={a}>{tx(`ann.audience.${a}`)}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ann-game" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{tx("ann.field.game")}</label>
            <select id="ann-game" value={form.targetGame} onChange={set("targetGame")} className={inputCls} data-testid="admin-announcement-game">
              <option value="all">{tx("ann.game.all")}</option>
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ann-expires" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{tx("ann.field.expiresAt")}</label>
            <input id="ann-expires" type="datetime-local" value={form.expiresAt} onChange={set("expiresAt")}
              className={inputCls} data-testid="admin-announcement-expires" />
          </div>
        </div>
        <div>
          <label htmlFor="ann-link" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{tx("ann.field.link")}</label>
          <input id="ann-link" value={form.link} onChange={set("link")} placeholder="/recrutement"
            className={inputCls} data-testid="admin-announcement-link" />
        </div>
        <label className="flex items-center gap-2 text-sm text-[#c8c8c8]">
          <input type="checkbox" checked={form.banner} onChange={set("banner")} data-testid="admin-announcement-banner" />
          {tx("ann.field.banner")}
        </label>
        <label className="flex items-center gap-2 text-sm text-[#c8c8c8]">
          <input type="checkbox" checked={form.notify} onChange={set("notify")} data-testid="admin-announcement-notify" />
          {tx("ann.field.notify")}
        </label>
        <label className="flex items-center gap-2 text-sm text-[#c8c8c8]">
          <input type="checkbox" checked={form.active} onChange={set("active")} data-testid="admin-announcement-active" />
          {tx("ann.field.active")}
        </label>
        <button type="submit" disabled={sending} data-testid="admin-announcement-submit"
          className="inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow disabled:opacity-60">
          <Send size={14} /> {tx("ann.publish")}
        </button>
      </form>

      <div className="lg:col-span-7" data-testid="admin-announcements-list">
        <div className="flex items-center gap-3 mb-4">
          <Bell size={16} className="text-[#D8CA82]" />
          <p className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{tx("ann.list")}</p>
        </div>
        {items.length === 0 && <p className="text-sm text-[#c8c8c8]">{tx("ann.empty")}</p>}
        <div className="space-y-3">
          {items.map((item) => {
            const status = statusOf(item);
            return (
              <div key={item.id} className="border border-white/10 bg-[#1A1A1A] p-4" data-testid={`admin-announcement-${item.id}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#f7f7f7]">{item.title}</p>
                      <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${LEVEL_CLS[item.level] || LEVEL_CLS.info}`}>
                        {tx(`ann.level.${item.level || "info"}`)}
                      </span>
                      <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${
                        status === "active" ? "border-emerald-400/40 text-emerald-300"
                          : status === "expired" ? "border-red-400/40 text-red-300"
                            : "border-white/20 text-[#c8c8c8]"
                      }`}>{tx(`ann.status.${status}`)}</span>
                    </div>
                    <p className="text-sm text-[#c8c8c8] mt-1 whitespace-pre-wrap">{item.body}</p>
                    <p className="text-xs text-[#c8c8c8]/60 mt-2">
                      {tx(`ann.audience.${item.audience || "all"}`)}
                      {item.targetGame && item.targetGame !== "all" ? ` · ${item.targetGame}` : ""}
                      {item.expiresAt ? ` · ${tx("ann.field.expiresAt")} ${formatDate(item.expiresAt)}` : ""}
                      {item.createdByName ? ` · ${item.createdByName}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button type="button" onClick={() => toggleActive(item)} data-testid={`admin-announcement-toggle-${item.id}`}
                      className={`text-[10px] uppercase tracking-widest border px-2 py-1 ${item.active ? "border-[#D8CA82]/50 text-[#D8CA82]" : "border-white/20 text-[#c8c8c8] hover:text-[#f7f7f7]"}`}>
                      {item.active ? tx("ann.status.active") : tx("ann.status.inactive")}
                    </button>
                    <ConfirmAction title={tx("ann.confirmTitle")} description={tx("ann.confirmDesc")}
                      confirmLabel={t("common.delete")} onConfirm={() => remove(item.id)}>
                      <button type="button" className="text-red-400/70 hover:text-red-400" aria-label={`${tx("ann.delete")} ${item.title}`}
                        data-testid={`admin-announcement-delete-${item.id}`}>
                        <Trash2 size={15} />
                      </button>
                    </ConfirmAction>
                  </div>
                </div>
                {item.link && (
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#D8CA82] hover:underline mt-2">
                    <Plus size={11} /> {item.link}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
