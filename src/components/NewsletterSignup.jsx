import { useState } from "react";
import { collection, addDoc, query, where, getDocs, serverTimestamp, doc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { Mail, CheckCircle } from "lucide-react";

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const NewsletterSignup = ({ compact = false }) => {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!consent) {
      setMessage(t("newsletter.consentRequired"));
      setStatus("error");
      return;
    }
    if (!isValidEmail(email)) {
      setMessage(t("newsletter.invalidEmail"));
      setStatus("error");
      return;
    }

    setStatus("loading");
    try {
      // Check if already subscribed
      const q = query(collection(db, "newsletter"), where("email", "==", email.toLowerCase()));
      const existing = await getDocs(q);
      if (!existing.empty) {
        setMessage(t("newsletter.alreadySubscribed"));
        setStatus("error");
        return;
      }

      // Create subscription with pending confirmation (double opt-in)
      const confirmToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
      await addDoc(collection(db, "newsletter"), {
        email: email.toLowerCase(),
        confirmed: false,
        confirmToken,
        lang: localStorage.getItem("elysium_lang") || "fr",
        subscribedAt: serverTimestamp(),
        consentGivenAt: serverTimestamp(),
      });

      setStatus("success");
      setMessage(t("newsletter.success"));
      setEmail("");
      setConsent(false);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage(t("newsletter.error"));
    }
  };

  if (compact) {
    return (
      <div data-testid="newsletter-compact">
        {status === "success" ? (
          <div className="flex items-center gap-3 text-emerald-400">
            <CheckCircle size={16} />
            <p className="text-sm">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("newsletter.email")}
              required
              data-testid="newsletter-email-input"
              className="flex-1 bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] placeholder:text-[#f7f7f7]/30"
            />
            <button type="submit" disabled={status === "loading"} data-testid="newsletter-submit-btn"
              className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-6 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow disabled:opacity-50 flex items-center gap-2">
              <Mail size={14} /> {t("newsletter.submit")}
            </button>
            {status === "error" && <p className="text-red-400 text-xs w-full">{message}</p>}
          </form>
        )}
        <label className="flex items-start gap-2 mt-3 cursor-pointer" data-testid="newsletter-consent-label">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 accent-[#D8CA82]" data-testid="newsletter-consent-checkbox" />
          <span className="text-[11px] text-[#f7f7f7]/40 leading-relaxed">{t("newsletter.consent")}</span>
        </label>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="newsletter-title">{t("newsletter.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("newsletter.sub")}</p>
        </div>
      </section>
      <section className="max-w-xl mx-auto px-4 sm:px-8 py-16">
        {status === "success" ? (
          <div className="border border-emerald-400/30 bg-emerald-400/5 p-8 flex flex-col items-center gap-4" data-testid="newsletter-success">
            <CheckCircle className="text-emerald-400" size={36} />
            <p className="text-[#f7f7f7]/80 text-center">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6" data-testid="newsletter-form">
            <div>
              <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-2">{t("newsletter.email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="newsletter-page-email"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
              />
            </div>
            <label className="flex items-start gap-3 cursor-pointer" data-testid="newsletter-page-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 accent-[#D8CA82]" />
              <span className="text-xs text-[#f7f7f7]/50 leading-relaxed">{t("newsletter.consent")}</span>
            </label>
            {status === "error" && (
              <p className="text-red-400 text-sm" data-testid="newsletter-error">{message}</p>
            )}
            <button type="submit" disabled={status === "loading"} data-testid="newsletter-page-submit"
              className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-4 flex items-center gap-2 hover:shadow-[0_0_24px_rgba(216,202,130,0.45)] transition-shadow disabled:opacity-50">
              <Mail size={16} /> {t("newsletter.submit")}
            </button>
          </form>
        )}

        {/* Unsubscribe section */}
        <div className="mt-16 pt-8 border-t border-white/10">
          <UnsubscribeForm />
        </div>
      </section>
    </div>
  );
};

const UnsubscribeForm = () => {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidEmail(email)) return;
    setStatus("loading");
    try {
      const q = query(collection(db, "newsletter"), where("email", "==", email.toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setStatus("error");
        setMessage(t("newsletter.notFound"));
        return;
      }
      // Delete subscriptions for this email
      const deletions = [];
      snap.forEach((d) => {
        deletions.push(deleteDoc(doc(db, "newsletter", d.id)));
      });
      await Promise.all(deletions);
      setStatus("success");
      setMessage(t("newsletter.unsubscribe.success"));
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage(t("newsletter.unsubscribe.error"));
    }
  };

  return (
    <div data-testid="newsletter-unsubscribe">
      <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]/60 mb-2">{t("newsletter.unsubscribe.title")}</h3>
      <p className="text-xs text-[#f7f7f7]/40 mb-6">{t("newsletter.unsubscribe.sub")}</p>
      {status === "success" ? (
        <p className="text-emerald-400 text-sm" data-testid="unsubscribe-success">{message}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("newsletter.unsubscribe.email")}
            required
            data-testid="unsubscribe-email-input"
            className="flex-1 bg-[#1A1A1A] border border-white/20 px-4 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] placeholder:text-[#f7f7f7]/20"
          />
          <button type="submit" disabled={status === "loading"} data-testid="unsubscribe-submit"
            className="border border-white/20 text-[#f7f7f7]/60 text-xs uppercase tracking-widest px-4 py-2.5 hover:border-red-400 hover:text-red-400 transition-colors disabled:opacity-50">
            {t("newsletter.unsubscribe.submit")}
          </button>
        </form>
      )}
      {status === "error" && <p className="text-red-400 text-xs mt-2" data-testid="unsubscribe-error">{message}</p>}
    </div>
  );
};
