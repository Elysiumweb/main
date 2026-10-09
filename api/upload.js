/**
 * Envoi d'image — passerelle Vercel.
 * ===========================================================================
 * Cloud Storage est inaccessible sur le plan gratuit Firebase (un bucket exige
 * Blaze depuis février 2026). Les images partent donc chez imgbb, l'hébergeur
 * des visuels i.ibb.co.
 *
 * Cette passerelle permet de garder la clé **secrète** : la variable
 * `IMGBB_KEY` n'a pas le préfixe public `REACT_APP_`, donc Vercel l'injecte
 * uniquement côté serveur (visibilité « secret »). Le navigateur ne voit jamais
 * la clé.
 *
 *   Vercel → Settings → Environment Variables → IMGBB_KEY (secret)
 *   puis redeploy : Vercel publie automatiquement tout ce qui est dans /api.
 *
 * Sans cette passerelle, le site peut envoyer directement chez imgbb si
 * `REACT_APP_IMGBB_KEY` est définie (cette variable-ci est forcément publique) :
 * c'est le repli, utile quand le projet n'a pas de fonctions serveur.
 */

const IMGBB_ENDPOINT = "https://api.imgbb.com/1/upload";

// Vercel limite le corps d'une requête à 4,5 Mo ; on reste sous la barre et le
// client compresse en JPEG avant d'appeler.
const MAX_BYTES = 4 * 1024 * 1024;

const folderName = (value) => String(value || "elysium").replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 60) || "elysium";

const toBuffer = (body) => {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body, "base64");
  if (body && typeof body === "object" && body.type === "Buffer" && Array.isArray(body.data)) {
    return Buffer.from(body.data);
  }
  return null;
};

module.exports = async (req, res) => {
  // Un même site peut être embarqué ailleurs : on n'accepte que son propre.
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode refusée." });
  }

  const key = (process.env.IMGBB_KEY || "").trim();
  if (!key) {
    return res.status(503).json({ error: "Envoi d'images non configuré (IMGBB_KEY manquante)." });
  }

  const buffer = toBuffer(req.body);
  if (!buffer || !buffer.length) return res.status(400).json({ error: "Image vide." });
  if (buffer.length > MAX_BYTES) return res.status(413).json({ error: "Image trop lourde (4 Mo maximum)." });

  const name = folderName(req.query?.folder);
  const form = new FormData();
  form.append("image", new Blob([buffer], { type: "image/jpeg" }), `${name}.jpg`);
  form.append("name", name);

  // AbortController : si imgbb ne répond pas, la requête ne reste pas pendante.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const upstream = await fetch(`${IMGBB_ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !payload?.success || !payload?.data?.url) {
      console.error("[api/upload] imgbb", upstream.status, payload?.error);
      return res.status(502).json({ error: "L'hébergeur d'images a refusé l'envoi." });
    }
    return res.status(200).json({ url: payload.data.url });
  } catch (err) {
    console.error("[api/upload] erreur", err?.name || err);
    return res
      .status(controller.signal.aborted ? 504 : 502)
      .json({ error: "Envoi d'image impossible. Réessayez dans un instant." });
  } finally {
    clearTimeout(timeout);
  }
};