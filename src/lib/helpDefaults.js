/**
 * Base de connaissances : contenu par défaut de la FAQ.
 * ----------------------------------------------------------------------------
 * Ces 15 entrées sont celles qui étaient codées en dur dans `i18n.js`
 * (`support.faq.q1..q15`), extraites pour devenir une VRAIE base de données :
 * elles sont publiées dans Firestore (`helpArticles`) depuis le panel admin et
 * deviennent éditables sans redéploiement.
 *
 * Elles servent aussi de repli hors-ligne : tant que la collection Firestore
 * est vide (site fraîchement déployé), la page Support affiche cette liste.
 *
 * Format d'un article Firestore :
 *   { question, answer, questionEn?, answerEn?, category, game, published, order }
 *   - `category` : clé de `HELP_CATEGORIES` (rubrique).
 *   - `game`     : "all" | "EVA" | "Rocket League" (centre d'aide structuré par jeu).
 *   - `published`: false = brouillon invisible du public.
 */

export const HELP_CATEGORIES = [
  { id: "account", labelKey: "support.faq.account" },
  { id: "apply", labelKey: "support.faq.apply" },
  { id: "donate", labelKey: "support.faq.donate" },
  { id: "player", labelKey: "support.faq.player" },
  { id: "discord", labelKey: "support.faq.discord" },
  { id: "game", labelKey: "support.faq.game" },
];

export const HELP_CATEGORY_IDS = HELP_CATEGORIES.map((c) => c.id);

/** `all` = commun à toute la structure ; sinon la question est propre à un pôle. */
export const HELP_GAMES = ["all", "EVA", "Rocket League"];

