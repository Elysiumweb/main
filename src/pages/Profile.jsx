import { useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { updateProfile, sendEmailVerification, sendPasswordResetEmail, deleteUser, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { collection, doc, getDocs, query, setDoc, where, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { BadgeCheck, MailWarning, KeyRound, Trash2, Download } from "lucide-react";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { gameHasRosters } from "../lib/constants";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { ImageUpload } from "../components/ImageUpload";
import { MfaTotpPanel } from "../components/MfaTotpPanel";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "../components/ui/alert-dialog";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export default function Profile() {
  const { user, profile, loading, role, game, roster, isOfficial } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [pseudo, setPseudo] = useState(profile?.displayName || user?.displayName || "");
  const [photo, setPhoto] = useState(profile?.photoURL || "");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[#f7f7f7]/40">{t("common.loading")}</div>;
  if (!user && deleting) return <Navigate to="/" replace />;
  if (!user) return <Navigate to="/connexion" replace state={{ from: location }} />;

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

  const changePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.next.length < 8) { toast.error("Le nouveau mot de passe doit contenir au moins 8 caractères."); return; }
    if (passwordForm.next !== passwordForm.confirm) { toast.error("Les mots de passe ne correspondent pas."); return; }
    setPasswordBusy(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, passwordForm.current);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, passwordForm.next);
      setPasswordForm({ current: "", next: "", confirm: "" });
      toast.success("Mot de passe mis à jour.");
    } catch (err) {
      console.error(err);
      toast.error(err.code === "auth/wrong-password" || err.code === "auth/invalid-credential" ? "Ancien mot de passe incorrect." : t("common.error"));
    }
    setPasswordBusy(false);
  };

  const toJson = (value) => {
    if (!value) return value;
    if (value.toDate) return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(toJson);
    if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
    return value;
  };

  const exportAccountData = async () => {
    setExporting(true);
    try {
      const supportSnap = await getDocs(query(collection(db, "supportThreads"), where("uid", "==", user.uid)));
      const recruitSnap = await getDocs(query(collection(db, "recruitThreads"), where("uid", "==", user.uid)));
      const collectThreads = async (snap, collectionName) => Promise.all(snap.docs.map(async (d) => {
        const messages = await getDocs(collection(db, collectionName, d.id, "messages"));
        return { id: d.id, ...toJson(d.data()), messages: messages.docs.map((m) => ({ id: m.id, ...toJson(m.data()) })) };
      }));
      const payload = {
        exportedAt: new Date().toISOString(),
        account: { uid: user.uid, email: user.email, displayName: user.displayName, emailVerified: user.emailVerified, providers: user.providerData.map((p) => p.providerId) },
        profile: toJson(profile || {}),
        supportTickets: await collectThreads(supportSnap, "supportThreads"),
        applications: await collectThreads(recruitSnap, "recruitThreads"),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `elysium-donnees-${user.uid}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export JSON généré.");
    } catch (err) {
      console.error(err);
      toast.error("Export impossible pour le moment.");
    }
    setExporting(false);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await setDoc(doc(db, "accountDeletionRequests", user.uid), {
        uid: user.uid,
        email: user.email || "",
        status: "requested",
        requestedAt: serverTimestamp(),
      }, { merge: true });
      await deleteUser(auth.currentUser);
      toast.success("Suppression du compte lancée. Les données associées vont être purgées.");
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
        <PageBreadcrumb items={[{ label: t("nav.profile") }]} />
        <div>
          <h1 className="font-display font-black text-4xl sm:text-5xl text-[#f7f7f7] uppercase" data-testid="profile-title">{t("profile.title")}</h1>
          <p className="text-[#D8CA82] text-sm uppercase tracking-[0.3em] mt-3" data-testid="profile-role">
            {isOfficial ? "Compte officiel" : t(`admin.role.${role}`)}{game ? ` · ${game}` : ""}{roster ? ` · ${roster}` : ""}
          </p>
          {gameHasRosters(game) && (
            <p className="text-[#f7f7f7]/40 text-xs uppercase tracking-[0.2em] mt-1" data-testid="profile-roster">
              {t("profile.roster")} : {roster || t("profile.roster.none")}
            </p>
          )}
        </div>

        <div className="border border-white/10 bg-[#1A1A1A] p-6 space-y-3" data-testid="profile-email-status">
          <p className="text-sm text-[#c8c8c8]">{user.email}</p>
          {isPassword && (user.emailVerified ? (
            <p className="text-sm text-emerald-300 flex items-center gap-2"><BadgeCheck size={15} aria-hidden="true" /> {t("profile.emailVerified")}</p>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-sm text-orange-300 flex items-center gap-2"><MailWarning size={15} aria-hidden="true" /> {t("profile.emailNotVerified")}</p>
              <button onClick={resendVerify} className="text-xs uppercase tracking-widest text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]" data-testid="profile-resend-btn">
                {t("profile.resend")}
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={save} className="border border-white/10 bg-[#1A1A1A] p-6 space-y-5" data-testid="profile-form">
          <div>
            <label htmlFor="profile-pseudo" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("login.pseudo")}</label>
            <input id="profile-pseudo" value={pseudo} onChange={(e) => setPseudo(e.target.value)} required autoComplete="username" className={inputCls} data-testid="profile-pseudo-input" />
          </div>
          <div>
            <label htmlFor="profile-photo" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("profile.photo")}</label>
            <ImageUpload value={photo} onChange={setPhoto} folder="avatars" maxWidth={800} testId="profile-photo-upload" />
            {photo && (
              <img src={photo} alt="" className="mt-3 h-20 w-20 object-cover border border-[#D8CA82]/40" data-testid="profile-photo-preview" />
            )}
          </div>
          <button type="submit" disabled={busy} data-testid="profile-save-btn"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 disabled:opacity-50 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow motion-reduce:transition-none">
            {t("notes.save")}
          </button>
        </form>

        <MfaTotpPanel />

        <div className="border border-white/10 bg-[#1A1A1A] p-6 space-y-4" data-testid="profile-export-panel">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">Exporter mes données</p>
          <p className="text-xs text-[#c8c8c8] leading-relaxed">Téléchargez un fichier JSON contenant votre profil, vos tickets support et vos candidatures.</p>
          <button type="button" onClick={exportAccountData} disabled={exporting} data-testid="profile-export-data-btn"
            className="border border-white/25 text-[#c8c8c8] text-xs uppercase tracking-widest px-5 py-3 inline-flex items-center gap-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors disabled:opacity-50">
            <Download size={14} aria-hidden="true" /> Exporter en JSON
          </button>
        </div>

        {isPassword && (
          <div className="border border-white/10 bg-[#1A1A1A] p-6 space-y-5" data-testid="profile-password-panel">
            <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">Changer mon mot de passe</p>
            <form onSubmit={changePassword} className="space-y-4" data-testid="profile-password-form">
              <div>
                <label htmlFor="profile-current-password" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">Ancien mot de passe</label>
                <input id="profile-current-password" type="password" value={passwordForm.current} onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))} required autoComplete="current-password" className={inputCls} data-testid="profile-current-password" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="profile-new-password" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">Nouveau mot de passe</label>
                  <input id="profile-new-password" type="password" value={passwordForm.next} onChange={(e) => setPasswordForm((f) => ({ ...f, next: e.target.value }))} required minLength={8} autoComplete="new-password" className={inputCls} data-testid="profile-new-password" />
                </div>
                <div>
                  <label htmlFor="profile-confirm-password" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">Confirmer</label>
                  <input id="profile-confirm-password" type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))} required minLength={8} autoComplete="new-password" className={inputCls} data-testid="profile-confirm-password" />
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button type="submit" disabled={passwordBusy} data-testid="profile-change-password-btn" className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-3 disabled:opacity-50 inline-flex items-center gap-2">
                  <KeyRound size={14} aria-hidden="true" /> Mettre à jour
                </button>
                <button type="button" onClick={resetPassword} data-testid="profile-reset-password-btn"
                  className="border border-white/25 text-[#c8c8c8] text-xs uppercase tracking-widest px-5 py-3 flex items-center gap-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
                  Envoyer un lien de réinitialisation
                </button>
              </div>
            </form>
          </div>
        )}

        {deleting && (
          <div className="border border-orange-300/40 bg-orange-300/5 p-6" data-testid="profile-deletion-pending">
            <p className="font-display text-sm uppercase tracking-[0.3em] text-orange-200 mb-2">Suppression en cours</p>
            <p className="text-xs text-[#c8c8c8]">Votre compte Auth est en cours de suppression. Une Cloud Function purge ensuite les tickets, candidatures, notes, notifications et messages associés.</p>
          </div>
        )}

        <div className="border border-red-300/40 bg-[#1A1A1A] p-6">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-red-300 mb-4">{t("profile.danger")}</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button data-testid="profile-delete-btn"
                className="border border-red-300/50 text-red-300 text-xs uppercase tracking-widest px-5 py-3 flex items-center gap-2 hover:bg-red-300/10 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
                <Trash2 size={14} aria-hidden="true" /> {t("profile.delete")}
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
