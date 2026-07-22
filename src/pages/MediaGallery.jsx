import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Image as ImageIcon, PlayCircle } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { GAMES } from "../lib/constants";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Dialog, DialogContent, DialogTrigger } from "../components/ui/dialog";

const selectCls = "bg-[#1A1A1A] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

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

  const filtered = (media || []).filter((m) =>
    (type === "all" || m.type === type) &&
    (game === "all" || m.game === game) &&
    (player === "all" || m.playerTag === player) &&
    (event === "all" || m.event === event));

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="media-title">{t("media.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("media.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="flex flex-wrap gap-4 mb-10" data-testid="media-filters">
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls} data-testid="media-filter-type">
            <option value="all">{t("media.all")}</option>
            <option value="photo">{t("media.type.photo")}</option>
            <option value="video">{t("media.type.video")}</option>
          </select>
          <select value={game} onChange={(e) => setGame(e.target.value)} className={selectCls} data-testid="media-filter-game">
            <option value="all">{`${t("common.game")} : ${t("media.all")}`}</option>
            {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={player} onChange={(e) => setPlayer(e.target.value)} className={selectCls} data-testid="media-filter-player">
            <option value="all">{`${t("media.filter.player")} : ${t("media.all")}`}</option>
            {players.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={event} onChange={(e) => setEvent(e.target.value)} className={selectCls} data-testid="media-filter-event">
            <option value="all">{`${t("media.filter.event")} : ${t("media.all")}`}</option>
            {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
        </div>
        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="media-error" />
        ) : media === null ? (
          <LoadingState testId="media-loading" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ImageIcon} text={t("media.empty")} testId="media-empty" />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="media-grid">
            {filtered.map((m) => {
              const embed = m.type === "video" ? videoEmbedUrl(m.url) : null;
              return (
                <Dialog key={m.id}>
                  <DialogTrigger asChild>
                    <button className="group border border-white/10 bg-[#1A1A1A] hover:border-[#D8CA82]/60 transition-colors text-left overflow-hidden" data-testid={`media-item-${m.id}`}>
                      <div className="relative h-48 bg-[#0d0d0d] flex items-center justify-center overflow-hidden">
                        {m.type === "photo" ? (
                          <img src={m.url} alt={m.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => { e.target.style.display = "none"; }} />
                        ) : (
                          <>
                            {m.thumbnail ? <img src={m.thumbnail} alt="" className="w-full h-full object-cover opacity-60" /> : <div className="absolute inset-0 canvas-dots" />}
                            <PlayCircle size={44} className="absolute text-[#D8CA82] drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]" />
                          </>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="text-sm font-semibold text-[#f7f7f7] truncate">{m.title}</p>
                        <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 mt-1">
                          {t(`media.type.${m.type}`)}{m.game ? ` · ${m.game}` : ""}{m.playerTag ? ` · ${m.playerTag}` : ""}{m.event ? ` · ${m.event}` : ""}
                        </p>
                      </div>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#111111] border border-[#D8CA82]/30 rounded-none max-w-3xl p-2" data-testid={`media-lightbox-${m.id}`}>
                    {m.type === "photo" ? (
                      <img src={m.url} alt={m.title} className="w-full max-h-[75vh] object-contain" />
                    ) : embed ? (
                      <iframe src={embed} title={m.title} className="w-full aspect-video" allowFullScreen allow="autoplay; fullscreen" />
                    ) : (
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[#D8CA82] underline p-8 block text-center">{m.url}</a>
                    )}
                    <p className="text-sm text-[#f7f7f7]/70 px-2 pb-2">{m.title}</p>
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
