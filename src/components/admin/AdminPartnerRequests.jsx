import { useEffect, useMemo, useState } from "react";
import { addDoc, arrayUnion, collection, doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { BriefcaseBusiness, Handshake, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { logAdminAction } from "../../lib/notify";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const splitLines = (value) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const joinLines = (value) => Array.isArray(value) ? value.join("\n") : "";
const EMPTY_KIT = { pdfUrl: "", updatedAtLabel: "", commercialName: "", commercialEmail: "partenariats@elysium-esport.fr", commercialPhone: "", metricsText: "", activationsText: "", regionsText: "", casesText: "" };

export const AdminPartnerRequests = () => {
  const { user, displayName } = useAuth();
  const { t, lang } = useLang();
  const [requests, setRequests] = useState([]);
  const [queryText, setQueryText] = useState("");
  const [contactDrafts, setContactDrafts] = useState({});
  const [kit, setKit] = useState(EMPTY_KIT);

  const statuses = [
    ["new", "Nouveau"], ["contacted", "Contacté"], ["won", "Gagné"], ["lost", "Perdu"], ["rejected", "Refusé"],
  ];
  const statusLabel = (id) => statuses.find(([value]) => value === (id || "new"))?.[1] || "Nouveau";
  const fmtDate = (value) => value?.toDate ? value.toDate().toLocaleString(lang === "en" ? "en-US" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—";

  useEffect(() => onSnapshot(collection(db, "partner_requests"), (snapshot) => {
    const list = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setRequests(list);
  }, console.error), []);

  useEffect(() => onSnapshot(doc(db, "sponsorKit", "current"), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    setKit({ pdfUrl: data.pdfUrl || "", updatedAtLabel: data.updatedAtLabel || "", commercialName: data.commercialName || "", commercialEmail: data.commercialEmail || "", commercialPhone: data.commercialPhone || "", metricsText: joinLines(data.metrics), activationsText: joinLines(data.activations), regionsText: joinLines(data.regions), casesText: joinLines(data.cases) });
  }, console.error), []);

  const filtered = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    return !needle ? requests : requests.filter((request) => [request.name, request.company, request.email, request.responsible, request.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle)));
  }, [requests, queryText]);

  const patch = async (request, changes, historyLabel) => {
    const update = { ...changes, updatedAt: serverTimestamp() };
    if (historyLabel) update.contactHistory = arrayUnion({ note: historyLabel, type: "system", by: displayName || user?.email || "Staff", at: Timestamp.now() });
    await updateDoc(doc(db, "partner_requests", request.id), update);
  };

  const publishPartner = async (request) => {
    if (request.publishedPartnerId) return request.publishedPartnerId;
    const ref = await addDoc(collection(db, "partners"), { name: request.company || request.name || "Partenaire", website: "", logoUrl: "", tier: "bronze", order: 99, publishedAt: serverTimestamp(), sourceRequestId: request.id });
    await updateDoc(doc(db, "partner_requests", request.id), { publishedPartnerId: ref.id, publishedAt: serverTimestamp() });
    return ref.id;
  };

  const setStatus = async (request, status) => {
    try {
      await patch(request, { status }, `Statut : ${statusLabel(request.status)} → ${statusLabel(status)}`);
      if (status === "won") await publishPartner(request);
      await logAdminAction({ action: "partner_request_status_changed", label: `${request.company || request.name} → ${statusLabel(status)}`, actor: { uid: user?.uid, name: displayName, email: user?.email }, target: { collection: "partner_requests", id: request.id }, details: { previousStatus: request.status || "new", status } });
      toast.success(status === "won" ? "Demande gagnée et partenaire publié." : t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const savePipeline = async (request, event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(request, { responsible: data.get("responsible") || "", internalNotes: data.get("internalNotes") || "", nextFollowUp: data.get("nextFollowUp") || "" }, "Fiche commerciale mise à jour");
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const addContact = async (request) => {
    const note = (contactDrafts[request.id] || "").trim();
    if (!note) return;
    try {
      await updateDoc(doc(db, "partner_requests", request.id), { status: request.status === "new" || !request.status ? "contacted" : request.status, contactHistory: arrayUnion({ note, type: "contact", by: displayName || user?.email || "Staff", at: Timestamp.now() }), lastContactAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setContactDrafts((current) => ({ ...current, [request.id]: "" }));
      toast.success("Contact ajouté à l’historique.");
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const saveKit = async (event) => {
    event.preventDefault();
    try {
      await setDoc(doc(db, "sponsorKit", "current"), { pdfUrl: kit.pdfUrl.trim(), updatedAtLabel: kit.updatedAtLabel.trim(), commercialName: kit.commercialName.trim(), commercialEmail: kit.commercialEmail.trim(), commercialPhone: kit.commercialPhone.trim(), metrics: splitLines(kit.metricsText), activations: splitLines(kit.activationsText), regions: splitLines(kit.regionsText), cases: splitLines(kit.casesText), updatedAt: serverTimestamp() }, { merge: true });
      toast.success("Dossier sponsor public mis à jour.");
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  return <div className="space-y-10" data-testid="admin-partner-requests">
    <form onSubmit={saveKit} className="border border-[#D8CA82]/25 bg-[#1A1A1A] p-6 space-y-4" data-testid="admin-sponsor-kit">
      <div className="flex items-center gap-3"><BriefcaseBusiness className="text-[#D8CA82]" size={18} /><div><h2 className="font-display uppercase tracking-[0.25em] text-[#f7f7f7]">Dossier sponsor public</h2><p className="text-xs text-[#f7f7f7]/45 mt-1">Chaque chiffre doit inclure sa date et sa source, par exemple « 42 k vues · juil. 2026 · Meta Insights ».</p></div></div>
      <div className="grid md:grid-cols-2 gap-3"><input className={inputCls} type="url" value={kit.pdfUrl} onChange={(e) => setKit({ ...kit, pdfUrl: e.target.value })} placeholder="URL du dossier PDF maintenu" /><input className={inputCls} value={kit.updatedAtLabel} onChange={(e) => setKit({ ...kit, updatedAtLabel: e.target.value })} placeholder="Données mises à jour le…" /><input className={inputCls} value={kit.commercialName} onChange={(e) => setKit({ ...kit, commercialName: e.target.value })} placeholder="Contact commercial" /><input className={inputCls} type="email" value={kit.commercialEmail} onChange={(e) => setKit({ ...kit, commercialEmail: e.target.value })} placeholder="Email commercial" /></div>
      <div className="grid md:grid-cols-2 gap-3"><textarea className={inputCls} rows={4} value={kit.metricsText} onChange={(e) => setKit({ ...kit, metricsText: e.target.value })} placeholder="Audience datée et sourcée — une métrique par ligne" /><textarea className={inputCls} rows={4} value={kit.activationsText} onChange={(e) => setKit({ ...kit, activationsText: e.target.value })} placeholder="Activations possibles — une par ligne" /><textarea className={inputCls} rows={4} value={kit.regionsText} onChange={(e) => setKit({ ...kit, regionsText: e.target.value })} placeholder="Zones géographiques — une par ligne" /><textarea className={inputCls} rows={4} value={kit.casesText} onChange={(e) => setKit({ ...kit, casesText: e.target.value })} placeholder="Cas concrets — un par ligne" /></div>
      <button className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-3">Publier le dossier</button>
    </form>

    <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between"><div><div className="flex items-center gap-3 mb-2"><Handshake className="text-[#D8CA82]" size={18} /><h2 className="font-display text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">Pipeline partenariat</h2></div><p className="text-sm text-[#f7f7f7]/50">Responsables, relances, notes et historique des contacts.</p></div><input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Rechercher" className={`${inputCls} sm:w-80`} /></div>

    <div className="grid gap-5">{filtered.map((request) => <article key={request.id} className="border border-white/10 bg-[#1A1A1A] p-5">
      <div className="flex flex-col lg:flex-row gap-4 justify-between"><div><p className="text-[10px] uppercase tracking-widest text-[#D8CA82]">{statusLabel(request.status)} · {fmtDate(request.createdAt)}</p><h3 className="font-display font-bold text-[#f7f7f7] mt-2 text-lg">{request.company || "Entreprise"}</h3><p className="text-sm text-[#f7f7f7]/55">{request.name} · <a className="text-[#D8CA82]" href={`mailto:${request.email}`}>{request.email}</a>{request.budget ? ` · ${request.budget}` : ""}</p></div><div className="flex gap-2"><select value={request.status || "new"} onChange={(e) => setStatus(request, e.target.value)} className={inputCls}>{statuses.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><a href={`mailto:${request.email}`} className="bg-[#D8CA82] text-[#111111] px-4 py-2.5 flex items-center"><Mail size={14} /></a></div></div>
      {request.message && <p className="mt-4 text-sm text-[#f7f7f7]/65 border-t border-white/10 pt-4 whitespace-pre-wrap">{request.message}</p>}
      <form onSubmit={(event) => savePipeline(request, event)} className="grid md:grid-cols-2 gap-3 mt-4 border-t border-white/10 pt-4"><input name="responsible" defaultValue={request.responsible || ""} placeholder="Responsable commercial" className={inputCls} /><input name="nextFollowUp" defaultValue={request.nextFollowUp || ""} type="date" aria-label="Prochaine relance" className={inputCls} /><textarea name="internalNotes" defaultValue={request.internalNotes || ""} rows={3} placeholder="Notes internes" className={`${inputCls} md:col-span-2`} /><button className="border border-[#D8CA82]/50 text-[#D8CA82] uppercase tracking-widest text-xs px-4 py-2 justify-self-start">Enregistrer la fiche</button></form>
      <div className="mt-4 border-t border-white/10 pt-4"><p className="text-xs uppercase tracking-widest text-[#f7f7f7]/45 mb-2">Historique des contacts</p><div className="space-y-1 mb-3">{(request.contactHistory || []).slice().reverse().map((entry, index) => <p key={`${entry.at?.seconds || index}-${index}`} className="text-xs text-[#f7f7f7]/55"><span className="text-[#D8CA82]">{entry.at?.toDate ? fmtDate(entry.at) : ""}</span> · {entry.by} — {entry.note}</p>)}</div><div className="flex gap-2"><input value={contactDrafts[request.id] || ""} onChange={(e) => setContactDrafts((current) => ({ ...current, [request.id]: e.target.value }))} className={inputCls} placeholder="Appel, email, rendez-vous…" /><button type="button" onClick={() => addContact(request)} className="border border-white/20 px-3 text-[#D8CA82]" aria-label="Ajouter un contact"><Plus size={16} /></button></div></div>
      {request.publishedPartnerId && <p className="mt-3 text-xs text-emerald-300">Partenaire publié automatiquement · ID {request.publishedPartnerId}</p>}
    </article>)}</div>
  </div>;
};
