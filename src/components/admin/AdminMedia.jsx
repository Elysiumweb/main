import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { FolderTree, Search, Tags, Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES } from "../../lib/constants";
import { ImageUpload } from "../ImageUpload";
import { ConfirmAction } from "../ConfirmAction";
import { useBulkSelection } from "../../hooks/useBulkSelection";
import { isHttpUrl, isImageValue } from "../../lib/validation";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = {
  type: "photo", title: "", url: "", thumbnail: "", game: "EVA",
  playerTag: "", event: "", folder: "", tags: "", matchId: "", articleId: "", alt: "",
};

const slug = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const parseTags = (value) => [...new Set(String(value || "")
  .split(",")
  .map((tag) => slug(tag.trim()))
  .filter(Boolean))].slice(0, 12);

export const AdminMedia = () => {
  const { t } = useLang();
  const [media, setMedia] = useState([]);
  const [matches, setMatches] = useState([]);
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [bulkFolder, setBulkFolder] = useState("");
  const [bulkTag, setBulkTag] = useState("");
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
        list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setMatches(list);
      }, () => {}),
      onSnapshot(collection(db, "articles"), (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.status !== "deleted");
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setArticles(list);
      }, () => {}),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, []);

  const folders = useMemo(
    () => [...new Set(media.map((m) => m.folder).filter(Boolean))].sort(),
    [media],
  );
  const allTags = useMemo(
    () => [...new Set(media.flatMap((m) => (Array.isArray(m.tags) ? m.tags : [])))].sort(),
    [media],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return media.filter((m) => {
      if (folderFilter !== "all" && (m.folder || "") !== folderFilter) return false;
      if (tagFilter !== "all" && !(m.tags || []).includes(tagFilter)) return false;
      if (!needle) return true;
      return [m.title, m.alt, m.folder, m.playerTag, m.event, m.game, m.matchId, m.articleId, ...(m.tags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [media, query, folderFilter, tagFilter]);

  const bulk = useBulkSelection(filtered);

  const submit = async (e) => {
    e.preventDefault();
    // Photo : image téléversée (data URL base64) ou URL externe. Vidéo : URL externe obligatoire.
    const urlOk = form.type === "photo" ? isImageValue(form.url) : isHttpUrl(form.url);
    if (!urlOk) { toast.error(t("admin.match.invalidUrl")); return; }
    if (form.thumbnail && !isImageValue(form.thumbnail)) { toast.error(t("admin.match.invalidUrl")); return; }
    try {
      await addDoc(collection(db, "media"), {
        ...form,
        folder: slug(form.folder),
        tags: parseTags(form.tags),
        matchId: form.matchId || null,
        articleId: form.articleId || null,
        alt: form.alt.trim().slice(0, 160),
        createdAt: serverTimestamp(),
      });
      setForm(EMPTY);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "media", id)); } catch { toast.error(t("common.error")); }
  };

  const applyBulk = async (patch, label) => {
    if (!bulk.count) return;
    try {
      await Promise.all(bulk.selected.map((id) => updateDoc(doc(db, "media", id), { ...patch, updatedAt: serverTimestamp() })));
      toast.success(`${bulk.count} média(s) — ${label}`);
      bulk.clear();
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const applyBulkFolder = () => {
    if (!bulkFolder.trim()) return;
    applyBulk({ folder: slug(bulkFolder) }, `dossier ${slug(bulkFolder)}`);
    setBulkFolder("");
  };

  const applyBulkTag = () => {
    const tag = slug(bulkTag);
    if (!tag) return;
    const targets = media.filter((m) => bulk.selectedSet.has(m.id));
    Promise.all(targets.map((m) => updateDoc(doc(db, "media", m.id), {
      tags: [...new Set([...(m.tags || []), tag])].slice(0, 12),
      updatedAt: serverTimestamp(),
    })))
      .then(() => { toast.success(`Tag « ${tag} » ajouté`); setBulkTag(""); bulk.clear(); })
      .catch(() => toast.error(t("common.error")));
  };

  const deleteBulk = async () => {
    if (!bulk.count) return;
    if (!window.confirm(`Supprimer définitivement ${bulk.count} média(s) ?`)) return;
    try {
      await Promise.all(bulk.selected.map((id) => deleteDoc(doc(db, "media", id))));
      toast.success(`${bulk.count} média(s) supprimé(s)`);
      bulk.clear();
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10" data-testid="admin-media">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-media-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{t("admin.media.add")}</p>
        <div className="grid grid-cols-2 gap-4">
          <select value={form.type} onChange={set("type")} className={inputCls} data-testid="admin-media-type" aria-label="Type de média">
            <option value="photo">{t("media.type.photo")}</option>
            <option value="video">{t("media.type.video")}</option>
          </select>
          <select value={form.game} onChange={set("game")} className={inputCls} data-testid="admin-media-game" aria-label="Jeu">
            {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <input value={form.title} onChange={set("title")} placeholder={t("admin.events.titlePlaceholder")} required className={inputCls} data-testid="admin-media-title" />
        {form.type === "photo" ? (
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.media.photoUpload")}</label>
            <ImageUpload value={form.url} onChange={(url) => setForm((f) => ({ ...f, url }))} folder={`media/${slug(form.folder) || "divers"}`} maxWidth={2000} testId="admin-media-upload" />
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

        <div className="border-t border-white/10 pt-3 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-[#D8CA82] inline-flex items-center gap-1"><FolderTree size={11} /> Organisation</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.folder} onChange={set("folder")} placeholder="Dossier (ex. matchs-rl)" list="admin-media-folders" className={inputCls} data-testid="admin-media-folder" />
            <input value={form.tags} onChange={set("tags")} placeholder="Tags, séparés par des virgules" className={inputCls} data-testid="admin-media-tags" />
          </div>
          <datalist id="admin-media-folders">
            {folders.map((folder) => <option key={folder} value={folder} />)}
          </datalist>
          <input value={form.alt} onChange={set("alt")} placeholder="Texte alternatif (accessibilité / SEO)" className={inputCls} data-testid="admin-media-alt" />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.matchId} onChange={set("matchId")} className={inputCls} data-testid="admin-media-match" aria-label="Lier à un match">
              <option value="">— Lier à un match —</option>
              {matches.slice(0, 200).map((match) => (
                <option key={match.id} value={match.id}>
                  {(match.date || "?")} · {match.opponentName || "Adversaire"} ({match.game || "—"})
                </option>
              ))}
            </select>
            <select value={form.articleId} onChange={set("articleId")} className={inputCls} data-testid="admin-media-article" aria-label="Lier à un article">
              <option value="">— Lier à un article —</option>
              {articles.slice(0, 200).map((article) => (
                <option key={article.id} value={article.id}>{article.title}</option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" data-testid="admin-media-submit"
          className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
          {t("notes.save")}
        </button>
      </form>

      <div className="lg:col-span-7 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c8c8c8]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (titre, tag, dossier, joueur, match, article…)"
              className={`${inputCls} pl-9`} data-testid="admin-media-search" />
          </label>
          <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} className={`${inputCls} sm:w-44`} data-testid="admin-media-folder-filter" aria-label="Filtrer par dossier">
            <option value="all">Tous les dossiers</option>
            {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={`${inputCls} sm:w-40`} data-testid="admin-media-tag-filter" aria-label="Filtrer par tag">
            <option value="all">Tous les tags</option>
            {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </div>

        {bulk.count > 0 && (
          <div className="flex flex-wrap items-center gap-2 border border-[#D8CA82]/40 bg-[#D8CA82]/5 px-3 py-2" data-testid="admin-media-bulk-bar">
            <span className="text-[10px] uppercase tracking-widest text-[#D8CA82]">{bulk.count} sélectionné(s)</span>
            <input value={bulkFolder} onChange={(e) => setBulkFolder(e.target.value)} placeholder="Déplacer vers…" className="bg-[#111111] border border-white/20 px-2 py-1 text-xs text-[#f7f7f7]" data-testid="admin-media-bulk-folder" />
            <button onClick={applyBulkFolder} className="text-[10px] uppercase tracking-widest text-[#D8CA82] hover:underline">Déplacer</button>
            <input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="Tag à ajouter…" className="bg-[#111111] border border-white/20 px-2 py-1 text-xs text-[#f7f7f7]" data-testid="admin-media-bulk-tag" />
            <button onClick={applyBulkTag} className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#D8CA82] hover:underline"><Tags size={10} /> Ajouter le tag</button>
            <button onClick={deleteBulk} className="text-[10px] uppercase tracking-widest text-red-300 hover:underline" data-testid="admin-media-bulk-delete">Supprimer</button>
            <button onClick={bulk.clear} className="ml-auto text-[10px] uppercase tracking-widest text-[#c8c8c8]">Annuler</button>
          </div>
        )}

        <div className="flex items-center gap-2 px-1 text-[10px] uppercase tracking-widest text-[#c8c8c8]">
          <input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll} aria-label="Sélectionner tous les médias" className="accent-[#D8CA82] h-3.5 w-3.5" data-testid="admin-media-select-all" />
          <span>{filtered.length} média(s)</span>
          <span className="ml-auto">{folders.length} dossier(s) · {allTags.length} tag(s)</span>
        </div>

        <div className="space-y-2" data-testid="admin-media-list">
          {filtered.length === 0 && <p className="text-[#c8c8c8]">{t("media.empty")}</p>}
          {filtered.map((m) => (
            <div key={m.id} className={`flex items-center gap-3 border bg-[#1A1A1A] px-4 py-3 ${bulk.isSelected(m.id) ? "border-[#D8CA82]/50" : "border-white/10"}`}>
              <input type="checkbox" checked={bulk.isSelected(m.id)} onChange={() => bulk.toggle(m.id)} aria-label={`Sélectionner ${m.title}`} data-testid={`admin-media-select-${m.id}`} className="accent-[#D8CA82] h-3.5 w-3.5 shrink-0" />
              <span className="text-xs uppercase tracking-widest border border-[#D8CA82]/40 text-[#D8CA82] px-1.5 py-0.5 shrink-0">{t(`media.type.${m.type}`)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#f7f7f7] truncate">{m.title}</p>
                <p className="text-xs text-[#c8c8c8] truncate">
                  {m.game}
                  {m.folder ? ` · ${m.folder}` : ""}
                  {m.playerTag ? ` · ${m.playerTag}` : ""}
                  {m.event ? ` · ${m.event}` : ""}
                </p>
                {((m.tags || []).length > 0 || m.matchId || m.articleId) && (
                  <p className="text-[10px] text-[#c8c8c8]/70 truncate mt-0.5">
                    {(m.tags || []).map((tag) => `#${tag}`).join(" ")}
                    {m.matchId ? ` · match ${m.matchId.slice(0, 6)}` : ""}
                    {m.articleId ? ` · article ${m.articleId.slice(0, 6)}` : ""}
                  </p>
                )}
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
    </div>
  );
};
