import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { getHoneypotProps, isHoneypotFilled, checkSessionRateLimit, rateLimitMessage } from "../lib/antiSpam";
import { callProtected, protectedErrorMessage } from "../lib/secureForms";
import { toast } from "sonner";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Handshake, Shield, Users, Lightbulb, Trophy, Mail, ExternalLink, Heart, Check, X } from "lucide-react";
import { DonateBlock } from "../components/DonateButton";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Button } from "../components/ui/button";

const values = [
  { key: "compete", icon: Trophy },
  { key: "integrity", icon: Shield },
  { key: "community", icon: Users },
  { key: "innovation", icon: Lightbulb },
];

const tiersOrder = ["gold", "silver", "bronze"];

const PartnerLogo = ({ src, name, className }) => {
  const [err, setErr] = useState(false);
  const safeName = (name || "Partenaire").trim();
  if (!src || err) {
    const initials = safeName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "?";
    return (
      <div
        role="img"
        aria-label={`Logo du partenaire indisponible : ${safeName}`}
        className={`${className} bg-[#0c0c0c] flex items-center justify-center text-[#a0a0a0] font-display tracking-widest text-sm uppercase border border-white/10`}
      >
        <span aria-hidden="true">{initials}</span>
      </div>
    );
  }
  return <img src={src} alt={`Logo du partenaire : ${safeName}`} onError={() => setErr(true)} className={`${className} object-contain`} />;
};

// Données EXACTES issues de l'Annexe 3 pages 15-16 - Convention ElyWalk Révision 2
const grille = {
  bronze: {
    label: "BRONZE",
    tarifRef: "196 € HT",
    tarif12: "196 € HT",
    engagement: "Sans engagement",
    renouvellement: "Mensuel",
    resiliation: "1 mois avant l'échéance du mois",
    offresActives: "1",
    dureeOffre: "Au choix du Partenaire, sans maximum",
    attractivite: "Faible",
    part: "75 % / 25 %",
    logoTwitch: false,
    elyCoins: false,
    affiches: false,
    affichesDetail: "",
    stand: false,
    miseEnAvant: false,
    invitations: false,
    invitationsDetail: "",
    maillots: false,
    maillotsDetail: "—",
    bandeElywalk: false,
    bandeSite: false,
    videos: false,
    videosDetail: "—",
    futursProjets: false,
    futursDetail: "—",
    nombreAdmis: "Illimité",
  },
  argent: {
    label: "ARGENT",
    tarifRef: "356 € HT",
    tarif12: "356 € HT",
    engagement: "3 mois minimum",
    renouvellement: "Par périodes de 3 mois",
    resiliation: "1 mois avant l'échéance de la période",
    offresActives: "5",
    dureeOffre: "Idem",
    attractivite: "Normal",
    part: "50 % / 50 %",
    logoTwitch: true,
    elyCoins: true,
    affiches: true,
    affichesDetail: "logo à chaque affiche",
    stand: false,
    miseEnAvant: false,
    invitations: false,
    invitationsDetail: "",
    maillots: false,
    maillotsDetail: "—",
    bandeElywalk: false,
    bandeSite: false,
    videos: false,
    videosDetail: "—",
    futursProjets: false,
    futursDetail: "—",
    nombreAdmis: "Illimité",
  },
  gold: {
    label: "GOLD",
    tarifRef: "676 € HT",
    tarif12: "676 € HT",
    engagement: "6 mois minimum",
    renouvellement: "Par périodes de 6 mois",
    resiliation: "1 mois avant l'échéance de la période",
    offresActives: "5",
    dureeOffre: "Idem",
    attractivite: "Élevé",
    part: "25 % / 75 %",
    logoTwitch: true,
    elyCoins: true,
    affiches: true,
    affichesDetail: "logo à chaque affiche",
    stand: true,
    miseEnAvant: true,
    invitations: true,
    invitationsDetail: "sans limite de nombre",
    maillots: false,
    maillotsDetail: "Non prévues (accord gracieux possible)",
    bandeElywalk: true,
    bandeSite: true,
    videos: true,
    videosDetail: "sans limite de nombre, 60 s max, montage au Partenaire",
    futursProjets: true,
    futursDetail: "selon supports disponibles",
    nombreAdmis: "Illimité, sous réserve de la restriction ou de la clôture de la catégorie (art. 12.3.3)",
  },
};

