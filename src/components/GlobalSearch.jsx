import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
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
import { getElysiumTeamName } from "../lib/constants";

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
  { path: "/competitions", key: "nav.competitions" },
  { path: "/a-propos", key: "nav.about" },
  { path: "/presse", key: "nav.press" },
  { path: "/soutenir", key: "nav.donate" },
  { path: "/newsletter", key: "nav.newsletter" },
];

const MAX_RESULTS = 30;

/**
 * GlobalSearch — recherche globale (Ctrl+K).
 *
 * Les données (roster, matches, articles) ne sont chargées qu'à l'ouverture
 * de la boîte de dialogue via getDocs (requête ponctuelle), et non via des
 * onSnapshot en continu. Cela évite les abonnements inutiles quand la
 * recherche est fermée, et limite le volume transféré aux seuls champs
 * nécessaires à la recherche (via les options de sélection de Firestore).
 */
export const GlobalSearch = () => {
  const { t } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [initialOpen, setInitialOpen] = useState(false);
  const dataLoadedRef = useRef(false);

  // Ouvrir avec la touche Echap : si la recherche est déjà ouverte et qu'on
  // appuie sur Echap sans focus dans un champ, on la ferme.
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

  // Chargement paresseux des données au premier ouvrage de la boîte.
  // Les données sont récupérées une seule fois puis mises en cache dans le
  // state du composant. Elles ne sont pas rechargées à chaque ouverture
  // tant que l'utilisateur n'a pas fermé et rouvert (auquel cas on les
  // recharge pour garantir la fraîcheur).
  useEffect(() => {
    if (!open) {
      setInitialOpen(false);
      return;
    }
    // Si les données sont déjà en cache et qu'on rouvre sans les avoir
    // fermées, on ne recharge pas inutilement.
    if (dataLoadedRef.current && initialOpen) return;

    setLoadingData(true);
    const qPlayers = query(collection(db, "roster"), orderBy("pseudo"), limit(200));
    const qMatches = query(collection(db, "matches"), orderBy("date", "desc"), limit(200));
    const qArticles = query(collection(db, "articles"), orderBy("publishedAt", "desc"), limit(100));

    Promise.all([
      getDocs(qPlayers).then((snap) =>
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      getDocs(qMatches).then((snap) =>
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      getDocs(qArticles).then((snap) =>
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((a) => a.status !== "deleted")
      ),
    ])
      .then(([p, m, a]) => {
        setPlayers(p);
        setMatches(m);
        setArticles(a);
        dataLoadedRef.current = true;
        setInitialOpen(true);
      })
      .catch(() => {
        // En cas d'erreur, on garde les tableaux vides — l'UI affiche
        // simplement les pages sans résultats players/matches/articles.
      })
      .finally(() => setLoadingData(false));
  }, [open, initialOpen]);

  const runCommand = useCallback((action) => {
    setOpen(false);
    action();
  }, []);

  const pages = PAGE_LINKS.map((p) => ({ ...p, label: t(p.key) }));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandList data-testid="global-search-list">
        <CommandInput
          placeholder={t("search.placeholder")}
          data-testid="global-search-input"
          disabled={loadingData}
        />
        <CommandEmpty>{t("search.empty")}</CommandEmpty>

        {/* Pages */}
        <CommandGroup heading={t("search.pages")}>
          {pages.map((p) => (
            <CommandItem
              key={p.path}
              value={p.label}
              keywords={[p.label, p.path]}
              onSelect={() => runCommand(() => navigate(p.path))}
            >
              <FileText size={14} className="mr-2 text-[#D8CA82]" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Players */}
        <CommandGroup heading={t("search.players")}>
          {players.map((p) => (
            <CommandItem
              key={`player-${p.id}`}
              value={`${p.pseudo} ${p.game || ""} ${p.bio || ""}`}
              onSelect={() => runCommand(() => navigate(`/equipe/${p.id}`))}
            >
              <Users size={14} className="mr-2 text-[#D8CA82]" />
              <span className="font-bold">{p.pseudo}</span>
              {p.game && <span className="ml-2 text-xs text-[#c8c8c8]">{p.game}</span>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Matches — navigation vers /resultats?match=id pour ouvrir la modale */}
        <CommandGroup heading={t("search.matches")}>
          {matches.slice(0, MAX_RESULTS).map((m) => {
            const teamName = getElysiumTeamName(m.roster);
            const label = `${teamName} vs ${m.opponentName || ""} ${m.roster || ""} ${m.competition || ""} ${m.date || ""}`;
            return (
              <CommandItem
                key={`match-${m.id}`}
                value={label}
                onSelect={() => runCommand(() => navigate(`/resultats?match=${m.id}`))}
              >
                <Trophy size={14} className="mr-2 text-[#D8CA82]" />
                <span>{teamName} vs {m.opponentName}</span>
                {m.roster && <span className="ml-2 text-xs text-[#D8CA82]">{m.roster}</span>}
                {m.competition && <span className="ml-2 text-xs text-[#c8c8c8]">{m.competition}</span>}
                <span className="ml-2 text-xs text-[#a0a0a0]">{m.date}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        {/* News */}
        <CommandGroup heading={t("search.news")}>
          {articles.map((a) => (
            <CommandItem
              key={`article-${a.id}`}
              value={`${a.title || ""} ${a.content?.slice(0, 100) || ""}`}
              onSelect={() => runCommand(() => navigate(`/actus/${a.id}`))}
            >
              <Newspaper size={14} className="mr-2 text-[#D8CA82]" />
              <span className="truncate">{a.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
