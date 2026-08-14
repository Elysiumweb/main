import React, { Suspense } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useLang } from "../lib/i18n";
import { LoadingState } from "./States";
import { captureException } from "../lib/sentry";

const RouteChunkError = ({ onRetry }) => {
  const { t } = useLang();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-24 px-6 text-center"
      data-testid="route-load-error"
      role="alert"
    >
      <WifiOff className="text-[#D8CA82]" size={32} aria-hidden="true" />
      <h1 className="font-display font-bold text-lg text-[#f7f7f7] uppercase tracking-widest">
        {t("route.loadError.title")}
      </h1>
      <p className="text-[#c8c8c8] max-w-md text-sm">
        {offline ? t("offline.desc") : t("route.loadError.desc")}
      </p>
      <button
        onClick={onRetry}
        data-testid="route-load-error-retry"
        className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest px-5 py-2.5 flex items-center gap-2 hover:bg-[#D8CA82]/10 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
      >
        <RefreshCw size={13} aria-hidden="true" /> {t("route.loadError.retry")}
      </button>
    </div>
  );
};

/**
 * Détecte les échecs de chargement d'un chunk `import()`.
 *
 * Les messages varient selon le navigateur et le bundler, d'où la liste de
 * motifs. On reste volontairement strict : toute autre erreur doit continuer
 * à remonter, sinon un vrai bug de rendu serait maquillé en « problème de
 * connexion » et le bouton « recharger » tournerait en boucle.
 */
export const isChunkLoadError = (error) => {
  if (!error) return false;
  if (error.name === "ChunkLoadError") return true;
  const message = String(error.message || "");
  return (
    /Loading chunk \d+ failed/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /'text\/html' is not a valid JavaScript MIME type/i.test(message)
  );
};

/**
 * Garde-fou autour des routes chargées par React.lazy.
 *
 * Un chunk peut échouer pour deux raisons courantes : l'utilisateur est hors
 * ligne et le chunk n'est pas en cache, ou un nouveau déploiement a remplacé
 * les fichiers hachés sous l'onglet resté ouvert. Sans ce garde-fou, l'erreur
 * remonte jusqu'à l'ErrorBoundary racine et affiche un écran technique.
 * Ici on propose un rechargement, qui récupère la nouvelle version.
 *
 * Les erreurs qui ne viennent pas d'un chunk sont relancées afin que
 * l'ErrorBoundary racine les traite (et les remonte à Sentry) normalement.
 */
export class RouteChunkBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error)) {
      captureException(error, { componentStack: info?.componentStack, scope: "route-chunk" });
    }
  }

  componentDidUpdate(prevProps) {
    // Une nouvelle navigation doit pouvoir réessayer un rendu propre.
    if (this.state.error && prevProps.routeKey !== this.props.routeKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      // Pas un chunk manquant : on laisse l'ErrorBoundary racine s'en charger.
      if (!isChunkLoadError(this.state.error)) throw this.state.error;
      return <RouteChunkError onRetry={() => window.location.reload()} />;
    }
    return (
      <Suspense fallback={<LoadingState testId="route-loading" />}>
        {this.props.children}
      </Suspense>
    );
  }
}
