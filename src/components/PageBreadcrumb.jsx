import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { useLang } from "../lib/i18n";

export const PageBreadcrumb = ({ items = [], className = "" }) => {
  const { t } = useLang();

  return (
    <nav aria-label="Breadcrumb" className={`mb-5 flex items-center gap-2 font-label text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground flex-wrap ${className}`} data-testid="page-breadcrumb">
      <Link to="/" className="flex items-center gap-1 hover:text-primary transition-colors" title={t("nav.home")}>
        <Home size={13} />
        <span className="hidden sm:inline">{t("nav.home")}</span>
      </Link>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} className="flex items-center gap-2">
            <ChevronRight size={12} className="text-muted-foreground" />
            {isLast || !item.to ? (
              <span className="text-primary font-semibold truncate max-w-[200px] sm:max-w-md" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link to={item.to} className="hover:text-primary transition-colors truncate max-w-[150px] sm:max-w-xs">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
};
