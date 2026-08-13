import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { readStoredTotpSecret, verifyTotp } from "../lib/totp";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export const MfaChallenge = () => {
  const { user, profile, mfaPending, confirmMfaSession, logout } = useAuth() || {};
  const { t } = useLang();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!user || !mfaPending) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const secret = readStoredTotpSecret(profile);
      if (!secret) {
        setError(t("mfa.challenge.noSecret"));
        setBusy(false);
        return;
      }
      const ok = await verifyTotp(secret, code);
      if (!ok) {
        setError(t("mfa.challenge.invalidCode"));
        setBusy(false);
        return;
      }
      confirmMfaSession?.();
      toast.success(t("mfa.challenge.verified"));
    } catch (err) {
      console.error(err);
      setError(err?.message || t("mfa.challenge.unavailable"));
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-[#111111]/95 flex items-center justify-center px-4" data-testid="mfa-challenge-overlay">
      <div className="w-full max-w-md border border-white/10 bg-[#1A1A1A] p-8 space-y-5">
        <ShieldCheck className="text-[#D8CA82] mx-auto" size={28} aria-hidden="true" />
        <div className="text-center">
          <h2 className="font-display text-lg uppercase tracking-[0.25em] text-[#f7f7f7]">{t("mfa.challenge.title")}</h2>
          <p className="text-xs text-tertiary-token mt-3 leading-relaxed">{t("mfa.challenge.desc")}</p>
        </div>
        {error && <p className="form-error text-center" role="alert">{error}</p>}
        <form onSubmit={submit} className="space-y-4" data-testid="login-mfa-form">
          <div>
            <label htmlFor="session-mfa-code" className="text-xs uppercase tracking-[0.2em] text-tertiary-token block mb-2">{t("mfa.challenge.codeLabel")}</label>
            <input
              id="session-mfa-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={6}
              className={inputCls}
              data-testid="login-mfa-code-input"
            />
          </div>
          <button type="submit" disabled={busy || code.length < 6} data-testid="login-mfa-submit"
            className="w-full bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm py-3 disabled:opacity-50">
            {t("mfa.challenge.submit")}
          </button>
        </form>
        <button type="button" onClick={() => logout?.()} className="w-full text-xs uppercase tracking-widest text-tertiary-token hover:text-[#D8CA82]">
          {t("mfa.challenge.logout")}
        </button>
      </div>
    </div>
  );
};
