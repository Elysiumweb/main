import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { grille as PARTNER_GRILLE, rows as PARTNER_ROWS } from "./partnersDefaults";
import { ASSETS as PRESS_ASSETS, USAGE_EXPORTS as PRESS_USAGE } from "./pressDefaults";

/**
 * Contenus statiques éditables
 * ============================================================================
 * Les textes des pages « À propos », « Partenaires », « Mentions légales » et
 * la section « Nos jeux » de l'accueil vivaient dans le code : chaque
 * correction imposait un redéploiement.
 *
 * Ils sont désormais stockés dans la collection Firestore `siteContent`
 * (un document par section), lus publiquement et modifiés depuis l'admin.
 * Tant qu'un document n'existe pas, les valeurs par défaut ci-dessous sont
 * utilisées : aucune page ne peut devenir vide à cause d'une collection
 * manquante ou d'une lecture refusée.
 */

export const CONTENT_KEYS = ["about", "partners", "legal", "homeGames", "donate", "press"];

export const DEFAULT_ABOUT = {
  intro:
    "Elysium est une équipe esport française née d'une conviction simple : rien n'est donné, tout se mérite. Deux pôles, une même exigence.",
  history:
    "Dans la mythologie grecque, l'Elysium est la demeure des hommes vertueux. Un paradis réservé aux héros et aux guerriers qui ont prouvé leur valeur. C'est le standard pour lequel nous nous battons, sur EVA comme sur Rocket League.",
  values: [
    {
      key: "1",
      title: "Exigence",
      description:
        "Un niveau de préparation sans compromis : entraînements structurés, review VOD, discipline collective.",
    },
    {
      key: "2",
      title: "Intégrité",
      description:
        "Fair-play, respect des adversaires et transparence avec notre communauté et nos partenaires.",
    },
    {
      key: "3",
      title: "Communauté",
      description:
        "Une structure ouverte : chaque membre, joueur ou supporter, contribue à faire grandir le projet.",
    },
  ],
  timeline: [
    {
      date: "Juillet 2026 — Fondation",
      title: "Création de l'association",
      text: "Premier roster EVA, lancement du site et du serveur Discord. « Not given. Earned. »",
    },
    {
      date: "Juillet 2026 — Expansion RL",
      title: "Ouverture du pôle Rocket League",
      text: "Un second roster, la même exigence et le même écusson.",
    },
  ],
};

export const DEFAULT_PARTNERS = {
  intro:
    "Associez votre marque à une structure esport française en croissance. Visibilité sur nos streams, nos maillots, nos événements et nos supports numériques.",
  grille: PARTNER_GRILLE,
  rows: PARTNER_ROWS,
};

