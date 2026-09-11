import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where, updateDoc, doc } from "firebase/firestore";
import { toast } from "sonner";
import { ExternalLink, IdCard } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { GAMES } from "../lib/constants";
import { useRosters } from "../hooks/useRosters";
import { ImageUpload } from "./ImageUpload";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { pseudo: "", game: "EVA", roster: "", ingameRole: "", status: "player", photo: "", bio: "", rank: "", mmr: "", palmares: "", equipment: "", arrivalDate: "", previousTeams: "", x: "", twitch: "", instagram: "", youtube: "", tiktok: "" };

/**
 * La fiche joueur publique (/equipe/:id) est reliée au compte (`roster.uid`).
 * L'admin crée la fiche, puis le joueur modifie son contenu ici, depuis son
 * profil — à tout moment, sans passer par l'admin.
 */
export const PlayerCardEditor = () => {
  const { user } = useAuth();
  const { t } = useLang();
  const { rostersForGame, gameHasRosters } = useRosters();
  const [card, setCard] = useState(undefined); // undefined = chargement
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!user) { setCard(null); return; }
    return onSnapshot(
      query(collection(db, "roster"), where("uid", "==", user.uid)),
      (snap) => {
        const found = snap.docs.map((d) => ({ id: d.id, ...d.data() }))[0] || null;
        setCard(found);
        if (found) {
          setForm({
            pseudo: found.pseudo || "", game: found.game || "EVA", roster: found.roster || "",
            ingameRole: found.ingameRole || "", status: found.status || "player",
            photo: found.photo || "", bio: found.bio || "", rank: found.rank || "", mmr: found.mmr || "",
            palmares: found.palmares || "", equipment: found.equipment || "",
            arrivalDate: found.arrivalDate || "", previousTeams: found.previousTeams || "",
            x: found.socials?.x || "", twitch: found.socials?.twitch || "",
            instagram: found.socials?.instagram || "", youtube: found.socials?.youtube || "",
            tiktok: found.socials?.tiktok || "",
          });
        }
      },
      (err) => { console.error("player card", err); setCard(null); }
    );
  }, [user]);

  if (!user) return null;

  if (card === undefined) {
    return (
      <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="profile-card-loading">
        <p className="text-sm text-[#c8c8c8]">{t("common.loading")}</p>
      </div>
    );
  }

  if (card === null) {
    return (
      <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="profile-card-empty">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82] flex items-center gap-2">
          <IdCard size={15} aria-hidden="true" /> {t("profile.card.title")}
        </p>
        <p className="text-sm text-[#c8c8c8] mt-3 leading-relaxed">{t("profile.card.none")}</p>
      </div>
    );
  }

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { x, twitch, instagram, youtube, tiktok, ...rest } = form;
      // `uid` volontairement exclu : la liaison au compte est immuable.
      await updateDoc(doc(db, "roster", card.id), {
        ...rest,
        pseudo: rest.pseudo.trim(),
        roster: rest.roster || null,
        socials: { x, twitch, instagram, youtube, tiktok },
      });
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
    setBusy(false);
  };

  return (
    <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="profile-card-editor">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82] flex items-center gap-2">
          <IdCard size={15} aria-hidden="true" /> {t("profile.card.title")}
        </p>
        <Link to={`/equipe/${card.id}`} target="_blank" data-testid="profile-card-view-link"
          className="text-xs uppercase tracking-widest text-[#f7f7f7]/60 hover:text-[#D8CA82] flex items-center gap-1.5">
          <ExternalLink size={12} aria-hidden="true" /> {t("profile.card.viewPublic")}
        </Link>
      </div>
      <form onSubmit={save} className="space-y-4" data-testid="profile-card-form">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pcc-pseudo" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("login.pseudo")}</label>
            <input id="pcc-pseudo" value={form.pseudo} onChange={set("pseudo")} required maxLength={60} className={inputCls} data-testid="profile-card-pseudo" />
          </div>
          <div>
            <label htmlFor="pcc-ingameRole" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("profile.card.role")}</label>
            <input id="pcc-ingameRole" value={form.ingameRole} onChange={set("ingameRole")} maxLength={60} className={inputCls} data-testid="profile-card-role" />
          </div>
          <div>
            <label htmlFor="pcc-game" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("common.game")}</label>
            <select id="pcc-game" value={form.game} onChange={(e) => setForm((f) => ({ ...f, game: e.target.value, roster: "" }))} className={inputCls} data-testid="profile-card-game">
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {gameHasRosters(form.game) ? (
            <div>
              <label htmlFor="pcc-roster" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.roster")}</label>
              <select id="pcc-roster" value={form.roster} onChange={set("roster")} className={inputCls} data-testid="profile-card-roster">
                <option value="">—</option>
                {rostersForGame(form.game).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          ) : <div />}
          <div>
            <label htmlFor="pcc-status" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("profile.card.status")}</label>
            <select id="pcc-status" value={form.status} onChange={set("status")} className={inputCls} data-testid="profile-card-status">
              <option value="player">{t("team.status.player")}</option>
              <option value="sub">{t("team.status.sub")}</option>
              <option value="staff">{t("team.status.staff")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="pcc-arrival" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("playerpage.arrival")}</label>
            <input id="pcc-arrival" type="date" value={form.arrivalDate} onChange={set("arrivalDate")} className={inputCls} data-testid="profile-card-arrival" />
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("profile.card.photo")}</label>
          <ImageUpload value={form.photo} onChange={(url) => setForm((f) => ({ ...f, photo: url }))} folder="players" maxWidth={1200} testId="profile-card-photo-upload" />
        </div>
        <div>
          <label htmlFor="pcc-bio" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">Bio</label>
          <textarea id="pcc-bio" value={form.bio} onChange={set("bio")} placeholder={t("admin.roster.bioPlaceholder")} rows={3} className={inputCls} data-testid="profile-card-bio" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pcc-rank" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("playerpage.rank")}</label>
            <input id="pcc-rank" value={form.rank} onChange={set("rank")} placeholder={t("admin.roster.rankPlaceholder")} className={inputCls} data-testid="profile-card-rank" />
          </div>
          <div>
            <label htmlFor="pcc-mmr" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("playerpage.mmr")}</label>
            <input id="pcc-mmr" value={form.mmr} onChange={set("mmr")} placeholder={t("admin.roster.mmrPlaceholder")} className={inputCls} data-testid="profile-card-mmr" />
          </div>
        </div>
        <div>
          <label htmlFor="pcc-palmares" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("playerpage.palmares")}</label>
          <textarea id="pcc-palmares" value={form.palmares} onChange={set("palmares")} placeholder={t("admin.roster.palmaresPlaceholder")} rows={3} className={inputCls} data-testid="profile-card-palmares" />
        </div>
        <div>
          <label htmlFor="pcc-equipment" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("playerpage.equipment")}</label>
          <textarea id="pcc-equipment" value={form.equipment} onChange={set("equipment")} placeholder={t("admin.roster.equipmentPlaceholder")} rows={3} className={inputCls} data-testid="profile-card-equipment" />
        </div>
        <div>
          <label htmlFor="pcc-previous" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("playerpage.career")}</label>
          <textarea id="pcc-previous" value={form.previousTeams} onChange={set("previousTeams")} placeholder={t("admin.roster.previousTeamsPlaceholder")} rows={2} className={inputCls} data-testid="profile-card-previous" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] mb-2">{t("profile.card.socials")}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <input value={form.x} onChange={set("x")} placeholder="X (URL)" aria-label="X (URL)" className={inputCls} data-testid="profile-card-social-x" />
            <input value={form.twitch} onChange={set("twitch")} placeholder="Twitch (URL)" aria-label="Twitch (URL)" className={inputCls} data-testid="profile-card-social-twitch" />
            <input value={form.instagram} onChange={set("instagram")} placeholder="Instagram (URL)" aria-label="Instagram (URL)" className={inputCls} data-testid="profile-card-social-instagram" />
            <input value={form.youtube} onChange={set("youtube")} placeholder="YouTube (URL)" aria-label="YouTube (URL)" className={inputCls} data-testid="profile-card-social-youtube" />
            <input value={form.tiktok} onChange={set("tiktok")} placeholder="TikTok (URL)" aria-label="TikTok (URL)" className={inputCls} data-testid="profile-card-social-tiktok" />
          </div>
        </div>
        <button type="submit" disabled={busy} data-testid="profile-card-save-btn"
          className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 disabled:opacity-50 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
          {t("notes.save")}
        </button>
      </form>
    </div>
  );
};
