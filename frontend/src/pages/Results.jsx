import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { MatchCard } from "../components/MatchCard";
import { Trophy } from "lucide-react";

export default function Results() {
  const { t } = useLang();
  const [matches, setMatches] = useState(null);

  useEffect(() => {
    if (!db || db._isFake) { setMatches([]); return; }
    try {
      return onSnapshot(collection(db, "matches"), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setMatches(list);
      }, (e) => { console.error(e); setMatches([]); });
    } catch (e) {
      console.error("[Results] Firestore failed", e);
      setMatches([]);
      return () => {};
    }
  }, []);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="results-title">{t("results.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("results.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        {matches === null ? (
          <p className="text-[#f7f7f7]/40">{t("common.loading")}</p>
        ) : matches.length === 0 ? (
          <div className="border border-white/10 bg-[#1A1A1A] py-24 flex flex-col items-center gap-4" data-testid="results-empty">
            <Trophy className="text-[#D8CA82]/40" size={40} />
            <p className="text-[#f7f7f7]/50 tracking-wide">{t("results.empty")}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="results-grid">
            {matches.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}
