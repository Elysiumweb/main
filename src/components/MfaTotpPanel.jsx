import { useMemo, useState } from "react";
import {
  EmailAuthProvider,
  TotpMultiFactorGenerator,
  multiFactor,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
} from "firebase/auth";
import { toast } from "sonner";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { auth, googleProvider } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { mfaErrorMessage, userHasGoogle, userHasPassword } from "../lib/mfa";
import { toQrDataUrl } from "../lib/qrDataUrl";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export const MfaTotpPanel = () => {
  const { user, mfaEnrolled, requiresMfa, enrolledFactors = [], refreshMfa } = useAuth() || {};
  const [secret, setSecret] = useState(null);
  const [qrUrl, setQrUrl] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [needReauth, setNeedReauth] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const factors = enrolledFactors?.length ? enrolledFactors : [];
  const hasPassword = userHasPassword(user);
  const hasGoogle = userHasGoogle(user);
  const emailVerified = !!user?.emailVerified || hasGoogle;
  const deadline = useMemo(() => {
    if (!secret?.enrollmentCompletionDeadline) return "";
    const date = new Date(secret.enrollmentCompletionDeadline);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }, [secret]);

  if (!user) return null;

  const currentUser = () => auth.currentUser || user;

  const beginSecret = async () => {
    const active = currentUser();
    const session = await multiFactor(active).getSession();
    const nextSecret = await TotpMultiFactorGenerator.generateSecret(session);
    const otpauth = nextSecret.generateQrCodeUrl(active.email || active.uid, "Elysium Esport");
    setSecret(nextSecret);
    setQrUrl(otpauth);
    try {
      setQrImage(await toQrDataUrl(otpauth));
    } catch (err) {
      console.warn("qr local", err);
      setQrImage("");
    }
    setNeedReauth(false);
    setReauthPassword("");
  };

  const startEnrollment = async () => {
    if (!emailVerified) {
      toast.error(mfaErrorMessage({ code: "auth/unverified-email" }));
      return;
    }
    setBusy(true);
    try {
      await beginSecret();
    } catch (err) {
      console.error(err);
      if (err.code === "auth/requires-recent-login") {
        setNeedReauth(true);
        toast.error(mfaErrorMessage(err));
      } else {
        toast.error(mfaErrorMessage(err));
      }
    }
    setBusy(false);
  };

  const confirmReauth = async (e) => {
    e?.preventDefault?.();
    setBusy(true);
    try {
      const active = currentUser();
      if (hasPassword && reauthPassword) {
        const credential = EmailAuthProvider.credential(active.email, reauthPassword);
        await reauthenticateWithCredential(active, credential);
      } else if (hasGoogle) {
        await reauthenticateWithPopup(active, googleProvider);
      } else {
        toast.error("Reconnectez-vous depuis la page de connexion, puis réessayez.");
        setBusy(false);
        return;
      }
      await beginSecret();
      toast.success("Identité confirmée. Scannez le QR code.");
    } catch (err) {
      console.error(err);
      if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        toast.error(mfaErrorMessage(err));
      }
    }
    setBusy(false);
  };

  const confirmEnrollment = async (e) => {
    e.preventDefault();
    if (!secret) return;
    setBusy(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim());
      await multiFactor(currentUser()).enroll(assertion, "Application d'authentification");
      await refreshMfa?.();
      setSecret(null);
      setQrUrl("");
      setQrImage("");
      setCode("");
      toast.success("Double authentification activée.");
    } catch (err) {
      console.error(err);
      if (err.code === "auth/requires-recent-login") {
        setNeedReauth(true);
      }
      toast.error(mfaErrorMessage(err));
    }
    setBusy(false);
  };

  const removeFactor = async (factor) => {
    setBusy(true);
    try {
      await multiFactor(currentUser()).unenroll(factor);
      await refreshMfa?.();
      toast.success("Second facteur retiré.");
    } catch (err) {
      console.error(err);
      if (err.code === "auth/requires-recent-login" || err.code === "auth/user-token-expired") {
        setNeedReauth(true);
      }
      toast.error(mfaErrorMessage(err));
    }
    setBusy(false);
  };

  const copySecret = async () => {
    const key = secret?.secretKey;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = key;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    setCopied(true);
    toast.success("Clé secrète copiée.");
    window.setTimeout(() => setCopied(false), 2000);
  };

  const resendVerify = async () => {
    try {
      await sendEmailVerification(currentUser());
      toast.success("Email de vérification envoyé.");
    } catch (err) {
      toast.error(err.code === "auth/too-many-requests" ? "Un email vient d'être envoyé. Patientez un peu." : mfaErrorMessage(err));
    }
  };

  const resetEnroll = () => {
    setSecret(null);
    setQrUrl("");
    setQrImage("");
    setCode("");
    setNeedReauth(false);
    setReauthPassword("");
  };

  return (
    <div className={`border ${requiresMfa && !mfaEnrolled ? "border-orange-300/50 bg-orange-300/5" : "border-white/10 bg-[#1A1A1A]"} p-6 space-y-4`} data-testid="profile-mfa-panel">
      <div className="flex items-start gap-3">
        <ShieldCheck className="text-[#D8CA82] shrink-0" size={20} aria-hidden="true" />
        <div>
          <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">Double authentification (TOTP)</p>
          <p className="text-xs text-[#c8c8c8] mt-2 leading-relaxed">
            {requiresMfa
              ? "Obligatoire pour les comptes officiels et bureau. Utilisez Google Authenticator, 1Password, Bitwarden ou une application TOTP compatible."
              : "Ajoutez un code temporaire depuis une application d'authentification pour renforcer votre compte."}
          </p>
        </div>
      </div>

      {!emailVerified && (
        <div className="border border-orange-300/40 bg-orange-300/5 px-3 py-3 space-y-2" data-testid="profile-mfa-verify-email">
          <p className="text-xs text-orange-200 leading-relaxed">Firebase exige un email vérifié avant d'activer la 2FA. Vérifiez votre boîte mail, puis rechargez cette page.</p>
          <button type="button" onClick={resendVerify} className="text-xs uppercase tracking-widest text-[#D8CA82] hover:underline">
            Renvoyer l'email de vérification
          </button>
        </div>
      )}

      {mfaEnrolled && (
        <div className="space-y-2" data-testid="profile-mfa-enabled">
          {factors.map((factor) => (
            <div key={factor.uid} className="flex items-center justify-between gap-3 border border-white/10 bg-[#111111] px-3 py-2">
              <span className="text-sm text-emerald-300">Activée · {factor.displayName || "TOTP"}</span>
              <button type="button" disabled={busy} onClick={() => removeFactor(factor)} className="text-xs uppercase tracking-widest text-red-300 hover:text-red-200 disabled:opacity-50">
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}

      {needReauth && !secret && (
        <form onSubmit={confirmReauth} className="space-y-3 border border-white/10 bg-[#111111] p-4" data-testid="profile-mfa-reauth-form">
          <p className="text-xs text-[#c8c8c8] leading-relaxed">Confirmez votre identité pour configurer la 2FA — Firebase l'exige sur une session récente.</p>
          {hasPassword && (
            <div>
              <label htmlFor="profile-mfa-reauth-password" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">Mot de passe actuel</label>
              <input
                id="profile-mfa-reauth-password"
                type="password"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                autoComplete="current-password"
                required={hasPassword}
                className={inputCls}
                data-testid="profile-mfa-reauth-password"
              />
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            {hasPassword && (
              <button type="submit" disabled={busy || !reauthPassword} data-testid="profile-mfa-reauth-submit" className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-3 disabled:opacity-50">
                Confirmer
              </button>
            )}
            {hasGoogle && (
              <button type="button" disabled={busy} onClick={() => confirmReauth({ preventDefault() {} })} data-testid="profile-mfa-reauth-google" className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest px-5 py-3 disabled:opacity-50">
                Confirmer avec Google
              </button>
            )}
            <button type="button" onClick={resetEnroll} className="border border-white/20 text-[#c8c8c8] text-xs uppercase tracking-widest px-5 py-3">
              Annuler
            </button>
          </div>
        </form>
      )}

      {!secret && !mfaEnrolled && !needReauth && (
        <button type="button" onClick={startEnrollment} disabled={busy || !emailVerified} data-testid="profile-mfa-start"
          className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest px-5 py-3 hover:bg-[#D8CA82]/10 disabled:opacity-50">
          Activer la 2FA
        </button>
      )}

      {secret && (
        <form onSubmit={confirmEnrollment} className="space-y-4" data-testid="profile-mfa-enroll-form">
          <div className="grid sm:grid-cols-[176px,1fr] gap-4 items-start">
            {qrImage ? (
              <img src={qrImage} alt="QR code TOTP" className="border border-white/10 bg-white p-2 w-44 h-44" data-testid="profile-mfa-qr" />
            ) : (
              <div className="border border-white/10 bg-[#111111] w-44 h-44 flex items-center justify-center p-3 text-center text-[11px] text-[#c8c8c8]">
                QR indisponible — copiez la clé ci-contre.
              </div>
            )}
            <div className="space-y-3">
              <p className="text-xs text-[#c8c8c8] leading-relaxed">Scannez le QR code ou copiez cette clé secrète dans votre application :</p>
              <div className="flex gap-2 items-start">
                <code className="block flex-1 border border-white/10 bg-[#111111] p-3 text-xs text-[#f7f7f7] break-all" data-testid="profile-mfa-secret">{secret.secretKey}</code>
                <button type="button" onClick={copySecret} data-testid="profile-mfa-copy-secret" className="border border-white/20 text-[#c8c8c8] p-3 hover:text-[#D8CA82]" aria-label="Copier la clé secrète">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              {qrUrl && (
                <a href={qrUrl} className="text-xs text-[#D8CA82] hover:underline">Ouvrir dans une application compatible</a>
              )}
              {deadline && <p className="text-[11px] text-[#c8c8c8]">Validez le code avant {deadline}.</p>}
            </div>
          </div>
          <div>
            <label htmlFor="profile-mfa-code" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">Code à 6 chiffres</label>
            <input id="profile-mfa-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} className={inputCls} data-testid="profile-mfa-code" />
          </div>
          <div className="flex gap-3 flex-wrap">
            <button type="submit" disabled={busy || code.length < 6} data-testid="profile-mfa-confirm" className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-3 disabled:opacity-50">
              Confirmer
            </button>
            <button type="button" onClick={resetEnroll} className="border border-white/20 text-[#c8c8c8] text-xs uppercase tracking-widest px-5 py-3">
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
