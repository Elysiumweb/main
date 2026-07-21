import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { updateProfile, sendEmailVerification, sendPasswordResetEmail, deleteUser } from "firebase/auth";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { toast } from "sonner";
import { BadgeCheck, MailWarning, KeyRound, Trash2 } from "lucide-react";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "../components/ui/alert-dialog";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export default function Profile() {
  const { user, profile, loading, role, game, isOfficial } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [pseudo, setPseudo] = useState(profile?.displayName || user?.displayName || "");
  const [photo, setPhoto] = useState(profile?.photoURL || "");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[#f7f7f7]/40">{t("common.loading")}</div>;
  if (!user && deleting) return <Navigate to="/" replace />;
  if (!user) return <Navigate to="/connexion" replace />;

  const isPassword = user.providerData?.some((p) => p.providerId === "password");

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await setDoc(doc(db, "users", user.uid), { displayName: pseudo.trim(), photoURL: photo.trim() }, { merge: true });
      await updateProfile(auth.currentUser, { displayName: pseudo.trim(), photoURL: photo.trim() || null });
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
    setBusy(false);
  };

  const resendVerify = async () => {
    try { await sendEmailVerification(auth.currentUser); toast.success(t("profile.verifySent")); }
    catch (e) { toast.error(e.code === "auth/too-many-requests" ? t("verify.tooMany") : t("common.error")); }
  };

  const resetPassword = async () => {
    try { await sendPasswordResetEmail(auth, user.email); toast.success(t("login.resetSent")); }
    catch { toast.error(t("common.error")); }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      try { await deleteDoc(doc(db, "users", user.uid)); } catch (e) { console.error("users doc delete", e); }
      await deleteUser(auth.currentUser);
      toast.success(t("common.saved"));
      navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      setDeleting(false);
      toast.error(err.code === "auth/requires-recent-login" ? t("profile.deleteRecent") : t("common.error"));
    }
  };

  return (
    <div className="min-h-[70vh] bg-[#111111] py-16 px-4">
      <div className="max-w-2xl mx-auto space-y-10">
        <div>
          <h1 className="font-display font-black text-4xl sm:text-5xl text-[#f7f7f7] uppercase" data-testid="profile-title">{t("profile.title")}</h1>
          <p className="text-[#D8CA82] text-sm uppercase tracking-[0.3em] mt-3" data-testid="profile-role">
            {isOfficial ? "Compte officiel" : t(`admin.role.${role}`)}{game ? ` · ${game}` : ""}
          </p>
        </div>

        <div className="border border-white/10 bg-[#1A1A1A] p-6 space-y-3" data-testid="profile-email-status">
          <p className="text-sm text-[#f7f7f7]/70">{user.email}</p>
          {isPassword && (user.emailVerified ? (
            <p className="text-sm text-emerald-400 flex items-center gap-2"><BadgeCheck size={15} /> {t("profile.emailVerified")}</p>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-sm text-orange-300 flex items-center gap-2"><MailWarning size={15} /> {t("profile.emailNotVerified")}</p>
              <button onClick={resendVerify} className="text-xs uppercase tracking-widest text-[#D8CA82] hover:underline" data-testid="profile-resend-btn">
                {t("profile.resend")}
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={save} className="border border-white/10 bg-[#1A1A1A] p-6 space-y-5" data-testid="profile-form">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("login.pseudo")}</label>
            <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} required className={inputCls} data-testid="profile-pseudo-input" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("profile.photo")}</label>
            <input value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://..." className={inputCls} data-testid="profile-photo-input" />
          </div>
          <button type="submit" disabled={busy} data-testid="profile-save-btn"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 disabled:opacity-50 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
            {t("notes.save")}
          </button>
        </form>

        {isPassword && (
          <button onClick={resetPassword} data-testid="profile-reset-password-btn"
            className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-5 py-3 flex items-center gap-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">
            <KeyRound size={14} /> {t("profile.resetPassword")}
          </button>
        )}

        <div className="border border-red-400/30 bg-[#1A1A1A] p-6">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-red-400 mb-4">{t("profile.danger")}</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button data-testid="profile-delete-btn"
                className="border border-red-400/50 text-red-400 text-xs uppercase tracking-widest px-5 py-3 flex items-center gap-2 hover:bg-red-400/10 transition-colors">
                <Trash2 size={14} /> {t("profile.delete")}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#1A1A1A] border border-white/10 rounded-none" data-testid="profile-delete-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-[#f7f7f7]">{t("profile.deleteTitle")}</AlertDialogTitle>
                <AlertDialogDescription className="text-[#f7f7f7]/60">{t("profile.deleteText")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-none bg-transparent border-white/25 text-[#f7f7f7]" data-testid="profile-delete-cancel">{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAccount} className="rounded-none bg-red-500 hover:bg-red-600 text-white" data-testid="profile-delete-confirm">
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
