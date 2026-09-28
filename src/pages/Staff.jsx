import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Link } from "react-router-dom";
import { BriefcaseBusiness, Mail, Users } from "lucide-react";
import { db } from "../lib/firebase";
import { isRemovedGame } from "../lib/constants";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { LoadingState, EmptyState } from "../components/States";
import { PlayerPhoto } from "./Team";

export default function Staff() {
  const [members, setMembers] = useState(null);
  useEffect(() => onSnapshot(collection(db, "roster"), (snapshot) => {
    const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((member) => member.status === "staff" && !isRemovedGame(member.game));
    list.sort((a, b) => (a.ingameRole || "").localeCompare(b.ingameRole || "") || (a.pseudo || "").localeCompare(b.pseudo || ""));
    setMembers(list);
  }, console.error), []);

  return <div className="min-h-[70vh] bg-[#111111]">
    <section className="relative border-b border-white/10 overflow-hidden"><div className="pattern-overlay" /><div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
      <PageBreadcrumb items={[{ label: "L'équipe", to: "/equipe" }, { label: "Staff & encadrement" }]} />
      <div className="flex items-center gap-3"><BriefcaseBusiness className="text-[#D8CA82]" /><h1 className="font-display font-black text-4xl sm:text-6xl uppercase text-[#f7f7f7]">Staff & encadrement</h1></div>
      <p className="text-[#c8c8c8] mt-4 max-w-2xl">Managers, coachs et membres du bureau qui accompagnent les joueurs et développent le projet Elysium.</p>
    </div></section>
    <section className="max-w-7xl mx-auto px-4 sm:px-8 py-14">
      <div className="flex flex-wrap gap-3 mb-10"><Link to="/equipe" className="border border-white/20 text-[#c8c8c8] px-4 py-2 text-xs uppercase tracking-widest hover:border-[#D8CA82]">Joueurs</Link><span className="bg-[#D8CA82] text-[#111111] px-4 py-2 text-xs uppercase tracking-widest font-bold">Staff</span></div>
      {members === null ? <LoadingState testId="staff-loading" /> : members.length === 0 ? <EmptyState icon={Users} text="Aucun membre du staff renseigné." testId="staff-empty" /> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="staff-grid">{members.map((member) => <article key={member.id} className="border border-white/10 bg-[#1A1A1A] overflow-hidden"><PlayerPhoto src={member.photo} alt={member.pseudo} className="w-full h-64" /><div className="p-6"><p className="text-xs uppercase tracking-[.25em] text-[#D8CA82]">{member.ingameRole || "Encadrement"}</p><h2 className="font-display font-black text-2xl text-[#f7f7f7] mt-2">{member.pseudo}</h2><p className="text-xs text-[#c8c8c8] mt-1">{member.game}{member.roster ? ` · ${member.roster}` : ""}</p>{member.bio && <p className="text-sm text-[#f7f7f7]/60 mt-4 line-clamp-4">{member.bio}</p>}<Link to={`/equipe/${member.id}`} className="inline-flex mt-5 text-xs uppercase tracking-widest text-[#D8CA82]">Voir la fiche →</Link></div></article>)}</div>}
      <div className="mt-14 border border-[#D8CA82]/25 bg-[#D8CA82]/5 p-6 flex flex-wrap items-center justify-between gap-4"><div><p className="font-display uppercase tracking-widest text-[#f7f7f7]">Échanger avec l'encadrement</p><p className="text-sm text-[#c8c8c8] mt-1">Recrutement, partenariat ou projet sportif.</p></div><Link to="/support" className="bg-[#D8CA82] text-[#111111] px-5 py-3 font-display font-bold uppercase text-xs tracking-widest flex items-center gap-2"><Mail size={14} /> Nous contacter</Link></div>
    </section>
  </div>;
}
