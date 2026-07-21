import { useLang } from "../lib/i18n";

const H = ({ children }) => <h2 className="font-display text-base md:text-lg uppercase tracking-[0.2em] text-[#D8CA82] mt-10 mb-3">{children}</h2>;
const P = ({ children }) => <p className="text-[#f7f7f7]/70 leading-relaxed mb-3 text-sm sm:text-base">{children}</p>;

const CONTENT = {
  mentions: {
    titleKey: "legal.mentions",
    body: (
      <>
        <P>Le présent site est édité par l'équipe esport <strong>Elysium</strong> (ci-après « l'Éditeur »).</P>
        <H>Éditeur du site</H>
        <P>Elysium — Équipe esport française, éditée par l'association Elysium, association régie par la loi du 1er juillet 1901, dont le siège social est situé 22 Avenue Lamartine, 77380 Combs-la-Ville (numéro RNA en cours d'attribution auprès de la préfecture). Directeur de la publication : Nathan Martins, Président de l'association.</P>
        <P>Contact : via la page Support du site ou le serveur Discord officiel (https://discord.gg/RH3ZZkMJsw).</P>
        <H>Hébergement</H>
        <P>Le site est hébergé par Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis (vercel.com). Les données applicatives sont stockées par Google Firebase (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlande).</P>
        <H>Propriété intellectuelle</H>
        <P>L'ensemble des éléments du site (logos, charte graphique, textes, visuels Elysium) est la propriété exclusive de l'Éditeur. Toute reproduction ou représentation, totale ou partielle, sans autorisation écrite préalable est interdite.</P>
        <H>Responsabilité</H>
        <P>L'Éditeur s'efforce d'assurer l'exactitude des informations diffusées mais ne saurait être tenu responsable des erreurs, omissions ou indisponibilités du service.</P>
      </>
    ),
  },
  privacy: {
    titleKey: "legal.privacy",
    body: (
      <>
        <P>Cette politique décrit comment Elysium collecte et traite vos données personnelles, conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés.</P>
        <P>Responsable du traitement : l'association Elysium, dont le siège social est situé 22 Avenue Lamartine, 77380 Combs-la-Ville.</P>
        <H>Données collectées</H>
        <P>• Compte : email, pseudo, photo de profil (via Firebase Authentication — email/mot de passe ou Google).<br />• Support : sujet et description de votre demande, messages échangés.<br />• Candidature : pseudo, tranche d'âge, pays/fuseau horaire, expérience, liens vidéo, disponibilités, identifiant Discord.<br />• Espace joueur (membres) : messages, notes, planning, tableaux collaboratifs.</P>
        <H>Finalités et base légale</H>
        <P>Les données sont traitées pour : la gestion des comptes et l'authentification (exécution du contrat), le traitement des demandes de support et des candidatures (mesures précontractuelles / intérêt légitime), et le fonctionnement des espaces d'équipe (intérêt légitime).</P>
        <H>Destinataires</H>
        <P>Les demandes de support sont accessibles uniquement aux membres du bureau et au compte officiel. Les candidatures sont accessibles uniquement aux manageurs, aux membres du bureau et au compte officiel. Les données sont hébergées par Google Firebase.</P>
        <H>Durée de conservation</H>
        <P>Les données de compte sont conservées tant que le compte est actif. Les candidatures et demandes de support sont conservées au maximum 24 mois après leur clôture.</P>
        <H>Cookies</H>
        <P>Le site utilise uniquement des cookies et stockages locaux essentiels : session d'authentification Firebase, préférence de langue et choix de consentement. Aucun cookie publicitaire ou de suivi tiers n'est déposé.</P>
        <H>Vos droits</H>
        <P>Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et d'opposition. Vous pouvez supprimer votre compte à tout moment depuis la page « Mon profil ». Pour toute demande : contactez-nous via la page Support ou Discord. Vous pouvez également saisir la CNIL (cnil.fr).</P>
        <H>Mineurs</H>
        <P>Si vous avez moins de 15 ans, l'accord d'un titulaire de l'autorité parentale est requis pour créer un compte ou candidater.</P>
      </>
    ),
  },
  terms: {
    titleKey: "legal.terms",
    body: (
      <>
        <P>Les présentes conditions régissent l'utilisation du site Elysium. En créant un compte ou en naviguant sur le site, vous les acceptez.</P>
        <H>Accès au service</H>
        <P>Le site est accessible gratuitement. Certaines fonctionnalités (espace joueur, support, candidature) nécessitent un compte. Les rôles (joueur, manageur, membre du bureau) sont attribués exclusivement par le compte officiel de l'équipe.</P>
        <H>Comportement</H>
        <P>Vous vous engagez à ne pas publier de contenus illicites, haineux, diffamatoires ou portant atteinte aux droits de tiers dans les espaces de discussion, notes et tableaux. L'équipe se réserve le droit de supprimer tout contenu inapproprié et de suspendre les comptes concernés.</P>
        <H>Compte</H>
        <P>Vous êtes responsable de la confidentialité de vos identifiants. Vous pouvez supprimer votre compte à tout moment depuis la page « Mon profil ».</P>
        <H>Disponibilité</H>
        <P>Le service est fourni « en l'état ». Elysium ne garantit pas une disponibilité continue et peut faire évoluer le site à tout moment.</P>
        <H>Droit applicable</H>
        <P>Les présentes conditions sont soumises au droit français.</P>
      </>
    ),
  },
};

export default function LegalPage({ kind }) {
  const { t } = useLang();
  const c = CONTENT[kind];
  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-16 relative">
          <h1 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl text-[#f7f7f7] uppercase" data-testid={`legal-title-${kind}`}>{t(c.titleKey)}</h1>
        </div>
      </section>
      <section className="max-w-4xl mx-auto px-4 sm:px-8 py-12" data-testid={`legal-content-${kind}`}>
        {c.body}
        <p className="text-xs text-[#f7f7f7]/30 mt-12">Dernière mise à jour : juillet 2026</p>
      </section>
    </div>
  );
}
