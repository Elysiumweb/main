import { useState, useId } from "react";
import { collection, addDoc, query, where, getDocs, serverTimestamp, doc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const inputCls =
  "w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export const NewsletterSignup = ({ compact = false }) => {
  const { t } = useLang();
  const reactId = useId();
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

  // Stable IDs for aria-describedby
  const emailId = `nl-email-${reactId}`;
  const consentId = `nl-consent-${reactId}`;
  const errorId = `nl-error-${reactId}`;

  if (compact) {
    return (
      <div data-testid="newsletter-compact">
        {status === "success" ? (
          <div
            className="flex items-center gap-3 text-emerald-300"
            role="status"
            aria-live="polite"
          >
            <CheckCircle size={16} aria-hidden="true" />
            <p className="text-sm">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3" noValidate>
            <label htmlFor={emailId} className="sr-only">{t("newsletter.email")}</label>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("newsletter.email")}
              required
              aria-invalid={status === "error"}
              aria-describedby={status === "error" ? errorId : undefined}
              data-testid="newsletter-email-input"
              className={inputCls + " placeholder:text-[#a0a0a0]"}
            />
            <button
              type="submit"
              disabled={status === "loading"}
              aria-describedby={status === "error" ? errorId : undefined}
              data-testid="newsletter-submit-btn"
              className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-6 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow disabled:opacity-50 flex items-center gap-2 motion-reduce:transition-none"
            >
              <Mail size={14} aria-hidden="true" /> {t("newsletter.submit")}
            </button>
          </form>
        )}
        {status === "error" && (
          <p
            id={errorId}
            role="alert"
            aria-live="polite"
            className="form-error w-full"
          >
            <AlertCircle size={14} className="inline -mt-0.5 mr-1" aria-hidden="true" />
            {message}
          </p>
        )}
        <label
          htmlFor={consentId}
          className="flex items-start gap-2 mt-3 cursor-pointer"
          data-testid="newsletter-consent-label"
        >
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 accent-[#D8CA82]"
            data-testid="newsletter-consent-checkbox"
          />
          <span className="text-[11px] text-[#c8c8c8] leading-relaxed">{t("newsletter.consent")}</span>
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
          <p className="text-[#c8c8c8] mt-4 tracking-wide">{t("newsletter.sub")}</p>
        </div>
      </section>
      <section className="max-w-xl mx-auto px-4 sm:px-8 py-16">
        {status === "success" ? (
          <div
            className="border border-emerald-300/40 bg-emerald-300/5 p-8 flex flex-col items-center gap-4"
            data-testid="newsletter-success"
            role="status"
            aria-live="polite"
          >
            <CheckCircle className="text-emerald-300" size={36} aria-hidden="true" />
            <p className="text-[#f7f7f7] text-center">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6" data-testid="newsletter-form" noValidate>
            <div>
              <label htmlFor={emailId} className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">
                {t("newsletter.email")}
              </label>
              <input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-invalid={status === "error"}
                aria-describedby={status === "error" ? errorId : undefined}
                data-testid="newsletter-page-email"
                className={inputCls}
              />
            </div>
            <label
              htmlFor={consentId}
              className="flex items-start gap-3 cursor-pointer"
              data-testid="newsletter-page-consent"
            >
              <input
                id={consentId}
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 accent-[#D8CA82]"
              />
              <span className="text-xs text-[#c8c8c8] leading-relaxed">{t("newsletter.consent")}</span>
            </label>
            {status === "error" && (
              <p
                id={errorId}
                role="alert"
                aria-live="polite"
                className="form-error"
                data-testid="newsletter-error"
              >
                <AlertCircle size={14} className="inline -mt-0.5 mr-1" aria-hidden="true" />
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={status === "loading"}
              data-testid="newsletter-page-submit"
              className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-4 flex items-center gap-2 hover:shadow-[0_0_24px_rgba(216,202,130,0.45)] transition-shadow disabled:opacity-50 motion-reduce:transition-none"
            >
              <Mail size={16} aria-hidden="true" /> {t("newsletter.submit")}
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
  const reactId = useId();
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

  const emailId = `unsub-email-${reactId}`;
  const errorId = `unsub-error-${reactId}`;

  return (
    <div data-testid="newsletter-unsubscribe">
      <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#c8c8c8] mb-2">{t("newsletter.unsubscribe.title")}</h3>
      <p className="text-xs text-[#c8c8c8] mb-6">{t("newsletter.unsubscribe.sub")}</p>
      {status === "success" ? (
        <p
          className="text-emerald-300 text-sm"
          data-testid="unsubscribe-success"
          role="status"
          aria-live="polite"
        >
          <CheckCircle size={14} className="inline -mt-0.5 mr-1" aria-hidden="true" />
          {message}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-3" noValidate>
          <label htmlFor={emailId} className="sr-only">{t("newsletter.unsubscribe.email")}</label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("newsletter.unsubscribe.email")}
            required
            aria-invalid={status === "error"}
            aria-describedby={status === "error" ? errorId : undefined}
            data-testid="unsubscribe-email-input"
            className="flex-1 bg-[#1A1A1A] border border-white/20 px-4 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] placeholder:text-[#a0a0a0]"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            data-testid="unsubscribe-submit"
            className="border border-white/20 text-[#c8c8c8] text-xs uppercase tracking-widest px-4 py-2.5 hover:border-red-300 hover:text-red-300 transition-colors disabled:opacity-50 motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
          >
            {t("newsletter.unsubscribe.submit")}
          </button>
        </form>
      )}
      {status === "error" && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="form-error mt-2"
          data-testid="unsubscribe-error"
        >
          <AlertCircle size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />
          {message}
        </p>
      )}
    </div>
  );
};