export const DEFAULT_LEGAL = {
  mentions: {
    title: "Mentions légales",
    updatedAt: "juillet 2026",
    markdown: `Le présent site est édité par l'équipe esport **Elysium** (ci-après « l'Éditeur »).

## Éditeur du site

Elysium — Équipe esport française, éditée par l'association Elysium, association régie par la loi du 1er juillet 1901, dont le siège social est situé 22 Avenue Lamartine, 77380 Combs-la-Ville (numéro RNA : W772011943). Directeur de la publication : Nathan Martins, Président de l'association.

Contact : via la page Support du site ou le serveur Discord officiel (https://discord.gg/RH3ZZkMJsw).

## Hébergement

Le site est hébergé par Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis (vercel.com). Les données applicatives sont stockées par Google Firebase (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlande).

## Propriété intellectuelle

L'ensemble des éléments du site (logos, charte graphique, textes, visuels Elysium) est la propriété exclusive de l'Éditeur. Toute reproduction ou représentation, totale ou partielle, sans autorisation écrite préalable est interdite.

## Responsabilité

L'Éditeur s'efforce d'assurer l'exactitude des informations diffusées mais ne saurait être tenu responsable des erreurs, omissions ou indisponibilités du service.`,
  },
  privacy: {
    title: "Politique de confidentialité",
    updatedAt: "juillet 2026",
    markdown: `Cette politique décrit comment Elysium collecte et traite vos données personnelles, conformément au RGPD et à la loi Informatique et Libertés.

Responsable du traitement : l'association Elysium, 22 Avenue Lamartine, 77380 Combs-la-Ville.

## Données collectées

- **Compte** : email, pseudo, photo de profil (Firebase Authentication — email/mot de passe ou Google).
- **Support** : sujet, description et messages échangés.
- **Candidature** : pseudo, tranche d'âge, pays/fuseau horaire, expérience, liens vidéo, disponibilités, identifiant Discord — et, pour les moins de 15 ans, nom et email du titulaire de l'autorité parentale.
- **Espace joueur** : messages, notes, planning, tableaux collaboratifs.

## Finalités et base légale

Gestion des comptes et authentification (exécution du contrat), traitement des demandes de support et des candidatures (mesures précontractuelles / intérêt légitime), fonctionnement des espaces d'équipe (intérêt légitime).

## Destinataires

Les demandes de support sont accessibles uniquement aux membres du bureau et au compte officiel. Les candidatures sont accessibles aux manageurs, au bureau et au compte officiel. Les données sont hébergées par Google Firebase.

## Dons et paiements

Les dons sont traités par PayPal (PayPal (Europe) S.à r.l. et Cie, S.C.A.), responsable de traitement indépendant pour l'opération de paiement. Elysium ne collecte ni ne conserve aucune donnée bancaire : celles-ci sont saisies sur les interfaces sécurisées de PayPal. Nous recevons uniquement la confirmation du paiement (montant, date, nom, email), conservée à des fins comptables.

Le module PayPal n'est chargé que sur les sections de don du site, et uniquement lorsqu'elles s'affichent réellement à l'écran.

## Durée de conservation

Les données de compte sont conservées tant que le compte est actif. Les candidatures et demandes de support sont conservées au maximum 24 mois, puis archivées de façon anonymisée ou supprimées. Les notes en corbeille sont purgées après 30 jours. Les candidatures de mineurs sans consentement parental sous 30 jours sont supprimées.

## Cookies

Le site n'utilise que des stockages locaux essentiels : session Firebase, préférence de langue, choix de consentement et bannière d'annonce. Aucun cookie publicitaire n'est déposé. Les sections de don peuvent charger des cookies techniques et anti-fraude de PayPal.

## Vos droits

Droit d'accès, de rectification, d'effacement, de limitation et d'opposition. Vous pouvez supprimer votre compte depuis « Mon profil ». Pour toute demande : page Support ou Discord. Vous pouvez également saisir la CNIL (cnil.fr).

## Mineurs

Si vous avez moins de 15 ans, l'accord d'un titulaire de l'autorité parentale est requis pour candidater : un email de confirmation lui est envoyé et la candidature n'est examinée qu'après validation. Sans confirmation sous 30 jours, elle est supprimée.`,
  },
  terms: {
    title: "Conditions générales d'utilisation",
    updatedAt: "juillet 2026",
    markdown: `Les présentes conditions régissent l'utilisation du site Elysium. En créant un compte ou en naviguant sur le site, vous les acceptez.

## Accès au service

Le site est accessible gratuitement. Certaines fonctionnalités (espace joueur, support, candidature) nécessitent un compte. Les rôles (joueur, manageur, membre du bureau) sont attribués exclusivement par les administrateurs de l'équipe.

## Comportement

Vous vous engagez à ne pas publier de contenus illicites, haineux, diffamatoires ou portant atteinte aux droits de tiers dans les espaces de discussion, notes et tableaux. L'équipe peut supprimer tout contenu inapproprié et suspendre les comptes concernés.

## Compte

Vous êtes responsable de la confidentialité de vos identifiants. Vous pouvez supprimer votre compte à tout moment depuis la page « Mon profil ».

## Dons

Le site permet de soutenir l'association par un don volontaire, traité par PayPal. Un don est un soutien libre : il ne constitue ni un achat, ni une adhésion, et n'ouvre droit à aucune contrepartie, avantage ou statut particulier. En l'état, il n'ouvre pas droit à une réduction d'impôt.

Les dons sont définitifs et non remboursables, sauf erreur manifeste (double débit, montant erroné) : contactez-nous dans ce cas à contact@elysium-esport.fr. Les mineurs doivent obtenir l'accord d'un titulaire de l'autorité parentale. Les fonds sont exclusivement affectés au fonctionnement sportif et associatif d'Elysium.

## Disponibilité

Le service est fourni « en l'état ». Elysium ne garantit pas une disponibilité continue et peut faire évoluer le site à tout moment.

## Droit applicable

Les présentes conditions sont soumises au droit français.`,
  },
};

