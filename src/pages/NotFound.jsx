import { Link } from "react-router-dom";
import { ArrowLeft, Home, SearchX } from "lucide-react";
import { useLang } from "../lib/i18n";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Button } from "../components/ui/button";

export default function NotFound() {
  const { t } = useLang();

  return (
    <div className="min-h-[70vh] bg-[#111111] flex flex-col justify-center">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("notfound.badge") }]} />
          <div className="max-w-3xl mx-auto text-center" data-testid="not-found-page">
            <SearchX className="mx-auto text-[#D8CA82] mb-6" size={48} aria-hidden="true" />
            <p className="font-display text-[#D8CA82] text-xs uppercase tracking-[0.5em] mb-4">
              {t("notfound.badge")}
            </p>
            <h1 className="font-display font-black text-4xl sm:text-6xl text-[#f7f7f7] uppercase">
              {t("notfound.title")}
            </h1>
            <p className="text-[#c8c8c8] mt-6 max-w-2xl mx-auto leading-relaxed">
              {t("notfound.desc")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button variant="gold" size="md" asChild>
                <Link to="/" data-testid="not-found-home">
                  <Home size={16} aria-hidden="true" /> {t("nav.home")}
                </Link>
              </Button>
              <Button variant="outline" size="md" asChild>
                <Link to="/resultats" data-testid="not-found-results">
                  <ArrowLeft size={16} aria-hidden="true" /> {t("notfound.results")}
                </Link>
              </Button>
              <Button variant="outline" size="md" asChild>
                <Link to="/recrutement" data-testid="not-found-recruitment">
                  {t("nav.recruitment")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