export const HELP_ARTICLES = [
  {
    category: "account", game: "all",
    question: "Comment créer un compte ?",
    answer: "Cliquez sur « Connexion » en haut à droite, puis « Créer un compte ». Vous pouvez aussi vous inscrire en un clic avec Google. Pensez à vérifier votre adresse email pour sécuriser votre compte.",
    questionEn: "How do I create an account?",
    answerEn: "Click \"Sign in\" in the top right, then \"Create account\". You can also sign up in one click with Google. Remember to verify your email address to secure your account.",
  },
  {
    category: "account", game: "all",
    question: "J'ai oublié mon mot de passe.",
    answer: "Sur la page de connexion, cliquez sur « Mot de passe oublié » et suivez le lien envoyé par email. Si vous n'avez rien reçu, vérifiez vos spams.",
    questionEn: "I forgot my password.",
    answerEn: "On the sign-in page, click \"Forgot password\" and follow the link sent by email. If you received nothing, check your spam folder.",
  },
  {
    category: "account", game: "all",
    question: "Comment modifier mon pseudo ou ma photo ?",
    answer: "Connectez-vous puis ouvrez « Mon profil ». Vous pouvez y changer votre pseudo, votre photo de profil (upload direct) et votre email.",
    questionEn: "How do I change my username or photo?",
    answerEn: "Sign in then open \"My profile\". You can change your username, profile picture (direct upload) and email.",
  },
  {
    category: "apply", game: "all",
    question: "Comment postuler chez Elysium ?",
    answer: "Rendez-vous sur la page « Recrutement », choisissez un poste ouvert et envoyez votre candidature. Un manageur vous répondra dans la conversation de candidature.",
    questionEn: "How do I apply to Elysium?",
    answerEn: "Go to the \"Recruitment\" page, pick an open position and send your application. A manager will answer you in the application thread.",
  },
  {
    category: "apply", game: "all",
    question: "Quels sont les prérequis pour candidater ?",
    answer: "Chaque annonce liste ses prérequis (rang, disponibilités, âge). Les candidatures spontanées restent les bienvenues : prouvez votre valeur.",
    questionEn: "What are the requirements to apply?",
    answerEn: "Each post lists its requirements (rank, availability, age). Spontaneous applications are still welcome: prove your worth.",
  },
  {
    category: "apply", game: "all",
    question: "Où en est ma candidature ?",
    answer: "Connectez-vous et ouvrez la page « Recrutement » : le statut de votre candidature y est affiché (en attente, en examen, acceptée, refusée).",
    questionEn: "Where is my application at?",
    answerEn: "Sign in and open the \"Recruitment\" page: your application status is displayed (pending, reviewing, accepted, rejected).",
  },
  {
    category: "donate", game: "all",
    question: "Comment faire un don ?",
    answer: "Sur la page « Soutenir », choisissez le montant de votre don ponctuel ou optez pour le don mensuel / l'adhésion. Le paiement est sécurisé par PayPal, sans compte PayPal obligatoire.",
    questionEn: "How do I make a donation?",
    answerEn: "On the \"Support us\" page, choose your one-time amount or go for the monthly donation / membership. Payment is secured by PayPal, no PayPal account required.",
  },
  {
    category: "donate", game: "all",
    question: "Puis-je annuler mon don mensuel ?",
    answer: "Oui : votre abonnement mensuel est géré par PayPal. Connectez-vous à votre compte PayPal, rubrique « Abonnements », pour le modifier ou l'annuler à tout moment.",
    questionEn: "Can I cancel my monthly donation?",
    answerEn: "Yes: your monthly subscription is managed by PayPal. Sign in to your PayPal account, \"Subscriptions\" section, to edit or cancel it at any moment.",
  },
  {
    category: "donate", game: "all",
    question: "Les dons sont-ils déductibles ?",
    answer: "En l'état, les dons ne sont pas déductibles fiscalement. Chaque euro est affecté au fonctionnement sportif et associatif : voir la section Transparence de la page Soutenir.",
    questionEn: "Are donations tax deductible?",
    answerEn: "Currently donations are not tax deductible. Every euro goes to the club's competitive and non-profit activity: see the Transparency section of the Support us page.",
  },
  {
    category: "player", game: "all",
    question: "Comment accéder à l'espace joueur ?",
    answer: "L'espace joueur (chat, planning, notes, tableau) est réservé aux joueurs, manageurs et membres du bureau. Il apparaît dans le menu une fois connecté avec le bon rôle.",
    questionEn: "How do I access the player space?",
    answerEn: "The player space (chat, planning, notes, board) is reserved for players, managers and bureau members. It appears in the menu once signed in with the right role.",
  },
  {
    category: "player", game: "all",
    question: "Comment déclarer mon absence ?",
    answer: "Dans l'espace joueur, ouvrez l'onglet « Planning » puis cliquez sur « Déclarer une absence » : les manageurs sont prévenus et vos disponibilités sont masquées ce jour-là.",
    questionEn: "How do I declare my absence?",
    answerEn: "In the player space, open the \"Planning\" tab then click \"Declare absence\": managers are notified and your availability is hidden for that day.",
  },
  {
    category: "player", game: "all",
    question: "Les disponibilités sont-elles automatiques ?",
    answer: "Vous pouvez définir une « semaine type » une seule fois : elle s'applique à chaque semaine, avec la possibilité de l'adapter au cas par cas.",
    questionEn: "Is availability automatic?",
    answerEn: "You can set a \"weekly template\" once: it applies to every week, with the ability to adapt it case by case.",
  },
  {
    category: "discord", game: "all",
    question: "Comment rejoindre le Discord ?",
    answer: "Le lien d'invitation est disponible dans le pied de page et sur la page d'accueil : https://discord.gg/RH3ZZkMJsw",
    questionEn: "How do I join the Discord?",
    answerEn: "The invite link is available in the footer and on the home page: https://discord.gg/RH3ZZkMJsw",
  },
  {
    category: "discord", game: "all",
    question: "Où annoncer ma disponibilité sur Discord ?",
    answer: "Utilisez les salons prévus par le staff (annonces, recrutement, événements). Pour les matchs, privilégiez l'espace joueur et le planning du site.",
    questionEn: "Where do I announce my availability on Discord?",
    answerEn: "Use the channels provided by the staff (announcements, recruitment, events). For matches, prefer the player space and the site's planning.",
  },
  {
    category: "discord", game: "all",
    question: "Comment signaler un problème sur Discord ?",
    answer: "Contactez un membre du staff ou ouvrez une demande de support sur cette page : elle sera traitée en priorité.",
    questionEn: "How do I report an issue on Discord?",
    answerEn: "Contact a staff member or open a support request on this page: it will be handled with priority.",
  },
  {
    category: "game", game: "EVA",
    question: "Comment suivre les matchs EVA ?",
    answer: "Le prochain match et les résultats sont affichés sur l'accueil et sur la page Résultats. Les replays sont publiés dans la rubrique Médias.",
    questionEn: "How do I follow EVA matches?",
    answerEn: "The next match and the results are displayed on the home page and on the Results page. Replays are published in the Media section.",
  },
  {
    category: "game", game: "EVA",
    question: "J'ai un problème de rang ou de compte EVA",
    answer: "Ouvrez une demande de support (ci-dessous) en précisant votre pseudo EVA et votre rang, ou passez par le Discord : le staff EVA traitera votre dossier.",
    questionEn: "I have a rank or account issue on EVA",
    answerEn: "Open a support request (below) with your EVA username and rank, or go through Discord: the EVA staff will handle it.",
  },
  {
    category: "game", game: "Rocket League",
    question: "Comment candidater sur le pôle Rocket League ?",
    answer: "Le pôle RL recrute par candidature spontanée ou via un créneau d'essai publié sur la page Recrutement : indiquez votre rang, votre expérience en LAN et vos disponibilités.",
    questionEn: "How do I apply for the Rocket League roster?",
    answerEn: "The RL roster recruits through spontaneous applications or through a tryout slot published on the Recruitment page: state your rank, your LAN experience and your availability.",
  },
  {
    category: "game", game: "Rocket League",
    question: "Comment suivre un scrim ou un essai Rocket League ?",
    answer: "Les créneaux d'essai ouverts apparaissent sur la page Recrutement ; les événements internes (scrims, matchs) restent dans l'espace joueur, onglet Planning.",
    questionEn: "How do I follow a Rocket League scrim or tryout?",
    answerEn: "Open tryout slots appear on the Recruitment page; internal events (scrims, matches) stay in the player space, Planning tab.",
  },
];

