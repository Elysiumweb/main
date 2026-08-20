import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { useLang } from "../lib/i18n";

export const PageBreadcrumb = ({ items = [] }) => {
  const { t } = useLang();

  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs uppercase tracking-widest text-[#f7f7f7]/50 flex-wrap" data-testid="page-breadcrumb">
      <Link to="/" className="flex items-center gap-1 hover:text-[#D8CA82] transition-colors" title={t("nav.home")}>
        <Home size={13} />
        <span className="hidden sm:inline">{t("nav.home")}</span>
      </Link>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} className="flex items-center gap-2">
            <ChevronRight size={12} className="text-[#c8c8c8]" />
            {isLast || !item.to ? (
              <span className="text-[#D8CA82] font-semibold truncate max-w-[200px] sm:max-w-md" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link to={item.to} className="hover:text-[#D8CA82] transition-colors truncate max-w-[150px] sm:max-w-xs">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
};