export const DEFAULT_HOME_GAMES = {
  eva: {
    name: "Esports Virtual Arenas",
    short: "Esports Virtual Arenas",
    tagline: "Team EVA",
    description:
      "Esport virtuel en arène. Notre roster EVA représente Elysium en compétition, avec une préparation hebdomadaire et des objectifs de titre.",
  },
  rl: {
    name: "Rocket League",
    short: "Football de voitures",
    tagline: "Team Rocket League",
    description:
      "Rocket League — football de voitures. Nouveau pôle RL, même exigence, même écusson.",
  },
  pillars:
    "Deux pôles, une seule exigence : entraînements structurés, review VOD et compétition toute l'année.",
};

export const DEFAULT_DONATE = {
  intro:
    "Votre soutien finance directement le fonctionnement de l'association : hébergement, inscriptions en compétition, matériel et accompagnement des joueurs.",
  usages: [
    { title: "Compétitions & inscriptions", description: "Frais d'engagement, déplacements et licences.", percent: 45 },
    { title: "Matériel & infrastructure", description: "Serveurs, outils d'analyse, matériel des joueurs.", percent: 35 },
    { title: "Vie de l'association", description: "Communication, événements communautaires, frais administratifs.", percent: 20 },
  ],
  transparency:
    "Les dons sont encaissés par l'association via PayPal et affectés exclusivement au fonctionnement sportif et associatif. Aucun don n'ouvre droit à une contrepartie.",
};

/** Ressources presse : groupes de logos/charte + exports recommandés. */
export const DEFAULT_PRESS = {
  intro: "",
  assets: PRESS_ASSETS,
  usage: PRESS_USAGE,
};

export const CONTENT_DEFAULTS = {
  about: DEFAULT_ABOUT,
  partners: DEFAULT_PARTNERS,
  legal: DEFAULT_LEGAL,
  homeGames: DEFAULT_HOME_GAMES,
  donate: DEFAULT_DONATE,
  press: DEFAULT_PRESS,
};

/** Fusion superficielle : un document Firestore remplace une section entière. */
export const mergeContent = (key, data) => {
  const defaults = CONTENT_DEFAULTS[key];
  if (!defaults) return data || {};
  if (!data || typeof data !== "object") return defaults;
  const merged = { ...defaults };
  Object.entries(data).forEach(([field, value]) => {
    if (value !== undefined && value !== null && value !== "") merged[field] = value;
  });
  return merged;
};

const isSuspicious = (value, depth = 0) => {
  if (depth > 4) return true;
  if (typeof value === "string") return value.length > 40000;
  if (Array.isArray(value)) return value.length > 200 || value.some((v) => isSuspicious(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.keys(value).length > 80 || Object.values(value).some((v) => isSuspicious(v, depth + 1));
  }
  return false;
};

export const isSafeContent = (value) => {
  try {
    return !isSuspicious(value) && JSON.stringify(value).length < 120000;
  } catch {
    return false;
  }
};

/**
 * Contenu d'une section, avec repli immédiat sur les valeurs par défaut.
 * @param {keyof typeof CONTENT_DEFAULTS} key
 */
export const useSiteContent = (key) => {
  const [data, setData] = useState(null);
  const [received, setReceived] = useState(false);

  useEffect(() => {
    setReceived(false);
    return onSnapshot(
      doc(db, "siteContent", key),
      (snap) => {
        setData(snap.exists() ? snap.data() : null);
        setReceived(true);
      },
      (err) => {
        console.error("siteContent sync", err);
        setReceived(true);
      },
    );
  }, [key]);

  return useMemo(
    () => ({
      content: mergeContent(key, data),
      loading: !received,
      isFallback: received ? !data : true,
      raw: data,
    }),
    [key, data, received],
  );
};
