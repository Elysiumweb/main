import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { functions } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { isInviteToken } from "../lib/invitations";

const ERROR_MESSAGES = {
  "not-found": "Cette invitation est introuvable ou a expiré.",
  "failed-precondition": "Cette invitation n'est plus valable (déjà utilisée, révoquée ou expirée).",
  "permission-denied": "Connectez-vous avec l'adresse email invitée pour accepter cette invitation.",
  unauthenticated: "Connectez-vous pour accepter l'invitation.",
  "invalid-argument": "Le lien d'invitation est invalide.",
};

const callRedeem = async (token) => {
  const fn = httpsCallable(functions, "redeemInvitation");
  const result = await fn({ token });
  return result.data;
};

export default function Invitation() {
  const { token } = useParams();
  const { user, loading, canAccessAdmin } = useAuth();
  const { t } = useLang();
  const location = useLocation();
  const [status, setStatus] = useState("idle"); // idle | sending | accepted | error
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isInviteToken(token)) {
      setStatus("error");
      setMessage(ERROR_MESSAGES["invalid-argument"]);
    }
  }, [token]);

  const accept = async () => {
    setStatus("sending");
    setMessage("");
    try {
      const data = await callRedeem(token);
      setResult(data || {});
      setStatus("accepted");
    } catch (err) {
      console.error(err);
      const code = err?.code?.replace("functions/", "") || "internal";
      setStatus("error");
      setMessage(ERROR_MESSAGES[code] || err?.message || "Impossible d'accepter l'invitation.");
    }
  };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 relative">
          <PageBreadcrumb items={[{ label: "Invitation" }]} />
          <h1 className="font-display font-black text-3xl sm:text-4xl text-[#f7f7f7] uppercase" data-testid="invitation-title">
            Invitation staff
          </h1>
          <p className="text-[#f7f7f7]/50 mt-3">
            Un membre de l'équipe vous invite à rejoindre l'organisation Elysium. Le rôle et les permissions seront appliqués à votre compte.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-8 py-12" data-testid="invitation-content">
        <div className="border border-[#D8CA82]/30 bg-[#1A1A1A] p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <KeyRound className="text-[#D8CA82]" size={20} />
            <p className="text-sm text-[#f7f7f7]/70">
              Jeton&nbsp;: <span className="font-mono text-[#D8CA82]">{token ? `${token.slice(0, 8)}…` : "—"}</span>
            </p>
          </div>

          {status === "accepted" ? (
            <div className="space-y-4" data-testid="invitation-success">
              <p className="inline-flex items-center gap-2 text-emerald-300">
                <CheckCircle2 size={18} /> Invitation acceptée
              </p>
              <p className="text-sm text-[#f7f7f7]/70">
                Votre compte a été mis à jour{result?.role ? ` (rôle : ${result.role})` : ""}. Les nouvelles permissions sont actives dès maintenant.
              </p>
              <div className="flex flex-wrap gap-3">
                {canAccessAdmin && (
                  <Link to="/admin" className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-3" data-testid="invitation-admin-link">
                    Ouvrir l'admin
                  </Link>
                )}
                <Link to="/espace-joueur" className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-5 py-3">
                  Espace joueur
                </Link>
              </div>
            </div>
          ) : loading ? (
            <p className="text-sm text-[#c8c8c8]">{t("common.loading")}</p>
          ) : !user ? (
            <div className="space-y-4" data-testid="invitation-login">
              <p className="text-sm text-[#f7f7f7]/70">
                Connectez-vous (ou créez un compte avec l'adresse email invitée) pour accepter cette invitation.
              </p>
              <Link
                to="/connexion"
                state={{ from: location }}
                className="inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-6 py-3"
                data-testid="invitation-login-link"
              >
                <ShieldCheck size={14} /> Se connecter
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[#f7f7f7]/70">
                Connecté en tant que <strong className="text-[#f7f7f7]">{user.email}</strong>. Vérifiez qu'il s'agit bien de l'adresse invitée.
              </p>
              {status === "error" && (
                <p className="border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" data-testid="invitation-error">
                  {message}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={accept}
                  disabled={status === "sending" || !isInviteToken(token)}
                  data-testid="invitation-accept"
                  className="inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-6 py-3 disabled:opacity-40"
                >
                  <ShieldCheck size={14} /> {status === "sending" ? "Vérification…" : "Accepter l'invitation"}
                </button>
                <Link to="/" className="border border-white/20 text-[#f7f7f7]/60 text-xs uppercase tracking-widest px-5 py-3">
                  Plus tard
                </Link>
              </div>
              <p className="text-xs text-[#c8c8c8]/70">
                L'acceptation est validée côté serveur : email, expiration et usage unique sont contrôlés par la Cloud Function.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
