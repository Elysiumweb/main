import { matchPath, useLocation } from "react-router-dom";
import { SITE_URL, useSEO } from "../lib/useSEO";

const routeSEO = [
  { path: "/", title: "ELYSIUM Esport — Équipe EVA, Rocket League & Valorant", description: "Découvrez ELYSIUM Esport : équipe française EVA, Rocket League et Valorant, résultats, actualités, live, recrutement et communauté." },
  { path: "/resultats", title: "Résultats & matchs — ELYSIUM Esport", description: "Calendrier des matchs Elysium, résultats, scores, VOD et liens live des compétitions EVA, Rocket League et Valorant.", jsonLd: { "@type": "CollectionPage", name: "Résultats Elysium", url: `${SITE_URL}/resultats` } },
  { path: "/equipe", title: "Équipe & roster — ELYSIUM Esport", description: "Effectif Elysium : joueurs EVA, Rocket League, Valorant, rosters, rôles en jeu et staff." },
  { path: "/equipe/:id", title: "Profil joueur — ELYSIUM Esport", description: "Profil d'un joueur Elysium : jeu, roster, rôle et informations publiques." },
  { path: "/actus", title: "Actualités — ELYSIUM Esport", description: "Actualités Elysium Esport : annonces, résultats, coulisses, médias et vie de l'équipe.", jsonLd: { "@type": "Blog", name: "Actualités Elysium", url: `${SITE_URL}/actus` } },
  { path: "/actus/:id", title: "Article — ELYSIUM Esport", description: "Article Elysium Esport : actualités, annonces et analyses de l'équipe." },
  { path: "/medias", title: "Médias — ELYSIUM Esport", description: "Galerie médias Elysium : vidéos, replays, photos et contenus communautaires." },
  { path: "/calendrier", title: "Calendrier communautaire — ELYSIUM Esport", description: "Événements publics Elysium, rendez-vous communautaires et ajouts Google Calendar/ICS.", jsonLd: { "@type": "CollectionPage", name: "Calendrier communautaire Elysium", url: `${SITE_URL}/calendrier` } },
  { path: "/support", title: "Support — ELYSIUM Esport", description: "Contactez le support Elysium pour toute demande, question ou assistance liée au site et à la communauté." },
  { path: "/recrutement", title: "Recrutement — ELYSIUM Esport", description: "Postulez chez Elysium Esport : postes ouverts, candidature joueur, staff et suivi de dossier." },
  { path: "/statistiques", title: "Statistiques — ELYSIUM Esport", description: "Statistiques compétitives Elysium : taux de victoire, scores moyens, tendances et derniers matchs." },
  { path: "/partenaires", title: "Partenaires — ELYSIUM Esport", description: "Partenaires Elysium Esport et formulaire de demande de partenariat." },
  { path: "/soutenir", title: "Soutenir Elysium — Dons & partenaires", description: "Soutenez ELYSIUM Esport via un don, un partenariat ou une prise de contact sponsor." },
  { path: "/dons", title: "Soutenir Elysium — Dons & partenaires", description: "Soutenez ELYSIUM Esport via un don, un partenariat ou une prise de contact sponsor.", url: "/soutenir" },
  { path: "/newsletter", title: "Newsletter — ELYSIUM Esport", description: "Inscrivez-vous à la newsletter Elysium pour recevoir les actualités, résultats et annonces importantes." },
  { path: "/connexion", title: "Connexion — ELYSIUM Esport", description: "Connexion sécurisée à l'espace Elysium pour les joueurs, staff et membres.", noIndex: true },
  { path: "/profil", title: "Mon profil — ELYSIUM Esport", description: "Gestion du profil membre Elysium.", noIndex: true },
  { path: "/admin", title: "Administration — ELYSIUM Esport", description: "Interface d'administration Elysium.", noIndex: true },
  { path: "/mentions-legales", title: "Mentions légales — ELYSIUM Esport", description: "Mentions légales du site ELYSIUM Esport." },
  { path: "/confidentialite", title: "Confidentialité — ELYSIUM Esport", description: "Politique de confidentialité ELYSIUM Esport et informations sur les données personnelles." },
  { path: "/cgu", title: "Conditions d'utilisation — ELYSIUM Esport", description: "Conditions générales d'utilisation du site ELYSIUM Esport." },
  { path: "/espace-joueur", title: "Espace joueur — ELYSIUM Esport", description: "Espace privé des joueurs Elysium.", noIndex: true },
  { path: "/espace-joueur/chat", title: "Chat joueur — ELYSIUM Esport", description: "Chat privé des joueurs et du staff Elysium.", noIndex: true },
  { path: "/espace-joueur/planning", title: "Planning joueur — ELYSIUM Esport", description: "Planning privé Elysium : calendrier, disponibilités, semaine type et déclaration d'absences.", noIndex: true },
  { path: "/espace-joueur/notes", title: "Notes joueur — ELYSIUM Esport", description: "Notes privées et collectives de l'espace joueur Elysium.", noIndex: true },
  { path: "/espace-joueur/tableau", title: "Tableau tactique — ELYSIUM Esport", description: "Tableau tactique privé pour les joueurs et le staff Elysium.", noIndex: true },
  { path: "/espace-joueur/activite", title: "Activité joueur — ELYSIUM Esport", description: "Journal d'activité privé de l'espace joueur Elysium.", noIndex: true },
];

const fallback = {
  title: "Page introuvable — ELYSIUM Esport",
  description: "La page demandée est introuvable. Retrouvez l'accueil, les résultats, l'équipe ou le recrutement Elysium.",
  noIndex: true,
};

export function SEOManager() {
  const { pathname } = useLocation();
  const route = routeSEO.find((item) => matchPath({ path: item.path, end: true }, pathname)) || fallback;
  useSEO({ ...route, url: route.url || pathname });
  return null;
}
