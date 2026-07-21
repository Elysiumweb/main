import { useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { toast } from "sonner";
import { MailWarning, X } from "lucide-react";
import { auth } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";

export const VerifyEmailBanner = () => {
  const { user } = useAuth();
  const { t } = useLang();
  const [hidden, setHidden] = useState(false);
  const isPassword = user?.providerData?.some((p) => p.providerId === "password");
  if (!user || user.emailVerified || !isPassword || hidden) return null;

  const resend = async () => {
    try { await sendEmailVerification(auth.currentUser); toast.success(t("profile.verifySent")); }
    catch (e) { toast.error(e.code === "auth/too-many-requests" ? t("verify.tooMany") : t("common.error")); }
  };

  return (
    <div className="bg-[#D8CA82]/10 border-b border-[#D8CA82]/30 px-4 py-2 flex items-center gap-3 text-sm" data-testid="verify-email-banner">
      <MailWarning size={15} className="text-[#D8CA82] shrink-0" />
      <span className="text-[#f7f7f7]/80 flex-1">{t("verify.banner")}</span>
      <button onClick={resend} className="text-[#D8CA82] text-xs uppercase tracking-widest hover:underline" data-testid="verify-resend-btn">
        {t("verify.resend")}
      </button>
      <button onClick={() => setHidden(true)} className="text-[#f7f7f7]/40 hover:text-[#f7f7f7]" data-testid="verify-dismiss-btn"><X size={14} /></button>
    </div>
  );
};
