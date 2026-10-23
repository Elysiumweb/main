import { useState } from "react";
import { toast } from "sonner";
import { Link2, Check } from "lucide-react";
import { useLang } from "../lib/i18n";

const SHARE_URL = (network, url, text) => {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text || "");
  switch (network) {
    case "x":
      return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "whatsapp":
      return `https://wa.me/?text=${t ? `${t}%20` : ""}${u}`;
    default:
      return "";
  }
};

const NETWORKS = [
  { key: "x", label: "X", icon: "x", className: "hover:border-[#f7f7f7] hover:text-[#f7f7f7]" },
  { key: "facebook", label: "Facebook", icon: "facebook", className: "hover:border-[#1877F2] hover:text-[#1877F2]" },
  { key: "whatsapp", label: "WhatsApp", icon: "whatsapp", className: "hover:border-[#25D366] hover:text-[#25D366]" },
];

const BrandGlyph = ({ name, size = 16 }) => {
  const p = { width: size, height: size, fill: "currentColor", viewBox: "0 0 24 24", "aria-hidden": true };
  if (name === "x") {
    return <svg {...p}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>;
  }
  if (name === "facebook") {
    return <svg {...p}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>;
  }
  if (name === "whatsapp") {
    return <svg {...p}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>;
  }
  return null;
};

/**
 * Boutons de partage (X, Facebook, WhatsApp, copie du lien).
 * Utilisé sur les articles et les matchs.
 */
export const ShareButtons = ({ url, text, title, testId = "share-buttons", compact = false }) => {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("playerpage.copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid={testId} role="group" aria-label={title || t("playerpage.share")}>
      <span className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] mr-1">
        {t("share.label")}
      </span>
      {NETWORKS.map((n) => (
        <a
          key={n.key}
          href={SHARE_URL(n.key, url, text)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Partager sur ${n.label} (ouvre dans un nouvel onglet)`}
          title={n.label}
          data-testid={`${testId}-${n.key}`}
          className={`border border-white/15 text-[#f7f7f7]/60 p-2 hover:bg-white/5 transition-colors ${n.className} focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] ${compact ? "p-1.5" : ""}`}
        >
          <BrandGlyph name={n.icon} size={compact ? 13 : 15} />
        </a>
      ))}
      <button
        onClick={copy}
        aria-label={t("playerpage.share")}
        title={t("playerpage.share")}
        data-testid={`${testId}-copy`}
        className={`border border-white/15 text-[#f7f7f7]/60 p-2 hover:bg-white/5 hover:text-[#D8CA82] transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] ${compact ? "p-1.5" : ""}`}
      >
        {copied ? <Check size={compact ? 13 : 15} className="text-emerald-300" aria-hidden="true" /> : <Link2 size={compact ? 13 : 15} aria-hidden="true" />}
      </button>
    </div>
  );
};
