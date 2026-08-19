import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { BellRing, Gamepad2, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { db } from "../lib/firebase";
import { GAMES, ROSTERS } from "../lib/constants";

const NOTIFICATION_TYPES = [
  ["match_reminder", "Rappel match"],
  ["match_result", "Résultat"],
  ["article_new", "Nouvel article"],
  ["live_started", "Live"],
  ["event_new_public", "Événement"],
];

const Toggle = ({ checked, onChange, children, testId }) => (
  <label className={`flex items-center gap-2 border px-3 py-2 cursor-pointer text-sm transition-colors ${checked ? "border-[#D8CA82]/70 bg-[#D8CA82]/10 text-[#f7f7f7]" : "border-white/15 text-[#f7f7f7]/55 hover:border-white/30"}`}>
    <input data-testid={testId} className="accent-[#D8CA82]" type="checkbox" checked={checked} onChange={onChange} />
    {children}
  </label>
);

export function SupporterPreferences({ user }) {
  const [competitions, setCompetitions] = useState([]);
  const [prefs, setPrefs] = useState({ games: [], rosters: [], competitions: [], notificationTypes: [] });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => onSnapshot(collection(db, "competitions"), (snap) => {
    setCompetitions(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || "")));
  }, console.error), []);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(doc(db, "supporterPreferences", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPrefs({
          games: Array.isArray(data.games) ? data.games : [],
          rosters: Array.isArray(data.rosters) ? data.rosters : [],
          competitions: Array.isArray(data.competitions) ? data.competitions : [],
          notificationTypes: Array.isArray(data.notificationTypes) ? data.notificationTypes : [],
        });
      }
      setReady(true);
    }, (err) => { console.error(err); setReady(true); });
  }, [user?.uid]);

  const allRosters = useMemo(() => [...new Set(Object.values(ROSTERS).flat())].sort(), []);
  const toggle = (key, value) => setPrefs((current) => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
  }));

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "supporterPreferences", user.uid), {
        uid: user.uid,
        ...prefs,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Préférences supporter enregistrées.");
    } catch (err) {
      console.error(err);
      toast.error("Impossible d’enregistrer les préférences.");
    }
    setSaving(false);
  };

  if (!ready) return <div className="border border-white/10 bg-[#1A1A1A] p-6 text-[#f7f7f7]/40">Chargement des préférences…</div>;

  return (
    <section className="border border-white/10 bg-[#1A1A1A] p-6 space-y-6" data-testid="supporter-preferences" aria-labelledby="supporter-preferences-title">
      <div>
        <div className="flex items-center gap-2 text-[#D8CA82] mb-2"><BellRing size={18} /><h2 id="supporter-preferences-title" className="font-display uppercase tracking-[0.25em] text-sm">Mes alertes supporter</h2></div>
        <p className="text-sm text-[#f7f7f7]/50">Suivez les sujets qui vous intéressent et choisissez exactement les alertes à recevoir par la cloche, email et push activé.</p>
      </div>

      <fieldset>
        <legend className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#c8c8c8] mb-3"><BellRing size={14} /> Notifications</legend>
        <div className="flex flex-wrap gap-2">{NOTIFICATION_TYPES.map(([id, label]) => <Toggle key={id} checked={prefs.notificationTypes.includes(id)} onChange={() => toggle("notificationTypes", id)} testId={`supporter-type-${id}`}>{label}</Toggle>)}</div>
      </fieldset>

      <fieldset>
        <legend className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#c8c8c8] mb-3"><Gamepad2 size={14} /> Jeux suivis</legend>
        <div className="flex flex-wrap gap-2">{GAMES.map((game) => <Toggle key={game} checked={prefs.games.includes(game)} onChange={() => toggle("games", game)}>{game}</Toggle>)}</div>
      </fieldset>

      <fieldset>
        <legend className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#c8c8c8] mb-3"><Users size={14} /> Rosters suivis</legend>
        <div className="flex flex-wrap gap-2">{allRosters.map((roster) => <Toggle key={roster} checked={prefs.rosters.includes(roster)} onChange={() => toggle("rosters", roster)}>{roster}</Toggle>)}</div>
      </fieldset>

      <fieldset>
        <legend className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#c8c8c8] mb-3"><Trophy size={14} /> Compétitions suivies</legend>
        {competitions.length ? <div className="flex flex-wrap gap-2">{competitions.map((competition) => <Toggle key={competition.id} checked={prefs.competitions.includes(competition.name) || prefs.competitions.includes(competition.id)} onChange={() => toggle("competitions", prefs.competitions.includes(competition.id) ? competition.id : competition.name)}>{competition.name}</Toggle>)}</div> : <p className="text-xs text-[#f7f7f7]/40">Aucune compétition disponible.</p>}
      </fieldset>

      <button type="button" onClick={save} disabled={saving} className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-3 disabled:opacity-50" data-testid="supporter-preferences-save">{saving ? "Enregistrement…" : "Enregistrer mes alertes"}</button>
    </section>
  );
}