/** Texte à afficher pour la langue courante (l'anglais est facultatif). */
export const helpArticleText = (article, lang = "fr") => {
  if (!article) return { question: "", answer: "" };
  if (lang === "en") {
    return {
      question: article.questionEn || article.question,
      answer: article.answerEn || article.answer,
    };
  }
  return { question: article.question || "", answer: article.answer || "" };
};

/** Normalise un article Firestore (champs manquants, ordre, jeu inconnu). */
export const normalizeHelpArticle = (raw = {}) => ({
  question: typeof raw.question === "string" ? raw.question : "",
  answer: typeof raw.answer === "string" ? raw.answer : "",
  questionEn: typeof raw.questionEn === "string" ? raw.questionEn : "",
  answerEn: typeof raw.answerEn === "string" ? raw.answerEn : "",
  category: HELP_CATEGORY_IDS.includes(raw.category) ? raw.category : "account",
  game: HELP_GAMES.includes(raw.game) ? raw.game : "all",
  published: raw.published !== false,
  order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 999,
});

/** Tri d'affichage : catégorie, puis ordre, puis jeu. */
export const sortHelpArticles = (list = []) =>
  [...list].sort((a, b) => {
    if (a.category !== b.category) {
      const ia = HELP_CATEGORY_IDS.indexOf(a.category);
      const ib = HELP_CATEGORY_IDS.indexOf(b.category);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }
    if (a.order !== b.order) return a.order - b.order;
    return (a.game || "").localeCompare(b.game || "");
  });