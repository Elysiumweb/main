import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, startAfter } from "firebase/firestore";
import { Download, ExternalLink, Image as ImageIcon, Link2, PlayCircle, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { GAMES } from "../lib/constants";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Dialog, DialogContent, DialogTrigger } from "../components/ui/dialog";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { ImageWithFallback } from "../components/ImageWithFallback";

const PAGE_SIZE = 12;
const selectCls = "bg-[#1A1A1A] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const relatedPath = (item) => item.relatedType === "player" ? `/equipe/${item.relatedId}` : item.relatedType === "article" ? `/actus/${item.relatedId}` : item.relatedType === "match" ? `/resultats?match=${item.relatedId}` : "";
const rightsLabel = { "share-download": "Partage et téléchargement autorisés", share: "Partage autorisé", editorial: "Usage éditorial uniquement", restricted: "Tous droits réservés" };

export const videoEmbedUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com") && parsed.searchParams.get("v")) return `https://www.youtube.com/embed/${parsed.searchParams.get("v")}`;
    if (parsed.hostname === "youtu.be") return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
    if (parsed.hostname.includes("twitch.tv") && parsed.pathname.startsWith("/videos/")) return `https://player.twitch.tv/?video=${parsed.pathname.split("/")[2]}&parent=${window.location.hostname}&autoplay=false`;
    if (parsed.hostname === "clips.twitch.tv") return `https://clips.twitch.tv/embed?clip=${parsed.pathname.slice(1)}&parent=${window.location.hostname}&autoplay=false`;
  } catch { /* URL invalide */ }
  return null;
};

