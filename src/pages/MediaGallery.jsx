import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Image as ImageIcon, PlayCircle, Download, Camera } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { GAMES } from "../lib/constants";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Dialog, DialogContent, DialogTrigger } from "../components/ui/dialog";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { FiltersBar } from "../components/FiltersBar";
import { ImageWithFallback } from "../components/ImageWithFallback";

export const videoEmbedUrl = (url) => {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.get("v")) return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    if (u.hostname === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.includes("twitch.tv") && u.pathname.startsWith("/videos/"))
      return `https://player.twitch.tv/?video=${u.pathname.split("/")[2]}&parent=${window.location.hostname}&autoplay=false`;
    if (u.hostname === "clips.twitch.tv")
      return `https://clips.twitch.tv/embed?clip=${u.pathname.slice(1)}&parent=${window.location.hostname}&autoplay=false`;
  } catch { /* invalid url */ }
  return null;
};

export default function MediaGallery() {
  const { t } = useLang();
  const [media, setMedia] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [type, setType] = useState("all");
  const [game, setGame] = useState("all");
  const [player, setPlayer] = useState("all");
  const [event, setEvent] = useState("all");
  const [album, setAlbum] = useState("all");

  useEffect(() => {
    setError(false); setMedia(null);
    return onSnapshot(collection(db, "media"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMedia(list);
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  const players = useMemo(() => [...new Set((media || []).map((m) => m.playerTag).filter(Boolean))], [media]);
  const events = useMemo(() => [...new Set((media || []).map((m) => m.event).filter(Boolean))], [media]);
  const albums = useMemo(
    () => [...new Set((media || []).map((m) => m.album).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [media]
  );

  const filtered = (media || []).filter((m) =>
    (type === "all" || m.type === type) &&
    (game === "all" || m.game === game) &&
    (player === "all" || m.playerTag === player) &&
    (event === "all" || m.event === event) &&
    (album === "all" || m.album === album));

  const hasActiveFilters = type !== "all" || game !== "all" || player !== "all" || event !== "all" || album !== "all";
  const resetFilters = () => { setType("all"); setGame("all"); setPlayer("all"); setEvent("all"); setAlbum("all"); };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("media.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="media-title">{t("media.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("media.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="border border-white/10 bg-[#0c0c0c] p-4 mb-8 flex items-center gap-3" data-testid="media-editorial-note">
          <span className="text-[#D8CA82]">◆</span>
          <p className="text-xs uppercase tracking-[0.3em] text-[#c8c8c8]">Grille éditoriale — tailles variables, pas uniforme 3 colonnes</p>
          <span className="ml-auto text-xs text-[#c8c8c8]">{filtered.length} médias</span>
        </div>

        {/* Barre de filtres commune (D-08) : type, jeu, joueur, événement, album */}
        <FiltersBar
          testId="media-filters"
          selects={[
            {
              testId: "media-filter-type",
              label: t("media.filter.type"),
              value: type,
              onChange: setType,
              options: [
                { value: "all", label: t("media.all") },
                { value: "photo", label: t("media.type.photo") },
                { value: "video", label: t("media.type.video") },
              ],
            },
            {
              testId: "media-filter-game",
              label: t("common.game"),
              value: game,
              onChange: setGame,
              options: [
                { value: "all", label: `${t("common.game")} : ${t("media.all")}` },
                ...GAMES.map((g) => ({ value: g, label: g })),
              ],
            },
            {
              testId: "media-filter-player",
              label: t("media.filter.player"),
              value: player,
              onChange: setPlayer,
              options: [
                { value: "all", label: `${t("media.filter.player")} : ${t("media.all")}` },
                ...players.map((p) => ({ value: p, label: p })),
              ],
            },
            {
              testId: "media-filter-event",
              label: t("media.filter.event"),
              value: event,
              onChange: setEvent,
              options: [
                { value: "all", label: `${t("media.filter.event")} : ${t("media.all")}` },
                ...events.map((ev) => ({ value: ev, label: ev })),
              ],
            },
            {
              testId: "media-filter-album",
              label: t("media.filter.album"),
              value: album,
              onChange: setAlbum,
              options: [
                { value: "all", label: `${t("media.filter.album")} : ${t("media.all")}` },
                ...albums.map((a) => ({ value: a, label: a })),
              ],
            },
          ]}
          hasActiveFilters={hasActiveFilters}
          onReset={resetFilters}
          resetLabel={t("news.filters.reset")}
        />

        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="media-error" />
        ) : media === null ? (
          <LoadingState testId="media-loading" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ImageIcon} text={t("media.empty")} testId="media-empty" />
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 space-y-5" data-testid="media-grid">
            {filtered.map((m, i) => {
              const embed = m.type === "video" ? videoEmbedUrl(m.url) : null;
              const downloadUrl = m.type === "photo" ? (m.hdUrl || m.url) : null;
              return (
                <Dialog key={m.id}>
                  <DialogTrigger asChild>
                    <button className={`group border border-white/10 bg-[#1A1A1A] hover:border-[#D8CA82]/50 transition-colors text-left overflow-hidden break-inside-avoid ${i%5===0 ? "sm:row-span-2" : ""} ${m.type==="video" ? "border-[#D8CA82]/20" : ""}`} data-testid={`media-item-${m.id}`}>
                      <div className={`relative bg-[#0d0d0d] flex items-center justify-center overflow-hidden ${i%3===0 ? "h-72" : i%4===0 ? "h-56" : "h-48"}`}>
                        {m.type === "photo" ? (
                          <ImageWithFallback
                            src={m.url}
                            alt={m.title}
                            fallbackType="brand"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <>
                            {m.thumbnail ? (
                              <ImageWithFallback src={m.thumbnail} alt="" fallbackType="video" className="w-full h-full object-cover opacity-60" />
                            ) : (
                              <div className="absolute inset-0 canvas-dots" />
                            )}
                            <PlayCircle size={44} className="absolute text-[#D8CA82] drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]" />
                          </>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="text-sm font-semibold text-[#f7f7f7] truncate">{m.title}</p>
                        <p className="text-xs uppercase tracking-widest text-[#c8c8c8] mt-1">
                          {t(`media.type.${m.type}`)}{m.album ? ` · ${m.album}` : ""}{m.game ? ` · ${m.game}` : ""}{m.playerTag ? ` · ${m.playerTag}` : ""}{m.event ? ` · ${m.event}` : ""}
                        </p>
                        {m.credit && (
                          <p className="text-[10px] text-[#f7f7f7]/40 mt-1.5 flex items-center gap-1 truncate" data-testid={`media-credit-${m.id}`}>
                            <Camera size={10} aria-hidden="true" /> {m.credit}
                          </p>
                        )}
                      </div>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#111111] border border-[#D8CA82]/30 rounded-none max-w-3xl p-2" data-testid={`media-lightbox-${m.id}`}>
                    {m.type === "photo" ? (
                      <ImageWithFallback src={m.url} alt={m.title} fallbackType="brand" className="w-full max-h-[75vh] object-contain" />
                    ) : embed ? (
                      <iframe src={embed} title={m.title} className="w-full aspect-video" allowFullScreen allow="autoplay; fullscreen" />
                    ) : (
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[#D8CA82] underline p-8 block text-center">{m.url}</a>
                    )}
                    <div className="px-2 pb-2 pt-1">
                      <p className="text-sm text-[#f7f7f7]/70">{m.title}</p>
                      {m.caption && (
                        <p className="text-xs text-[#f7f7f7]/50 mt-1" data-testid={`media-caption-${m.id}`}>{m.caption}</p>
                      )}
                      <div className="flex items-center justify-between gap-4 flex-wrap mt-2">
                        <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40">
                          {m.album ? `${m.album} · ` : ""}{m.credit ? `© ${m.credit.replace(/^©\s*/, "")}` : ""}
                        </p>
                        {downloadUrl && (
                          <a
                            href={downloadUrl}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`media-download-${m.id}`}
                            className="inline-flex items-center gap-1.5 border border-[#D8CA82]/50 text-[#D8CA82] text-[10px] uppercase tracking-widest px-3 py-1.5 hover:bg-[#D8CA82]/10 transition-colors"
                            title={m.hdUrl ? t("media.downloadHd") : t("media.download")}
                          >
                            <Download size={11} aria-hidden="true" /> {m.hdUrl ? t("media.downloadHd") : t("media.download")}
                          </a>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
