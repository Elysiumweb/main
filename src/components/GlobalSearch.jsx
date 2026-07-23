import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import { Users, Newspaper, Trophy, FileText } from "lucide-react";

const PAGE_LINKS = [
  { path: "/", key: "nav.home" },
  { path: "/equipe", key: "nav.team" },
  { path: "/resultats", key: "nav.results" },
  { path: "/actus", key: "nav.news" },
  { path: "/medias", key: "nav.media" },
  { path: "/calendrier", key: "nav.calendar" },
  { path: "/support", key: "nav.support" },
  { path: "/recrutement", key: "nav.recruitment" },
  { path: "/statistiques", key: "nav.stats" },
  { path: "/partenaires", key: "nav.partners" },
  { path: "/newsletter", key: "nav.newsletter" },
];

export const GlobalSearch = () => {
  const { t } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [articles, setArticles] = useState([]);

  // Load data
  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "roster"), (snap) => {
        setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, () => {}),
      onSnapshot(collection(db, "matches"), (snap) => {
        setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, () => {}),
      onSnapshot(collection(db, "articles"), (snap) => {
        setArticles(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.status !== "deleted"));
      }, () => {}),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // Keyboard shortcut
  useEffect(() => {
    const down = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback((action) => {
    setOpen(false);
    action();
  }, []);

  const pages = PAGE_LINKS.map((p) => ({ ...p, label: t(p.key) }));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandList data-testid="global-search-list">
        <CommandInput placeholder={t("search.placeholder")} data-testid="global-search-input" />
        <CommandEmpty>{t("search.empty")}</CommandEmpty>

        {/* Pages */}
        <CommandGroup heading={t("search.pages")}>
          {pages.map((p) => (
            <CommandItem key={p.path} value={p.label} keywords={[p.label, p.path]}
              onSelect={() => runCommand(() => navigate(p.path))}>
              <FileText size={14} className="mr-2 text-[#D8CA82]" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Players */}
        <CommandGroup heading={t("search.players")}>
          {players.map((p) => (
            <CommandItem key={`player-${p.id}`} value={`${p.pseudo} ${p.game || ""} ${p.bio || ""}`}
              onSelect={() => runCommand(() => navigate(`/equipe/${p.id}`))}>
              <Users size={14} className="mr-2 text-[#D8CA82]" />
              <span className="font-bold">{p.pseudo}</span>
              {p.game && <span className="ml-2 text-xs text-[#f7f7f7]/40">{p.game}</span>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Matches */}
        <CommandGroup heading={t("search.matches")}>
          {matches.slice(0, 30).map((m) => {
            const label = `Elysium vs ${m.opponentName || ""} ${m.competition || ""} ${m.date || ""}`;
            return (
              <CommandItem key={`match-${m.id}`} value={label}
                onSelect={() => runCommand(() => navigate("/resultats"))}>
                <Trophy size={14} className="mr-2 text-[#D8CA82]" />
                <span>Elysium vs {m.opponentName}</span>
                {m.competition && <span className="ml-2 text-xs text-[#f7f7f7]/40">{m.competition}</span>}
                <span className="ml-2 text-xs text-[#f7f7f7]/30">{m.date}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        {/* News */}
        <CommandGroup heading={t("search.news")}>
          {articles.map((a) => (
            <CommandItem key={`article-${a.id}`} value={`${a.title || ""} ${a.content?.slice(0, 100) || ""}`}
              onSelect={() => runCommand(() => navigate(`/actus/${a.id}`))}>
              <Newspaper size={14} className="mr-2 text-[#D8CA82]" />
              <span className="truncate">{a.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
