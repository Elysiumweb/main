import React from "react";
import { captureException } from "../lib/sentry";
import { useLang } from "../lib/i18n";

const BoundaryFallback = ({ error }) => {
  const lang = useLang();
  // Défensif : si l'erreur vient du provider de langue lui-même, on garde un
  // fallback fonctionnel sans t().
  const t = lang?.t || ((key) => key);
  return (
    <div className="min-h-screen bg-[#111111] text-[#f7f7f7] flex flex-col items-center justify-center p-8">
      <img src="/brand/logo-vertical-gold.png" alt="Elysium" className="w-48 mb-8 gold-glow" />
      <h1 className="font-display font-black text-2xl text-[#D8CA82] uppercase tracking-widest mb-4">
        {t("error.boundary.title")}
      </h1>
      <p className="text-tertiary-token text-center max-w-xl mb-6">
        {t("error.boundary.desc")}
      </p>
      <pre className="bg-[#1A1A1A] border border-white/10 p-4 text-xs text-red-300 max-w-2xl w-full overflow-auto">
        {error?.message || String(error)}
      </pre>
      <button onClick={() => window.location.reload()} className="mt-6 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3">
        {t("error.boundary.reload")}
      </button>
    </div>
  );
};

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
      return <BoundaryFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
