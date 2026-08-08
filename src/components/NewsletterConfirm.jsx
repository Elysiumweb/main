import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle, AlertCircle } from "lucide-react";

const region = process.env.REACT_APP_FIREBASE_FUNCTIONS_REGION || "us-central1";
const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;

export const NewsletterConfirm = () => {
  const { token } = useParams();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !projectId) {
      setError("Lien de confirmation invalide.");
      return;
    }
    const url = `https://${region}-${projectId}.cloudfunctions.net/confirmNewsletter?token=${encodeURIComponent(token)}`;
    window.location.replace(url);
  }, [token]);

  return (
    <div className="min-h-[70vh] bg-[#111111] flex items-center justify-center px-4">
      <div className="max-w-lg border border-white/10 bg-[#1A1A1A] p-8 text-center" data-testid="newsletter-confirm-page">
        {error ? <AlertCircle className="mx-auto text-red-300 mb-4" /> : <CheckCircle className="mx-auto text-[#D8CA82] mb-4" />}
        <h1 className="font-display text-2xl uppercase tracking-widest text-[#f7f7f7] mb-3">Confirmation newsletter</h1>
        <p className="text-sm text-[#c8c8c8] mb-6">{error || "Confirmation en cours…"}</p>
        {error && <Link to="/newsletter" className="text-[#D8CA82] underline">Retour à la newsletter</Link>}
      </div>
    </div>
  );
};