const rows = [
  { key: "ficheSite", label: "Fiche partenaire : site Elysium", type: "text", bronze: "✓", argent: "✓", gold: "✓" },
  { key: "ficheMap", label: "Fiche partenaire : map ElyWalk", type: "text", bronze: "✓", argent: "✓", gold: "✓" },
  { key: "offresActives", label: "Offres simultanément actives dans Elywalk", type: "text" },
  { key: "dureeOffre", label: "Durée de chaque offre", type: "text" },
  { key: "tarifRef", label: "Tarif mensuel de référence", type: "price" },
  { key: "tarif12", label: "Tarif mensuel pour un engagement de 12 mois", type: "price" },
  { key: "engagement", label: "Engagement", type: "text" },
  { key: "renouvellement", label: "Renouvellement", type: "text" },
  { key: "resiliation", label: "Résiliation", type: "text" },
  { key: "attractivite", label: "Niveau d'attractivité des offres", type: "text" },
  { key: "part", label: "Part d'Elysium / part de l'Utilisateur", type: "text" },
  { key: "logoTwitch", label: "Logo sur les streams Twitch", type: "bool" },
  { key: "elyCoins", label: "Retrait des ElyCoins en cartes cadeaux ou de réduction", type: "bool" },
  { key: "affiches", label: "Présence sur les affiches de communication", type: "boolDetail" },
  { key: "stand", label: "Stand autorisé à chaque évènement", type: "bool" },
  { key: "miseEnAvant", label: "Mise en avant du partenaire en évènement", type: "bool" },
  { key: "invitations", label: "Invitations ou places en évènement", type: "boolDetail" },
  { key: "maillots", label: "Logo sur les maillots", type: "boolDetailCustom" },
  { key: "bandeElywalk", label: "Bande publicitaire : Elywalk", type: "bool" },
  { key: "bandeSite", label: "Bande publicitaire : site Elysium", type: "bool" },
  { key: "videos", label: "Vidéos publicitaires dans Elywalk", type: "boolDetail" },
  { key: "futursProjets", label: "Présence sur les futurs projets numériques", type: "boolDetail" },
  { key: "nombreAdmis", label: "Nombre de partenaires admis", type: "textLong" },
];

