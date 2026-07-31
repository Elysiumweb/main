import { Link } from "react-router-dom";
import { ArrowLeft, Home, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] bg-[#111111] flex items-center">
      <section className="max-w-4xl mx-auto px-4 sm:px-8 py-24 text-center" data-testid="not-found-page">
        <SearchX className="mx-auto text-[#D8CA82] mb-6" size={48} aria-hidden="true" />
        <p className="font-display text-[#D8CA82] text-xs uppercase tracking-[0.5em] mb-4">Erreur 404</p>
        <h1 className="font-display font-black text-4xl sm:text-6xl text-[#f7f7f7] uppercase">Page introuvable</h1>
        <p className="text-[#c8c8c8] mt-6 max-w-2xl mx-auto leading-relaxed">
          Cette route n'existe pas ou a été déplacée. Utilisez les liens ci-dessous pour retrouver les contenus Elysium.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link to="/" data-testid="not-found-home"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-6 py-3 inline-flex items-center gap-2 hover:shadow-[0_0_20px_rgba(216,202,130,0.35)] u-micro-shadow">
            <Home size={16} aria-hidden="true" /> Accueil
          </Link>
          <Link to="/resultats" data-testid="not-found-results"
            className="border border-white/20 text-[#f7f7f7] font-display uppercase tracking-widest text-sm px-6 py-3 inline-flex items-center gap-2 hover:border-[#D8CA82] hover:text-[#D8CA82] u-micro">
            <ArrowLeft size={16} aria-hidden="true" /> Voir les résultats
          </Link>
          <Link to="/recrutement" data-testid="not-found-recruitment"
            className="border border-white/20 text-[#f7f7f7] font-display uppercase tracking-widest text-sm px-6 py-3 hover:border-[#D8CA82] hover:text-[#D8CA82] u-micro">
            Recrutement
          </Link>
        </div>
      </section>
    </div>
  );
}