export default function MediaGallery() {
  const { t } = useLang();
  const [media, setMedia] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState({ type: "all", game: "all", album: "all", event: "all" });

  const load = async (reset = false) => {
    setLoading(true); setError(false);
    try {
      const constraints = [orderBy("createdAt", "desc"), limit(PAGE_SIZE)];
      const activeCursor = reset ? null : cursor;
      if (activeCursor) constraints.splice(1, 0, startAfter(activeCursor));
      const snapshot = await getDocs(query(collection(db, "media"), ...constraints));
      const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setMedia((current) => reset ? next : [...current, ...next]);
      setCursor(snapshot.docs.at(-1) || null);
      setHasMore(snapshot.size === PAGE_SIZE);
    } catch (err) { console.error(err); setError(true); }
    setLoading(false);
  };
  useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const albums = useMemo(() => [...new Set(media.map((item) => item.album).filter(Boolean))].sort(), [media]);
  const events = useMemo(() => [...new Set(media.map((item) => item.event).filter(Boolean))].sort(), [media]);
  const filtered = media.filter((item) => Object.entries(filters).every(([key, value]) => value === "all" || item[key] === value));
  const setFilter = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));

  const share = async (item) => {
    const payload = { title: item.title, text: item.caption || item.title, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(payload);
      else { await navigator.clipboard.writeText(window.location.href); toast.success("Lien copié."); }
    } catch (err) { if (err.name !== "AbortError") toast.error("Partage indisponible."); }
  };

  return <div className="min-h-[70vh] bg-[#111111]">
    <section className="relative border-b border-white/10 overflow-hidden"><div className="pattern-overlay" /><div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative"><PageBreadcrumb items={[{ label: t("media.title") }]} /><h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase">{t("media.title")}</h1><p className="text-[#f7f7f7]/50 mt-4 tracking-wide">Albums, événements et moments forts d’Elysium.</p></div></section>
    <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
      <div className="flex flex-wrap gap-4 mb-10" data-testid="media-filters">
        <select value={filters.type} onChange={setFilter("type")} className={selectCls}><option value="all">Tous les formats</option><option value="photo">Photos</option><option value="video">Vidéos</option></select>
        <select value={filters.game} onChange={setFilter("game")} className={selectCls}><option value="all">Tous les jeux</option>{GAMES.map((game) => <option key={game}>{game}</option>)}</select>
        <select value={filters.album} onChange={setFilter("album")} className={selectCls}><option value="all">Tous les albums</option>{albums.map((album) => <option key={album}>{album}</option>)}</select>
        <select value={filters.event} onChange={setFilter("event")} className={selectCls}><option value="all">Tous les événements</option>{events.map((event) => <option key={event}>{event}</option>)}</select>
      </div>
      {error && media.length === 0 ? <ErrorState onRetry={() => load(true)} testId="media-error" /> : loading && media.length === 0 ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={ImageIcon} text={t("media.empty")} /> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((item) => {
          const embed = item.type === "video" ? videoEmbedUrl(item.url) : null;
          return <Dialog key={item.id}><DialogTrigger asChild><button className="group border border-white/10 bg-[#1A1A1A] hover:border-[#D8CA82]/50 transition-colors text-left overflow-hidden">
            <div className="relative h-48 bg-[#0d0d0d] flex items-center justify-center overflow-hidden"><ImageWithFallback src={item.thumbnail || item.url} alt={item.title} fallbackType={item.type === "video" ? "video" : "brand"} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />{item.type === "video" && <PlayCircle size={44} className="absolute text-[#D8CA82]" />}</div>
            <div className="p-4"><p className="text-sm font-semibold text-[#f7f7f7] truncate">{item.title}</p><p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 mt-1">{item.album || item.event || item.game}{item.capturedAt ? ` · ${item.capturedAt}` : ""}</p>{item.caption && <p className="text-xs text-[#f7f7f7]/55 mt-2 line-clamp-2">{item.caption}</p>}</div>
          </button></DialogTrigger><DialogContent className="bg-[#111111] border border-[#D8CA82]/30 rounded-none max-w-4xl p-3">
            {item.type === "photo" ? <ImageWithFallback src={item.url} alt={item.title} fallbackType="brand" className="w-full max-h-[65vh] object-contain" /> : embed ? <iframe src={embed} title={item.title} className="w-full aspect-video" allowFullScreen allow="autoplay; fullscreen" /> : <a href={item.url} target="_blank" rel="noreferrer" className="text-[#D8CA82] p-8 text-center">Ouvrir la vidéo</a>}
            <div className="p-3 space-y-3"><div><h2 className="font-display text-lg text-[#f7f7f7]">{item.title}</h2>{item.caption && <p className="text-sm text-[#c8c8c8] mt-1">{item.caption}</p>}</div><p className="text-xs text-[#f7f7f7]/45">{item.capturedAt || "Date non renseignée"}{item.author ? ` · ${item.author}` : ""}{item.credit ? ` · Crédit : ${item.credit}` : ""}<br />{rightsLabel[item.usageRights] || "Droits non renseignés"}</p>
              <div className="flex flex-wrap gap-2"><button onClick={() => share(item)} disabled={["editorial", "restricted"].includes(item.usageRights)} className="border border-white/20 px-3 py-2 text-xs text-[#f7f7f7] disabled:opacity-30 flex gap-2"><Share2 size={14} /> Partager</button>{item.usageRights === "share-download" && <a href={item.url} download target="_blank" rel="noreferrer" className="border border-white/20 px-3 py-2 text-xs text-[#f7f7f7] flex gap-2"><Download size={14} /> Télécharger</a>}{relatedPath(item) && <Link to={relatedPath(item)} className="border border-[#D8CA82]/50 text-[#D8CA82] px-3 py-2 text-xs flex gap-2"><Link2 size={14} /> Voir le contenu associé</Link>}{item.type === "video" && <a href={item.url} target="_blank" rel="noreferrer" className="px-3 py-2 text-xs text-[#f7f7f7]/60 flex gap-2"><ExternalLink size={14} /> Source</a>}</div>
            </div>
          </DialogContent></Dialog>;
        })}
      </div>}
      {hasMore && <div className="text-center mt-10"><button onClick={() => load(false)} disabled={loading} className="border border-[#D8CA82]/50 text-[#D8CA82] uppercase tracking-widest text-xs px-6 py-3 disabled:opacity-50">{loading ? "Chargement…" : "Charger plus"}</button></div>}
    </section>
  </div>;
}