export default function Partners() {
  const { t } = useLang();
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const formRef = useRef(null);
  const contactSectionRef = useRef(null);
  const [prefilled, setPrefilled] = useState({ budget: "", message: "" });

  useEffect(() => {
    setError(false); setPartners(null);
    const u = onSnapshot(collection(db, "partners"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setPartners(list);
    }, (e) => { console.error(e); setError(true); });
    return () => u();
  }, [retryKey]);

  const grouped = partners ? tiersOrder.map((tier) => ({
    tier,
    list: partners.filter((p) => (p.tier || "bronze") === tier),
  })).filter((g) => g.list.length > 0) : [];

  const scrollToContact = (tierKey) => {
    const mapTier = { bronze: "bronze", argent: "argent", gold: "gold" };
    const g = grille[mapTier[tierKey] || tierKey];
    if (!g) return;
    setPrefilled({
      budget: `${g.label} — ${g.tarifRef} / mois`,
      message: `Bonjour Elysium,\n\nNous sommes intéressés par le palier ${g.label} (${g.tarifRef} / mois, engagement ${g.engagement}).\n\nPrésentation entreprise : \nObjectifs : \n\nMerci de nous transmettre le contrat type et la fiche partenaire.\n`,
    });
    setTimeout(() => contactSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (isHoneypotFilled(fd.get("website"))) return;
    const pName = String(fd.get("name") || "").trim();
    const pCompany = String(fd.get("company") || "").trim();
    const pEmail = String(fd.get("email") || "").trim();
    const pBudget = String(fd.get("budget") || "").trim();
    const pMessage = String(fd.get("message") || "").trim();
    if (pName.length < 2 || pName.length > 120) { toast.error(`${t("partners.contact.name")} : 2 ${t("form.minChars")}`); return; }
    if (pCompany.length < 2 || pCompany.length > 160) { toast.error(`${t("partners.contact.company")} : 2 ${t("form.minChars")}`); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pEmail)) { toast.error(t("partners.contact.emailInvalid")); return; }
    if (pBudget.length > 80) { toast.error(`${t("partners.contact.budget")} : 80 ${t("form.maxChars")}`); return; }
    if (pMessage.length < 10) { toast.error(`${t("partners.contact.message")} : 10 ${t("form.minChars")}`); return; }
    if (pMessage.length > 3000) { toast.error(`${t("partners.contact.message")} : 3000 ${t("form.maxChars")}`); return; }
    const limit = checkSessionRateLimit("partner_request", { max: 2, windowMs: 10 * 60 * 1000 });
    if (!limit.allowed) { toast.error(rateLimitMessage(limit.retryAt)); return; }
    try {
      await callProtected("submitPartnerRequest", { name: pName, company: pCompany, email: pEmail, budget: pBudget, message: pMessage });
      toast.success(t("partners.contact.success"));
      e.target.reset();
      setPrefilled({ budget: "", message: "" });
    } catch (err) {
      console.error(err);
      toast.error(protectedErrorMessage(err, t("partners.contact.error")));
    }
  };

  const renderCell = (tierKey, row) => {
    const g = grille[tierKey];
    if (row.type === "text" || row.type === "textLong" || row.type === "price") {
      if (row.key === "offresActives") return g.offresActives;
      if (row.key === "dureeOffre") return g.dureeOffre;
      if (row.key === "tarifRef") return g.tarifRef;
      if (row.key === "tarif12") return g.tarif12;
      if (row.key === "engagement") return g.engagement;
      if (row.key === "renouvellement") return g.renouvellement;
      if (row.key === "resiliation") return g.resiliation;
      if (row.key === "attractivite") return g.attractivite;
      if (row.key === "part") return g.part;
      if (row.key === "nombreAdmis") return g.nombreAdmis;
      if (row.key === "ficheSite" || row.key === "ficheMap") return "✓";
      return "—";
    }
    if (row.type === "bool") {
      const val = g[row.key];
      return val ? <Check size={16} className="text-emerald-400 mx-auto" /> : <X size={14} className="text-[#a0a0a0] mx-auto" />;
    }
    if (row.type === "boolDetail") {
      const val = g[row.key];
      const detailKey = row.key + "Detail";
      const detail = g[detailKey];
      if (!val) return <X size={14} className="text-[#a0a0a0] mx-auto" />;
      return (
        <span className="inline-flex flex-col items-center">
          <Check size={16} className="text-emerald-400" />
          {detail && <span className="text-[11px] text-[#c8c8c8] mt-1 text-center leading-tight">{detail}</span>}
        </span>
      );
    }
    if (row.type === "boolDetailCustom") {
      // Logo maillots : cas particulier Gold = texte
      if (tierKey === "gold") {
        return <span className="text-xs text-[#f7f7f7]/70 text-center">{g.maillotsDetail}</span>;
      }
      const val = g[row.key];
      return val ? <Check size={16} className="text-emerald-400 mx-auto" /> : <span className="text-[#a0a0a0]">—</span>;
    }
    return "—";
  };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      {/* HERO */}
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("partners.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="partners-title">{t("partners.title")}</h1>
          <p className="text-[#c8c8c8] mt-4 tracking-wide max-w-2xl">{t("partners.sub")}</p>
        </div>
      </section>

      {/* VALUES */}
      <section className="border-b border-white/10 bg-[#0c0c0c]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-values">
          <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-10">{t("partners.values.title")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map(({ key, icon: Icon }) => (
              <div key={key} className="border border-white/10 bg-[#1A1A1A] p-6 hover:border-[#D8CA82]/50 transition-colors">
                <Icon className="text-[#D8CA82] mb-4" size={24} />
                <h3 className="font-display font-bold text-[#f7f7f7] mb-2">{t(`partners.values.${key}`)}</h3>
                <p className="text-sm text-[#f7f7f7]/50 leading-relaxed">{t(`partners.values.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ANNEXE 3 - GRILLE COMMERCIALE ELYWALK - PAGE 15 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-offers">
        <div className="border border-[#D8CA82]/20 bg-[#0c0c0c] p-4 mb-8">
          <p className="text-[11px] font-display uppercase tracking-[0.3em] text-[#D8CA82]">CONVENTION DE PROJET · PROJET ELYWALK · GRILLE DE PARTENARIAT — RÉVISION 2 · CONFIDENTIEL</p>
          <p className="text-[11px] text-[#a0a0a0] mt-1">ASSOCIATION ELYSIUM · RNA W772011943 — PAGE 15 / 16</p>
          <h2 className="font-display font-black text-2xl uppercase text-[#f7f7f7] mt-4">ANNEXE 3 : GRILLE COMMERCIALE ET CONDITIONS DE VENTE</h2>
          <p className="text-xs text-[#c8c8c8] mt-3 leading-relaxed max-w-4xl">
            Ce document est destiné à être remis aux prospects. Il reprend la grille de l'article 5.2, l'article 5.3 et l'article 12. En cas de divergence avec la convention, la convention prévaut entre les Dirigeants ; le contrat signé avec le Partenaire prévaut entre l'association et le Partenaire.
          </p>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <h3 className="font-display text-base tracking-[0.3em] uppercase text-[#D8CA82]">Grille tarifaire et prestations — Projet ElyWalk</h3>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* CARTES TARIFS */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {[
            { key: "bronze", color: "border-[#CD7F32]/30 bg-[#CD7F32]/5", text: "text-[#CD7F32]" },
            { key: "argent", color: "border-[#C0C0C0]/30 bg-[#C0C0C0]/5", text: "text-[#C0C0C0]", popular: false },
            { key: "gold", color: "border-[#D8CA82]/50 bg-[#D8CA82]/5", text: "text-[#D8CA82]", popular: true },
          ].map(({ key, color, text, popular }) => {
            const g = grille[key];
            return (
              <div key={key} className={`relative border ${color} p-6 flex flex-col`} data-testid={`partners-offer-${key}`}>
                {popular && <div className="absolute -top-3 left-6 bg-[#D8CA82] text-[#111111] text-[10px] font-display font-bold uppercase tracking-[0.2em] px-3 py-1">Recommandé</div>}
                <p className={`font-display font-black text-2xl uppercase mb-2 ${text}`}>{g.label}</p>
                <div className="space-y-1 mb-4 text-sm">
                  <p className="text-[#f7f7f7]"><span className="text-[#a0a0a0]">Référence :</span> <span className="font-bold">{g.tarifRef}</span> / mois</p>
                  <p className="text-[#f7f7f7]"><span className="text-[#a0a0a0]">12 mois :</span> <span className="font-bold">{g.tarif12}</span> / mois</p>
                  <p className="text-[#f7f7f7]"><span className="text-[#a0a0a0]">Engagement :</span> {g.engagement}</p>
                  <p className="text-[#f7f7f7]"><span className="text-[#a0a0a0]">Renouvellement :</span> {g.renouvellement}</p>
                  <p className="text-[#f7f7f7]"><span className="text-[#a0a0a0]">Résiliation :</span> {g.resiliation}</p>
                </div>
                <div className="border-t border-white/10 pt-4 mt-auto">
                  <Button onClick={() => scrollToContact(key)} variant={key === "gold" ? "gold" : "outline"} size="md" className={`w-full ${key !== "gold" ? "border-white/20 text-[#f7f7f7] hover:border-[#D8CA82] hover:text-[#D8CA82]" : ""}`} data-testid={`partners-offer-cta-${key}`}>
                    Choisir {g.label}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* TABLEAU COMPLET - MODIFICATIONS DU CONTRAT */}
        <div className="border border-white/10 overflow-hidden">
          <div className="bg-[#1A1A1A] p-4 border-b border-white/10">
            <h4 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">MODIFICATIONS DU CONTRAT — Détail par palier</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0c0c0c] border-b border-white/10">
                  <th className="text-left p-3 font-display uppercase tracking-widest text-[11px] text-[#c8c8c8] min-w-[280px]">Prestation / Condition</th>
                  <th className="text-center p-3 font-display uppercase tracking-widest text-xs text-[#CD7F32] min-w-[160px]">BRONZE<br /><span className="text-[10px] normal-case tracking-normal text-[#a0a0a0]">196€ HT/mois</span></th>
                  <th className="text-center p-3 font-display uppercase tracking-widest text-xs text-[#C0C0C0] min-w-[160px]">ARGENT<br /><span className="text-[10px] normal-case tracking-normal text-[#a0a0a0]">356€ HT/mois</span></th>
                  <th className="text-center p-3 font-display uppercase tracking-widest text-xs text-[#D8CA82] min-w-[220px]">GOLD<br /><span className="text-[10px] normal-case tracking-normal text-[#a0a0a0]">676€ HT/mois</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.key} className={`${idx % 2 === 0 ? "bg-[#111111]" : "bg-[#1A1A1A]/50"} border-b border-white/5`}>
                    <td className="p-3 text-[#f7f7f7]/80 font-medium">{row.label}</td>
                    <td className="p-3 text-center text-[#f7f7f7]/70">{renderCell("bronze", row)}</td>
                    <td className="p-3 text-center text-[#f7f7f7]/70">{renderCell("argent", row)}</td>
                    <td className="p-3 text-center text-[#f7f7f7]/70">{renderCell("gold", row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* REGLE APPLICABLE */}
        <div className="mt-8 border border-white/10 bg-[#1A1A1A] p-6">
          <h4 className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-2">RÈGLE APPLICABLE</h4>
          <p className="text-sm text-[#f7f7f7]/70">Avenant écrit signé des deux Dirigeants, sauf matières déléguées au Président.</p>
        </div>

        {/* CONDITIONS COMMUNES */}
        <div className="mt-8 border border-white/10 bg-[#0c0c0c] p-6" data-testid="partners-conditions">
          <h4 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7] mb-6">CONDITIONS COMMUNES APPLICABLES AUX TROIS PALIERS</h4>
          <ol className="space-y-4 text-sm text-[#c8c8c8] leading-relaxed list-decimal list-inside">
            <li>Tarifs mensuels hors taxes, sans garantie de volume d'impressions, de clics, de visiteurs ni de remplissage des offres.</li>
            <li>Règlement mensuel à terme à échoir ; option de règlement anticipé de la période d'engagement ou de douze (12) mois avec maintien du tarif souscrit jusqu'au terme.</li>
            <li>Révision tarifaire à la reconduction selon la grille en vigueur, notifiée trois (3) mois avant le terme.</li>
            <li>Financement des offres : le Partenaire fixe la valeur unitaire de chaque tâche et la durée de son offre ; la répartition suit le niveau d'attractivité du palier (75/25, 50/50 ou 25/75) et la part Utilisateur est versée en ElyCoins au taux de 1 000 ElyCoins pour 1 €.</li>
            <li>Visuels, barèmes, contenus et vidéos fournis par le Partenaire, prêts à diffuser ; validation par Elysium, qui peut refuser sans motivation et décide seule des dates, fenêtres et durée de diffusion.</li>
            <li>Aucune exclusivité, sectorielle ni autre : l'association peut accueillir un nombre illimité de partenaires, y compris concurrents sur un même secteur. Une exclusivité ne peut résulter que d'un engagement écrit particulier.</li>
            <li>Cartes cadeaux émises par un Partenaire : l'association lui reverse la valeur faciale de chaque carte retirée et n'exerce aucune activité de négoci ou de change ; les frais d'émission et de traitement restent à la charge du Partenaire (art. 12.6).</li>
            <li>Données des Utilisateurs : transmission uniquement avec le consentement explicite de l'Utilisateur ; aucune cession ni vente de fichier.</li>
            <li>Les offres, remises et paliers dérogatoires ne peuvent être consentis que par le Président ou son délégataire, par Écrit.</li>
            <li>La présence sur les futurs projets numériques est une opportunité de diffusion selon les supports et emplacements disponibles : elle n'est garantie ni sur un projet, ni sur un emplacement, ni sur un volume d'exposition.</li>
          </ol>
        </div>

        <p className="text-[11px] text-[#a0a0a0] mt-6">CONVENTION DE PROJET · PROJET ELYWALK · GRILLE DE PARTENARIAT — RÉVISION 2 · CONFIDENTIEL — ASSOCIATION ELYSIUM · RNA W772011943 — PAGE 16 / 16</p>
      </section>

      {/* PARTNER LOGOS */}
      <section className="border-t border-white/10 bg-[#0c0c0c]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-logos">
          {error ? (
            <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="partners-error" />
          ) : partners === null ? (
            <LoadingState testId="partners-loading" />
          ) : grouped.length === 0 ? (
            <EmptyState icon={Handshake} text={t("partners.empty")} testId="partners-empty" />
          ) : (
            <div className="space-y-12">
              {grouped.map(({ tier, list }) => (
                <div key={tier}>
                  <div className="flex items-center gap-4 mb-6">
                    <h3 className={`font-display text-sm tracking-[0.3em] uppercase ${tier === "gold" ? "text-[#D8CA82]" : tier === "silver" ? "text-[#C0C0C0]" : "text-[#CD7F32]"}`}>
                      {t(`partners.tiers.${tier}`)}
                    </h3>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                    {list.map((p) => (
                      <a key={p.id} href={p.website || "#"} target="_blank" rel="noopener noreferrer"
                        className="group border border-white/10 bg-[#1A1A1A] p-6 flex flex-col items-center gap-3 hover:border-[#D8CA82]/50 transition-colors">
                        <PartnerLogo src={p.logoUrl} name={p.name} className="w-full h-20" />
                        <p className="font-display font-bold text-sm text-[#f7f7f7] group-hover:text-[#D8CA82] transition-colors text-center">{p.name}</p>
                        {p.website && <ExternalLink size={12} className="text-[#c8c8c8]" />}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* DON */}
      <section className="border-t border-white/10 bg-[#0c0c0c]" aria-labelledby="partners-donate-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-donate">
          <div className="flex items-center gap-4 mb-10">
            <Heart className="text-[#D8CA82]" size={20} aria-hidden="true" />
            <h2 id="partners-donate-h2" className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7]">{t("donate.title")}</h2>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <DonateBlock testId="partners-donate-block" />
        </div>
      </section>

      {/* CONTACT FORM */}
      <section ref={contactSectionRef} className="max-w-3xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-contact">
        <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-3">{t("partners.contact.title")}</h2>
        <p className="text-[#f7f7f7]/50 mb-10">{t("partners.contact.sub")}</p>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" data-testid="partners-contact-form">
          <label htmlFor="partner-website" className="sr-only">Site web</label>
          <input id="partner-website" type="text" {...getHoneypotProps("website")} data-testid="partner-form-honeypot" />
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="partner-name" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.name")}</label>
              <input id="partner-name" name="name" required data-testid="partner-form-name"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
            </div>
            <div>
              <label htmlFor="partner-company" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.company")}</label>
              <input id="partner-company" name="company" required data-testid="partner-form-company"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="partner-email" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.email")}</label>
              <input id="partner-email" name="email" type="email" required data-testid="partner-form-email"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
            </div>
            <div>
              <label htmlFor="partner-budget" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.budget")}</label>
              <input id="partner-budget" name="budget" value={prefilled.budget} onChange={(e) => setPrefilled((p) => ({ ...p, budget: e.target.value }))} placeholder={t("partners.contact.budget.placeholder")} data-testid="partner-form-budget"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] placeholder:text-[#a0a0a0]" />
            </div>
          </div>
          <div>
            <label htmlFor="partner-message" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.message")}</label>
            <textarea id="partner-message" name="message" value={prefilled.message} onChange={(e) => setPrefilled((p) => ({ ...p, message: e.target.value }))} rows={6} required placeholder={t("partners.contact.message.placeholder")} data-testid="partner-form-message"
              className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] placeholder:text-[#a0a0a0] resize-none" />
          </div>
          <Button type="submit" data-testid="partner-form-submit" variant="gold" size="lg" className="flex items-center gap-2">
            <Mail size={16} aria-hidden="true" /> {t("partners.contact.submit")}
          </Button>
        </form>
      </section>
    </div>
  );
}
