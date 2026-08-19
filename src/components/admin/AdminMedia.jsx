import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES } from "../../lib/constants";
import { ImageUpload } from "../ImageUpload";
import { ConfirmAction } from "../ConfirmAction";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { type: "photo", title: "", caption: "", url: "", thumbnail: "", game: "EVA", playerTag: "", event: "", album: "", author: "", credit: "", capturedAt: "", usageRights: "share-download", relatedType: "", relatedId: "" };
const isUrl = (s) => /^https?:\/\/.+/.test(s);

const automaticThumbnail = (url) => {
  try {
    const parsed = new URL(url);
    const youtubeId = parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
    return youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : "";
  } catch { return ""; }
};

export const AdminMedia = () => {
  const { t } = useLang();
  const [media, setMedia] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => onSnapshot(collection(db, "media"), (snapshot) => {
    const list = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setMedia(list);
  }, console.error), []);

  const submit = async (event) => {
    event.preventDefault();
    if (!isUrl(form.url) || (form.thumbnail && !isUrl(form.thumbnail))) { toast.error(t("admin.match.invalidUrl")); return; }
    try {
      const thumbnail = form.type === "video" ? (form.thumbnail || automaticThumbnail(form.url)) : (form.thumbnail || form.url);
      await addDoc(collection(db, "media"), { ...form, thumbnail, createdAt: serverTimestamp() });
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
          <select value={form.type} onChange={set("type")} className={inputCls} data-testid="admin-media-type"><option value="photo">Photo</option><option value="video">Vidéo</option></select>
          <select value={form.game} onChange={set("game")} className={inputCls}>{GAMES.map((game) => <option key={game}>{game}</option>)}</select>
        </div>
        <input value={form.title} onChange={set("title")} placeholder="Titre" required className={inputCls} data-testid="admin-media-title" />
        <textarea value={form.caption} onChange={set("caption")} placeholder="Légende éditoriale" rows={3} className={inputCls} />
        {form.type === "photo" ? <ImageUpload value={form.url} onChange={(url) => setForm((current) => ({ ...current, url }))} folder="media" maxWidth={2000} testId="admin-media-upload" /> : <input value={form.url} onChange={set("url")} placeholder="URL YouTube / Twitch" required className={inputCls} />}
        {form.type === "video" && <input value={form.thumbnail} onChange={set("thumbnail")} placeholder="Miniature (automatique pour YouTube)" className={inputCls} />}
        <div className="grid grid-cols-2 gap-4">
          <input value={form.album} onChange={set("album")} placeholder="Album" className={inputCls} />
          <input value={form.event} onChange={set("event")} placeholder="Événement" className={inputCls} />
          <input value={form.author} onChange={set("author")} placeholder="Auteur" className={inputCls} />
          <input value={form.credit} onChange={set("credit")} placeholder="Crédit photo/vidéo" className={inputCls} />
          <input value={form.capturedAt} onChange={set("capturedAt")} type="date" aria-label="Date de prise de vue" className={inputCls} />
          <select value={form.usageRights} onChange={set("usageRights")} className={inputCls} aria-label="Droits d’utilisation">
            <option value="share-download">Partage et téléchargement autorisés</option>
            <option value="share">Partage autorisé, téléchargement interdit</option>
            <option value="editorial">Usage éditorial uniquement</option>
            <option value="restricted">Tous droits réservés</option>
          </select>
          <input value={form.playerTag} onChange={set("playerTag")} placeholder="Joueur" className={inputCls} />
          <select value={form.relatedType} onChange={set("relatedType")} className={inputCls} aria-label="Type de lien associé"><option value="">Aucun lien</option><option value="player">Joueur</option><option value="match">Match</option><option value="article">Article</option></select>
        </div>
        {form.relatedType && <input value={form.relatedId} onChange={set("relatedId")} placeholder="Identifiant du joueur, match ou article" className={inputCls} />}
        <button type="submit" data-testid="admin-media-submit" className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3">Publier</button>
      </form>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-media-list">
        {media.length === 0 && <p className="text-[#f7f7f7]/40">{t("media.empty")}</p>}
        {media.map((item) => <div key={item.id} className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3">
          {item.thumbnail && <img src={item.thumbnail} alt="" className="w-16 h-10 object-cover" />}
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-[#f7f7f7] truncate">{item.title}</p><p className="text-xs text-[#f7f7f7]/40 truncate">{item.album || "Sans album"}{item.credit ? ` · © ${item.credit}` : ""}</p></div>
          <ConfirmAction title={t("admin.media.deleteTitle")} description={t("admin.media.deleteDesc")} confirmLabel={t("common.delete")} onConfirm={() => del(item.id)}><button className="text-red-400/70 hover:text-red-400" aria-label={`Supprimer ${item.title}`}><Trash2 size={15} /></button></ConfirmAction>
        </div>)}
      </div>
    </div>
  );
};
