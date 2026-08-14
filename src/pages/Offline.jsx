import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Home, RefreshCw, WifiOff } from "lucide-react";
import { useLang } from "../lib/i18n";
import { Button } from "../components/ui/button";

/**
 * Page de repli hors-ligne.
 *
 * Le service worker la met en cache à l'installation et la sert pour toute
 * navigation qui échoue faute de réseau (au lieu de l'erreur réseau du
 * navigateur). Elle se recharge automatiquement dès que la connexion revient.
 */
export default function Offline() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const retry = () => {
    // On repart sur l'URL demandée à l'origine si le SW nous l'a transmise.
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    if (from && from.startsWith("/")) {
      window.location.replace(from);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    window.location.reload();
  };

  return (
    <div className="min-h-[70vh] bg-[#111111] flex flex-col justify-center">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <div className="max-w-3xl mx-auto text-center" data-testid="offline-page">
            <WifiOff className="mx-auto text-[#D8CA82] mb-6" size={48} aria-hidden="true" />
            <p className="font-display text-[#D8CA82] text-xs uppercase tracking-[0.5em] mb-4">
              {t("offline.badge")}
            </p>
            <h1 className="font-display font-black text-4xl sm:text-6xl text-[#f7f7f7] uppercase">
              {t("offline.title")}
            </h1>
            <p className="text-[#c8c8c8] mt-6 max-w-2xl mx-auto leading-relaxed">
              {t("offline.desc")}
            </p>
            {online && (
              <p className="text-[#D8CA82] mt-4 text-sm" role="status" data-testid="offline-back-online">
                {t("offline.backOnline")}
              </p>
            )}
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button variant="gold" size="md" onClick={retry} data-testid="offline-retry">
                <RefreshCw size={16} aria-hidden="true" /> {t("offline.retry")}
              </Button>
              <Button variant="outline" size="md" asChild>
                <Link to="/" data-testid="offline-home">
                  <Home size={16} aria-hidden="true" /> {t("offline.home")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
