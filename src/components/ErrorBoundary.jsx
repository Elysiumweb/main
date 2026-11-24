import React from "react";
import { captureException } from "../lib/sentry";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
    captureException(error, { componentStack: info?.componentStack });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-8">
          <img src="/brand/logo-vertical-gold.png" alt="Elysium" className="w-48 mb-8 gold-glow" />
          <h1 className="font-display font-black text-2xl text-primary uppercase tracking-widest mb-4">Oups, une erreur est survenue</h1>
          <p className="text-foreground/60 text-center max-w-xl mb-6">
            L'application a rencontré un problème. Vérifiez la console pour plus de détails.
            Si vous êtes sur Vercel, assurez-vous que les variables d'environnement Firebase sont configurées.
          </p>
          <pre className="bg-card border border-border/25 p-4 text-xs text-red-300 max-w-2xl w-full overflow-auto">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button onClick={() => window.location.reload()} className="mt-6 bg-gold text-primary-foreground font-display font-bold uppercase tracking-widest text-sm px-8 py-3">
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
