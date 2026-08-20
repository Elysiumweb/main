import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES } from "../../lib/constants";
import { ImageUpload } from "../ImageUpload";
import { ConfirmAction } from "../ConfirmAction";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { type: "photo", title: "", url: "", thumbnail: "", game: "EVA", playerTag: "", event: "" };
const isUrl = (s) => /^https?:\/\/.+/.test(s);

export const AdminMedia = () => {
  const { t } = useLang();
  const [media, setMedia] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "media"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMedia(list);
    }, console.error);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!isUrl(form.url)) { toast.error(t("admin.match.invalidUrl")); return; }
    if (form.thumbnail && !isUrl(form.thumbnail)) { toast.error(t("admin.match.invalidUrl")); return; }
    try {
      await addDoc(collection(db, "media"), { ...form, createdAt: serverTimestamp() });
      setForm(EMPTY);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "media", id)); } catch { toast.error(t("common.error")); }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-media-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{t("admin.media.add")}</p>
        <div className="grid grid-cols-2 gap-4">
          <select value={form.type} onChange={set("type")} className={inputCls} data-testid="admin-media-type">
            <option value="photo">{t("media.type.photo")}</option>
            <option value="video">{t("media.type.video")}</option>
          </select>
          <select value={form.game} onChange={set("game")} className={inputCls} data-testid="admin-media-game">
            {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <input value={form.title} onChange={set("title")} placeholder={t("admin.events.titlePlaceholder")} required className={inputCls} data-testid="admin-media-title" />
        {form.type === "photo" ? (
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.media.photoUpload")}</label>
            <ImageUpload value={form.url} onChange={(url) => setForm((f) => ({ ...f, url }))} folder="media" maxWidth={2000} testId="admin-media-upload" />
          </div>
        ) : (
          <>
            <input value={form.url} onChange={set("url")} placeholder={t("admin.media.videoUrl")} required className={inputCls} data-testid="admin-media-url" />
          </>
        )}
        {form.type === "video" && (
          <input value={form.thumbnail} onChange={set("thumbnail")} placeholder={t("admin.media.thumbnailPlaceholder")} className={inputCls} data-testid="admin-media-thumbnail" />
        )}
        <div className="grid grid-cols-2 gap-4">
          <input value={form.playerTag} onChange={set("playerTag")} placeholder={t("admin.media.playerPlaceholder")} className={inputCls} data-testid="admin-media-player" />
          <input value={form.event} onChange={set("event")} placeholder={t("admin.media.eventPlaceholder")} className={inputCls} data-testid="admin-media-event" />
        </div>
        <button type="submit" data-testid="admin-media-submit"
          className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
          {t("notes.save")}
        </button>
      </form>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-media-list">
        {media.length === 0 && <p className="text-[#c8c8c8]">{t("media.empty")}</p>}
        {media.map((m) => (
          <div key={m.id} className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3">
            <span className="text-xs uppercase tracking-widest border border-[#D8CA82]/40 text-[#D8CA82] px-1.5 py-0.5">{t(`media.type.${m.type}`)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate">{m.title}</p>
              <p className="text-xs text-[#c8c8c8] truncate">{m.game}{m.playerTag ? ` · ${m.playerTag}` : ""}{m.event ? ` · ${m.event}` : ""}</p>
            </div>
            <ConfirmAction
              title={t("admin.media.deleteTitle")}
              description={t("admin.media.deleteDesc")}
              confirmLabel={t("common.delete")}
              onConfirm={() => del(m.id)}
            >
              <button className="text-red-400/70 hover:text-red-400" title={t("common.delete")} aria-label={`${t("common.delete")} ${m.title}`} data-testid={`admin-media-delete-${m.id}`}><Trash2 size={15} /></button>
            </ConfirmAction>
          </div>
        ))}
      </div>
    </div>
  );
};
