import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Copy, FolderOpen, Pencil, Search, Tag, Trash2, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES } from "../../lib/constants";
import { ImageUpload } from "../ImageUpload";
import { ConfirmAction } from "../ConfirmAction";
import { isHttpUrl, isImageValue } from "../../lib/validation";
import { ANALYTICS_EVENTS, trackEvent } from "../../lib/analytics";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = {
  type: "photo", title: "", url: "", thumbnail: "", game: "EVA",
  playerTag: "", event: "", folder: "", tags: "", matchId: "", articleId: "",
};

const parseTags = (value) =>
  String(value || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

const tagsToInput = (item) => (Array.isArray(item?.tags) ? item.tags.join(", ") : item?.tags || "");

export const AdminMedia = () => {
  const { t, lang } = useLang();
  const [media, setMedia] = useState([]);
  const [matches, setMatches] = useState([]);
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "media"), (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setMedia(list);
      }, console.error),
      onSnapshot(collection(db, "matches"), (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
        setMatches(list.slice(0, 300));
      }, () => setMatches([])),
      onSnapshot(collection(db, "articles"), (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
        setArticles(list.slice(0, 300));
      }, () => setArticles([])),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const folders = useMemo(
    () => [...new Set(media.map((m) => (m.folder || "").trim()).filter(Boolean))].sort(),
    [media],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return media.filter((m) => {
      if (folderFilter !== "all" && (m.folder || "") !== folderFilter) return false;
      if (!q) return true;
      return [m.title, m.folder, m.game, m.playerTag, m.event, ...(Array.isArray(m.tags) ? m.tags : [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [media, query, folderFilter]);

  const submit = async (e) => {
    e.preventDefault();
    // Photo : image téléversée (data URL base64) ou URL externe. Vidéo : URL externe obligatoire.
    const urlOk = form.type === "photo" ? isImageValue(form.url) : isHttpUrl(form.url);
    if (!urlOk) { toast.error(t("admin.match.invalidUrl")); return; }
    if (form.thumbnail && !isImageValue(form.thumbnail)) { toast.error(t("admin.match.invalidUrl")); return; }
    const payload = {
      type: form.type,
      title: form.title.trim(),
      url: form.url,
      thumbnail: form.thumbnail,
      game: form.game,
      playerTag: form.playerTag.trim(),
      event: form.event.trim(),
      folder: form.folder.trim(),
      tags: parseTags(form.tags),
      matchId: form.matchId || "",
      articleId: form.articleId || "",
    };
    try {
      if (editId) {
        await updateDoc(doc(db, "media", editId), { ...payload, updatedAt: serverTimestamp() });
        toast.success(t("common.saved"));
      } else {
        await addDoc(collection(db, "media"), { ...payload, createdAt: serverTimestamp() });
        toast.success(t("common.saved"));
      }
      setForm(EMPTY);
      setEditId(null);
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const startEdit = (item) => {
    setEditId(item.id);
    setForm({
      type: item.type || "photo",
      title: item.title || "",
      url: item.url || "",
      thumbnail: item.thumbnail || "",
      game: item.game || "EVA",
      playerTag: item.playerTag || "",
      event: item.event || "",
      folder: item.folder || "",
      tags: tagsToInput(item),
      matchId: item.matchId || "",
      articleId: item.articleId || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => { setEditId(null); setForm(EMPTY); };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "media", id)); } catch { toast.error(t("common.error")); }
  };

  const copyLink = async (item) => {
    const url = item.url?.startsWith("data:") ? `${window.location.origin}/medias` : item.url;
    try {
      await navigator.clipboard.writeText(url);
      trackEvent(ANALYTICS_EVENTS.SHARE, { channel: "copy", source: "admin_media" });
      toast.success(t("playerpage.copied"));
    } catch {
      toast.error(url);
    }
  };

  const linkedMatch = (id) => matches.find((m) => m.id === id);
  const linkedArticle = (id) => articles.find((a) => a.id === id);

  return (
    <div className="grid lg:grid-cols-12 gap-10" data-testid="admin-media">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6 self-start" data-testid="admin-media-form">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">
            {editId ? t("common.edit") || "Modifier" : t("admin.media.add")}
          </p>
          {editId && (
            <button type="button" onClick={cancelEdit} className="text-[#c8c8c8] hover:text-[#f7f7f7]" aria-label={t("common.cancel")}>
              <X size={16} />
            </button>
          )}
        </div>
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
          <input value={form.url} onChange={set("url")} placeholder={t("admin.media.videoUrl")} required className={inputCls} data-testid="admin-media-url" />
        )}
        {form.type === "video" && (
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.media.thumbnailPlaceholder")}</label>
            <ImageUpload value={form.thumbnail} onChange={(url) => setForm((f) => ({ ...f, thumbnail: url }))} folder="media" maxWidth={800} testId="admin-media-thumbnail-upload" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <input value={form.playerTag} onChange={set("playerTag")} placeholder={t("admin.media.playerPlaceholder")} className={inputCls} data-testid="admin-media-player" />
          <input value={form.event} onChange={set("event")} placeholder={t("admin.media.eventPlaceholder")} className={inputCls} data-testid="admin-media-event" />
        </div>

        {/* Dossiers, tags et rattachement — nouvelle médiathèque */}
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">
              <FolderOpen size={11} className="inline mr-1" /> Dossier
            </span>
            <input value={form.folder} onChange={set("folder")} list="media-folders" placeholder="matchs-2026"
              className={inputCls} maxLength={60} data-testid="admin-media-folder" />
            <datalist id="media-folders">
              {folders.map((f) => <option key={f} value={f} />)}
            </datalist>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">
              <Tag size={11} className="inline mr-1" /> Tags
            </span>
            <input value={form.tags} onChange={set("tags")} placeholder="mvp, rl, final"
              className={inputCls} data-testid="admin-media-tags" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">Match lié</span>
            <select value={form.matchId} onChange={set("matchId")} className={inputCls} data-testid="admin-media-match">
              <option value="">—</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>{m.date || ""} · {m.opponentName || m.id}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">Article lié</span>
            <select value={form.articleId} onChange={set("articleId")} className={inputCls} data-testid="admin-media-article">
              <option value="">—</option>
              {articles.map((a) => <option key={a.id} value={a.id}>{a.title || a.id}</option>)}
            </select>
          </label>
        </div>

        <button type="submit" data-testid="admin-media-submit"
          className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
          {editId ? t("common.save") : t("notes.save")}
        </button>
      </form>

      <div className="lg:col-span-7" data-testid="admin-media-list">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <label className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c8c8c8]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (titre, tag, dossier, événement)…"
              className={`${inputCls} pl-9`} data-testid="admin-media-search" />
          </label>
          <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} className={`${inputCls} sm:w-56`}
            aria-label="Dossier" data-testid="admin-media-folder-filter">
            <option value="all">Tous les dossiers</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <span className="text-xs text-[#c8c8c8] self-center">{filtered.length} / {media.length}</span>
        </div>

        <div className="space-y-2">
          {media.length === 0 && <p className="text-[#c8c8c8]">{t("media.empty")}</p>}
          {media.length > 0 && filtered.length === 0 && <p className="text-[#c8c8c8]">Aucun média pour ces filtres.</p>}
          {filtered.map((m) => {
            const match = m.matchId ? linkedMatch(m.matchId) : null;
            const article = m.articleId ? linkedArticle(m.articleId) : null;
            return (
              <div key={m.id} className="flex items-start gap-3 border border-white/10 bg-[#1A1A1A] px-4 py-3" data-testid={`admin-media-item-${m.id}`}>
                <span className="text-xs uppercase tracking-widest border border-[#D8CA82]/40 text-[#D8CA82] px-1.5 py-0.5 shrink-0">{t(`media.type.${m.type}`)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#f7f7f7] truncate">{m.title}</p>
                  <p className="text-xs text-[#c8c8c8] truncate">
                    {m.game}{m.playerTag ? ` · ${m.playerTag}` : ""}{m.event ? ` · ${m.event}` : ""}
                    {m.folder ? ` · 📁 ${m.folder}` : ""}
                  </p>
                  {(m.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {m.tags.map((tag) => (
                        <span key={tag} className="text-[10px] uppercase tracking-widest border border-white/15 text-[#c8c8c8] px-1.5 py-0.5">#{tag}</span>
                      ))}
                    </div>
                  )}
                  {(match || article) && (
                    <div className="flex flex-wrap gap-3 mt-1 text-[11px]">
                      {match && (
                        <a href={`/resultats/${match.id}`} target="_blank" rel="noopener noreferrer" className="text-[#D8CA82] hover:underline">
                          Match : {match.opponentName || match.id}
                        </a>
                      )}
                      {article && (
                        <a href={`/actus/${article.id}`} target="_blank" rel="noopener noreferrer" className="text-[#D8CA82] hover:underline">
                          Article : {article.title || article.id}
                        </a>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => copyLink(m)} title={lang === "en" ? "Copy link" : "Copier le lien"}
                    aria-label={`${lang === "en" ? "Copy link" : "Copier le lien"} ${m.title}`} className="text-[#c8c8c8] hover:text-[#D8CA82]">
                    <Copy size={14} />
                  </button>
                  <button type="button" onClick={() => startEdit(m)} title={t("common.edit") || "Modifier"}
                    aria-label={`${t("common.edit") || "Modifier"} ${m.title}`} className="text-[#c8c8c8] hover:text-[#D8CA82]"
                    data-testid={`admin-media-edit-${m.id}`}>
                    <Pencil size={14} />
                  </button>
                  <ConfirmAction
                    title={t("admin.media.deleteTitle")}
                    description={t("admin.media.deleteDesc")}
                    confirmLabel={t("common.delete")}
                    onConfirm={() => del(m.id)}
                  >
                    <button className="text-red-400/70 hover:text-red-400" title={t("common.delete")} aria-label={`${t("common.delete")} ${m.title}`} data-testid={`admin-media-delete-${m.id}`}><Trash2 size={15} /></button>
                  </ConfirmAction>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
