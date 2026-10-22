import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  Copy,
  KeyRound,
  QrCode,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { GAMES, ROLES } from "../../lib/constants";
import { useRosters } from "../../hooks/useRosters";
import {
  INVITATION_ROLES,
  INVITATION_STATUS,
  INVITATION_TTL_DAYS,
  expiresAt,
  generateInviteToken,
  invitationUrl,
  isInvitationExpired,
  makeInvitationQr,
} from "../../lib/invitations";
import {
  PERMISSION_GROUPS,
  ROLE_PERMISSIONS,
  normalizePermissions,
  resolvePermissions,
} from "../../lib/permissions";
import { logAdminAction } from "../../lib/notify";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

const fmtDate = (value, lang) => {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(lang === "en" ? "en-US" : "fr-FR", { dateStyle: "short", timeStyle: "short" })
    : "—";
};

const copyText = async (text, success = "Lien copié") => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error(text);
  }
};

export const AdminTeam = () => {
  const { user, displayName, isOfficial, can, role: myRole } = useAuth();
  const { t, lang } = useLang();
  const { rostersForGame, gameHasRosters } = useRosters();
  const canManage = can("team.manage");

  const [users, setUsers] = useState([]);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedUid, setSelectedUid] = useState(null);
  const [draftRole, setDraftRole] = useState("visitor");
  const [draftPermissions, setDraftPermissions] = useState([]);
  const [draftGame, setDraftGame] = useState("");
  const [draftRoster, setDraftRoster] = useState("");

  const [invite, setInvite] = useState({ role: "player", note: "", email: "", days: 7, permissions: [] });
  // Le rôle `bureau` ne peut être attribué que par un membre du bureau : les
  // règles Firestore refusent l'écriture, l'UI ne doit donc pas le proposer.
  const canGrantBureau = isOfficial || myRole === "bureau";
  const assignableRoles = ROLES.filter((value) => value !== "bureau" || canGrantBureau || value === draftRole);
  const assignableInviteRoles = INVITATION_ROLES.filter((value) => value !== "bureau" || canGrantBureau || value === invite.role);
  const [invitations, setInvitations] = useState([]);
  const [qrUrls, setQrUrls] = useState({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    return onSnapshot(
      collection(db, "users"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""));
        setUsers(list);
      },
      (err) => {
        console.error("users", err);
        setError(true);
      },
    );
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    return onSnapshot(
      collection(db, "invitations"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setInvitations(list);
      },
      (err) => console.error("invitations", err),
    );
  }, [canManage]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => [u.displayName, u.email, u.role, u.game, u.roster]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)));
  }, [users, query]);

  const selected = users.find((u) => u.id === selectedUid) || null;
  const selectedIsOfficial = !!selected && (selected.official === true || selected.id === user?.uid && isOfficial);

  useEffect(() => {
    if (!selected) return;
    setDraftRole(selected.role || "visitor");
    setDraftPermissions(normalizePermissions(selected.permissions || []));
    setDraftGame(selected.game || "");
    setDraftRoster(selected.roster || "");
  }, [selectedUid]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultsForRole = ROLE_PERMISSIONS[draftRole] || [];
  const effectivePreview = resolvePermissions({ role: draftRole, permissions: draftPermissions, official: selectedIsOfficial });

  const togglePermission = (permission) => {
    if (defaultsForRole.includes(permission)) return; // héritée du rôle
    setDraftPermissions((prev) => (
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    ));
  };

  const saveUser = async () => {
    if (!selected || !canManage) return;
    if (draftRole === "visitor" && draftPermissions.length > 0) {
      toast.error("Un visiteur ne peut pas recevoir de permissions administratives.");
      return;
    }
    try {
      await updateDoc(doc(db, "users", selected.id), {
        role: draftRole,
        permissions: normalizePermissions(draftPermissions),
        game: draftGame || null,
        roster: draftRole === "visitor" ? null : draftRoster || null,
        updatedAt: serverTimestamp(),
      });
      await logAdminAction({
        action: "user_permissions_updated",
        label: selected.displayName || selected.email || selected.id,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "users", id: selected.id },
        details: { role: draftRole, permissions: draftPermissions },
      });
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const setOfficial = async (official) => {
    if (!selected || !isOfficial) return;
    try {
      await updateDoc(doc(db, "users", selected.id), { official, updatedAt: serverTimestamp() });
      await logAdminAction({
        action: official ? "user_made_official" : "user_official_removed",
        label: selected.displayName || selected.email || selected.id,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "users", id: selected.id },
      });
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const createInvitation = async (event) => {
    event.preventDefault();
    if (!canManage) return;
    setCreating(true);
    try {
      const token = generateInviteToken();
      const payload = {
        role: invite.role,
        permissions: normalizePermissions(invite.permissions),
        note: invite.note.trim().slice(0, 160),
        email: invite.email.trim().slice(0, 160),
        status: INVITATION_STATUS.PENDING,
        expiresAt: Timestamp.fromDate(expiresAt(new Date(), invite.days)),
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
        createdByName: displayName || "",
      };
      // Le jeton EST l'identifiant du document : l'URL et le QR code sont
      // donc connus avant l'écriture.
      await setDoc(doc(db, "invitations", token), payload);
      await logAdminAction({
        action: "staff_invitation_created",
        label: payload.note || payload.email || payload.role,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "invitations", id: "pending" },
        details: { role: payload.role, permissions: payload.permissions },
      });
      const url = invitationUrl(token);
      setInvite({ role: "player", note: "", email: "", days: 7, permissions: [] });
      if (url) {
        try {
          const qr = await makeInvitationQr(url);
          setQrUrls((prev) => ({ ...prev, [token]: qr }));
        } catch (err) {
          console.error("qr", err);
        }
        await copyText(url, "Invitation créée — lien copié");
      }
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
    setCreating(false);
  };

  const loadQr = async (invitation) => {
    const url = invitationUrl(invitation.id);
    if (!url) return;
    try {
      const qr = await makeInvitationQr(url);
      setQrUrls((prev) => ({ ...prev, [invitation.id]: qr }));
    } catch (err) {
      console.error(err);
      toast.error("QR code indisponible");
    }
  };

  const revoke = async (invitation) => {
    try {
      await updateDoc(doc(db, "invitations", invitation.id), { status: INVITATION_STATUS.REVOKED, revokedAt: serverTimestamp() });
      toast.success("Invitation révoquée");
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const removeInvite = async (invitation) => {
    try {
      await deleteDoc(doc(db, "invitations", invitation.id));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  if (!canManage) {
    return <p className="text-sm text-[#c8c8c8]">La permission « Équipe & invitations » est requise.</p>;
  }

  return (
    <div className="space-y-8" data-testid="admin-team">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">Équipe & permissions</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50">
            Rôles, permissions par fonctionnalité et invitations par lien ou QR code — sans éditer chaque compte à la main.
          </p>
        </div>
        <label className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c8c8c8]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un membre…" className={`${inputCls} pl-9`} data-testid="admin-team-search" />
        </label>
      </div>

      {error && <p className="text-sm text-red-300">Lecture des comptes refusée : vérifiez la permission <code>team.manage</code> et les règles Firestore.</p>}

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 border border-white/10 bg-[#141414] max-h-[560px] overflow-y-auto" data-testid="admin-team-list">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <Users size={14} className="text-[#D8CA82]" />
            <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">{filtered.length} compte(s)</p>
          </div>
          {filtered.map((u) => (
            <button key={u.id} onClick={() => setSelectedUid(u.id)} data-testid={`admin-team-user-${u.id}`}
              className={`w-full text-left px-4 py-3 border-b border-white/5 ${selectedUid === u.id ? "bg-[#D8CA82]/10 border-l-2 border-l-[#D8CA82]" : "hover:bg-white/5"}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#f7f7f7] truncate flex-1">{u.displayName || u.email || u.id}</span>
                {(u.official === true || (u.id === user?.uid && isOfficial)) && <ShieldCheck size={13} className="text-[#D8CA82] shrink-0" />}
              </div>
              <p className="text-[11px] text-[#c8c8c8] truncate">
                {t(`admin.role.${u.role || "visitor"}`)}
                {u.game ? ` · ${u.game}` : ""}
                {u.roster ? ` · ${u.roster}` : ""}
              </p>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-[#c8c8c8] px-4 py-6">Aucun compte trouvé.</p>}
        </div>

        <div className="lg:col-span-8 border border-white/10 bg-[#1A1A1A] p-5 space-y-4">
          {!selected ? (
            <p className="text-sm text-[#c8c8c8]">Sélectionnez un compte pour modifier son rôle et ses permissions.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="font-display text-sm text-[#D8CA82] uppercase tracking-widest truncate">{selected.displayName || selected.email || selected.id}</p>
                  <p className="text-[11px] text-[#c8c8c8] truncate">{selected.email || selected.id}</p>
                </div>
                {isOfficial && (
                  <label className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#c8c8c8] border border-[#D8CA82]/30 px-2 py-1.5">
                    <input type="checkbox" checked={selected.official === true} onChange={(e) => setOfficial(e.target.checked)}
                      className="accent-[#D8CA82] h-3.5 w-3.5" data-testid="admin-team-official" />
                    Compte officiel
                  </label>
                )}
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
                  Rôle
                  <select value={draftRole} onChange={(e) => setDraftRole(e.target.value)} className={`${inputCls} mt-1`} data-testid="admin-team-role">
                    {assignableRoles.map((role) => <option key={role} value={role}>{t(`admin.role.${role}`)}</option>)}
                  </select>
                </label>
                <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
                  Jeu
                  <select value={draftGame} onChange={(e) => { setDraftGame(e.target.value); setDraftRoster(""); }} className={`${inputCls} mt-1`} data-testid="admin-team-game">
                    <option value="">—</option>
                    {GAMES.map((game) => <option key={game} value={game}>{game}</option>)}
                  </select>
                </label>
                <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
                  Roster
                  <select value={draftRoster} onChange={(e) => setDraftRoster(e.target.value)} disabled={!gameHasRosters(draftGame)} className={`${inputCls} mt-1 disabled:opacity-40`} data-testid="admin-team-roster">
                    <option value="">—</option>
                    {rostersForGame(draftGame).map((roster) => <option key={roster} value={roster}>{roster}</option>)}
                  </select>
                </label>
              </div>

              <div className="border-t border-white/10 pt-4 space-y-4" data-testid="admin-team-permissions">
                <div className="flex items-center gap-2">
                  <KeyRound size={14} className="text-[#D8CA82]" />
                  <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">Permissions effectives : {effectivePreview.length}</p>
                </div>
                {PERMISSION_GROUPS.map((group) => (
                  <fieldset key={group.id}>
                    <legend className="text-[10px] uppercase tracking-widest text-[#D8CA82] mb-2">{group.label}</legend>
                    <div className="grid sm:grid-cols-2 gap-1.5">
                      {group.permissions.map((permission) => {
                        const inherited = defaultsForRole.includes(permission);
                        const checked = inherited || draftPermissions.includes(permission);
                        return (
                          <label key={permission.id}
                            title={inherited ? "Héritée du rôle — décochez en changeant de rôle" : permission.id}
                            className={`inline-flex items-center gap-2 border px-2.5 py-1.5 text-[11px] cursor-pointer ${checked ? "border-[#D8CA82]/50 text-[#f7f7f7]" : "border-white/10 text-[#c8c8c8]"} ${inherited ? "opacity-80" : ""}`}>
                            <input type="checkbox" checked={checked} disabled={inherited} onChange={() => togglePermission(permission.id)}
                              className="accent-[#D8CA82] h-3.5 w-3.5" data-testid={`admin-team-perm-${permission.id}`} />
                            <span className="flex-1">{permission.label}</span>
                            {inherited && <span className="text-[9px] uppercase tracking-widest text-[#D8CA82]/70">rôle</span>}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>

              <div className="flex items-center gap-3 flex-wrap border-t border-white/10 pt-4">
                <button onClick={saveUser} disabled={!canManage} data-testid="admin-team-save"
                  className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-6 py-3 disabled:opacity-40">
                  Enregistrer
                </button>
                <button onClick={() => { setDraftRole(selected.role || "visitor"); setDraftPermissions([]); }}
                  className="text-[10px] uppercase tracking-widest text-[#c8c8c8] hover:text-[#D8CA82]">
                  Réinitialiser aux permissions du rôle
                </button>
                {draftPermissions.length > 0 && (
                  <span className="text-[10px] uppercase tracking-widest text-[#D8CA82]">+{draftPermissions.length} permission(s) fine(s)</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 border-t border-white/10 pt-8">
        <form onSubmit={createInvitation} className="lg:col-span-5 border border-white/10 bg-[#1A1A1A] p-5 space-y-3" data-testid="admin-invite-form">
          <div className="flex items-center gap-2">
            <UserPlus size={15} className="text-[#D8CA82]" />
            <p className="font-display text-sm uppercase tracking-[0.25em] text-[#D8CA82]">Inviter un membre</p>
          </div>
          <p className="text-xs text-[#c8c8c8]">
            Le lien (et son QR code) applique le rôle et les permissions à la connexion. Jeton à usage unique, expirant.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
              Rôle
              <select value={invite.role} onChange={(e) => setInvite((prev) => ({ ...prev, role: e.target.value }))} className={`${inputCls} mt-1`} data-testid="admin-invite-role">
                {assignableInviteRoles.map((role) => <option key={role} value={role}>{t(`admin.role.${role}`)}</option>)}
              </select>
            </label>
            <label className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
              Validité
              <select value={invite.days} onChange={(e) => setInvite((prev) => ({ ...prev, days: Number(e.target.value) }))} className={`${inputCls} mt-1`} data-testid="admin-invite-days">
                {INVITATION_TTL_DAYS.map((days) => <option key={days} value={days}>{days} jour(s)</option>)}
              </select>
            </label>
          </div>
          <input value={invite.email} onChange={(e) => setInvite((prev) => ({ ...prev, email: e.target.value }))} type="email" placeholder="Email du destinataire (recommandé)" className={inputCls} data-testid="admin-invite-email" />
          <input value={invite.note} onChange={(e) => setInvite((prev) => ({ ...prev, note: e.target.value }))} placeholder="Note interne (ex. « Nouveau coach RL »)" className={inputCls} data-testid="admin-invite-note" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8] mb-2">Permissions additionnelles</p>
            <div className="grid sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
              {PERMISSION_GROUPS.flatMap((group) => group.permissions).map((permission) => (
                <label key={permission.id} className="inline-flex items-center gap-2 text-[11px] text-[#c8c8c8] border border-white/10 px-2 py-1">
                  <input type="checkbox"
                    checked={invite.permissions.includes(permission.id)}
                    onChange={() => setInvite((prev) => ({
                      ...prev,
                      permissions: prev.permissions.includes(permission.id)
                        ? prev.permissions.filter((p) => p !== permission.id)
                        : [...prev.permissions, permission.id],
                    }))}
                    className="accent-[#D8CA82] h-3.5 w-3.5" />
                  {permission.label}
                </label>
              ))}
            </div>
          </div>
          <button type="submit" disabled={creating} data-testid="admin-invite-create"
            className="inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-3 disabled:opacity-40">
            <UserPlus size={13} /> {creating ? "Création…" : "Créer l'invitation"}
          </button>
        </form>

        <div className="lg:col-span-7 space-y-2" data-testid="admin-invite-list">
          <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">Invitations ({invitations.length})</p>
          {invitations.length === 0 && <p className="text-sm text-[#c8c8c8]">Aucune invitation.</p>}
          {invitations.map((invitation) => {
            const expired = isInvitationExpired(invitation);
            const url = invitationUrl(invitation.id);
            return (
              <div key={invitation.id} className="border border-white/10 bg-[#141414] p-3 space-y-2" data-testid={`admin-invite-${invitation.id}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${
                    invitation.status === INVITATION_STATUS.ACCEPTED
                      ? "text-emerald-300 border-emerald-300/40"
                      : expired || invitation.status === INVITATION_STATUS.REVOKED
                        ? "text-[#c8c8c8] border-white/20"
                        : "text-[#D8CA82] border-[#D8CA82]/50"
                  }`}>
                    {invitation.status === INVITATION_STATUS.ACCEPTED ? "acceptée" : expired ? "expirée" : invitation.status === INVITATION_STATUS.REVOKED ? "révoquée" : "en attente"}
                  </span>
                  <span className="text-[11px] text-[#f7f7f7]/70">{t(`admin.role.${invitation.role}`)}</span>
                  {invitation.note && <span className="text-[11px] text-[#c8c8c8] truncate">{invitation.note}</span>}
                  <span className="ml-auto text-[10px] text-[#c8c8c8]">exp. {fmtDate(invitation.expiresAt, lang)}</span>
                </div>
                {invitation.email && <p className="text-[11px] text-[#c8c8c8]">Destinataire : {invitation.email}</p>}
                <div className="flex items-center gap-3 flex-wrap">
                  {url && (
                    <>
                      <button onClick={() => copyText(url)} className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#D8CA82] hover:underline" data-testid={`admin-invite-copy-${invitation.id}`}>
                        <Copy size={11} /> Lien
                      </button>
                      <button onClick={() => loadQr(invitation)} className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#D8CA82] hover:underline" data-testid={`admin-invite-qr-${invitation.id}`}>
                        <QrCode size={11} /> QR
                      </button>
                    </>
                  )}
                  {invitation.status === INVITATION_STATUS.PENDING && !expired && (
                    <button onClick={() => revoke(invitation)} className="text-[10px] uppercase tracking-widest text-orange-300/80 hover:text-orange-300">Révoquer</button>
                  )}
                  <button onClick={() => removeInvite(invitation)} className="ml-auto text-red-400/70 hover:text-red-400" aria-label="Supprimer l'invitation" data-testid={`admin-invite-delete-${invitation.id}`}>
                    <Trash2 size={12} />
                  </button>
                </div>
                {qrUrls[invitation.id] && (
                  <img src={qrUrls[invitation.id]} alt={`QR code d'invitation ${invitation.id.slice(0, 8)}`} className="w-40 h-40 border border-white/10 bg-[#f7f7f7] p-1" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
