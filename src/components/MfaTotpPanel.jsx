import { useMemo, useState } from "react";
import { deleteField, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { mfaErrorMessage } from "../lib/mfa";
import { toQrDataUrl } from "../lib/qrDataUrl";
import { generateTotpSecret, markMfaSessionOk, totpOtpauthUrl, verifyTotp } from "../lib/totp";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export const MfaTotpPanel = () => {
  const { user, mfaEnrolled, requiresMfa, refreshMfa } = useAuth() || {};
  const [secret, setSecret] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [panelError, setPanelError] = useState("");

  const enrolling = !!secret;

  const accountLabel = useMemo(() => user?.email || user?.uid || "elysium", [user]);

  if (!user) return null;

  const startEnrollment = async () => {
    setPanelError("");
    setBusy(true);
    try {
      const nextSecret = generateTotpSecret();
      if (!nextSecret) throw new Error("Impossible de générer une clé TOTP.");
      const otpauth = totpOtpauthUrl(nextSecret, accountLabel);
      setSecret(nextSecret);
      setQrUrl(otpauth);
      try {
        setQrImage(await toQrDataUrl(otpauth));
      } catch (err) {
        console.warn("qr local", err);
        setQrImage("");
      }
    } catch (err) {
      console.error(err);
      const msg = mfaErrorMessage(err);
      setPanelError(msg);
      toast.error(msg);
    }
    setBusy(false);
  };

  const confirmEnrollment = async (e) => {
    e.preventDefault();
    if (!secret) return;
    setBusy(true);
    try {
      setPanelError("");
      const ok = await verifyTotp(secret, code);
      if (!ok) {
        const msg = "Code invalide ou expiré. Réessayez avec un nouveau code.";
        setPanelError(msg);
        toast.error(msg);
        setBusy(false);
        return;
      }
      // Stocké sur users/{uid} : déjà autorisé par les règles Spark existantes.
      await setDoc(doc(db, "users", user.uid), {
        totpEnabled: true,
        totp: {
          secret,
          displayName: "Application d'authentification",
          enrolledAt: serverTimestamp(),
        },
      }, { merge: true });
      markMfaSessionOk(user.uid);
      await refreshMfa?.();
      setSecret("");
      setQrUrl("");
      setQrImage("");
      setCode("");
      toast.success("Double authentification activée.");
    } catch (err) {
      console.error(err);
      const msg = mfaErrorMessage(err);
      setPanelError(msg);
      toast.error(msg);
    }
    setBusy(false);
  };

  const removeFactor = async () => {
    setBusy(true);
    try {
      await setDoc(doc(db, "users", user.uid), { totpEnabled: false, totp: deleteField() }, { merge: true });
      await refreshMfa?.();
      toast.success("Second facteur retiré.");
    } catch (err) {
      console.error(err);
      toast.error(mfaErrorMessage(err));
    }
    setBusy(false);
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = secret;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    setCopied(true);
    toast.success("Clé secrète copiée.");
    window.setTimeout(() => setCopied(false), 2000);
  };

  const resetEnroll = () => {
    setSecret("");
    setQrUrl("");
    setQrImage("");
    setCode("");
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

      {panelError && (
        <p className="text-xs text-red-300 leading-relaxed" role="alert" data-testid="profile-mfa-error">{panelError}</p>
      )}

      {mfaEnrolled && !enrolling && (
        <div className="space-y-2" data-testid="profile-mfa-enabled">
          <div className="flex items-center justify-between gap-3 border border-white/10 bg-[#111111] px-3 py-2">
            <span className="text-sm text-emerald-300">Activée · Application d'authentification</span>
            <button type="button" disabled={busy} onClick={removeFactor} className="text-xs uppercase tracking-widest text-red-300 hover:text-red-200 disabled:opacity-50">
              Retirer
            </button>
          </div>
        </div>
      )}

      {!enrolling && !mfaEnrolled && (
        <button type="button" onClick={startEnrollment} disabled={busy} data-testid="profile-mfa-start"
          className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest px-5 py-3 hover:bg-[#D8CA82]/10 disabled:opacity-50">
          Activer la 2FA
        </button>
      )}

      {enrolling && (
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
                <code className="block flex-1 border border-white/10 bg-[#111111] p-3 text-xs text-[#f7f7f7] break-all" data-testid="profile-mfa-secret">{secret}</code>
                <button type="button" onClick={copySecret} data-testid="profile-mfa-copy-secret" className="border border-white/20 text-[#c8c8c8] p-3 hover:text-[#D8CA82]" aria-label="Copier la clé secrète">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              {qrUrl && (
                <a href={qrUrl} className="text-xs text-[#D8CA82] hover:underline">Ouvrir dans une application compatible</a>
              )}
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
