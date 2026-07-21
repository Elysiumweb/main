import React from "react";

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
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#111111] text-[#f7f7f7] flex flex-col items-center justify-center p-8">
          <img src="/brand/logo-vertical-gold.png" alt="Elysium" className="w-48 mb-8 gold-glow" />
          <h1 className="font-display font-black text-2xl text-[#D8CA82] uppercase tracking-widest mb-4">Oups, une erreur est survenue</h1>
          <p className="text-[#f7f7f7]/60 text-center max-w-xl mb-6">
            L'application a rencontré un problème. Vérifiez la console pour plus de détails.
            Si vous êtes sur Vercel, assurez-vous que les variables d'environnement Firebase sont configurées.
          </p>
          <pre className="bg-[#1A1A1A] border border-white/10 p-4 text-xs text-red-300 max-w-2xl w-full overflow-auto">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button onClick={() => window.location.reload()} className="mt-6 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3">
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
