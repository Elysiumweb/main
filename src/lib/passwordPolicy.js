/**
 * Politique de mot de passe unifiée.
 * ----------------------------------------------------------------------------
 * Historiquement, l'inscription exigeait 6 caractères et le changement de mot
 * de passe 8 : une seule politique s'applique désormais partout (8 caractères
 * minimum) avec un indicateur de robustesse commun.
 */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_HINT = `${PASSWORD_MIN_LENGTH} caractères minimum — mélangez majuscules, minuscules, chiffres et symboles.`;

/**
 * Évalue la robustesse d'un mot de passe.
 * @returns {{score: 0|1|2|3|4, label: string, color: string, percent: number, valid: boolean}}
 */
export const passwordStrength = (password = "") => {
  const pw = String(password);
  let score = 0;
  if (pw.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (pw.length >= 12) score += 1;
  const families = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((re) => re.test(pw)).length;
  if (families >= 2) score += 1;
  if (families >= 3 && pw.length >= 10) score += 1;
  // Pénalité : répétitions massives ou suites triviales.
  if (/^(.)\1+$/.test(pw) || /^(0123|1234|azert|qwert|password|motdepasse)/i.test(pw)) {
    score = Math.min(score, 1);
  }
  score = Math.max(0, Math.min(4, score));

  const labels = ["Très faible", "Faible", "Correct", "Bon", "Excellent"];
  const colors = ["#E53935", "#F4511E", "#FBC02D", "#7CB342", "#43A047"];
  return {
    score,
    label: labels[score],
    color: colors[score],
    percent: pw.length === 0 ? 0 : Math.max(10, (score / 4) * 100),
    valid: pw.length >= PASSWORD_MIN_LENGTH,
  };
};

/** Liste des problèmes bloquants (retourne [] si le mot de passe est acceptable). */
export const passwordIssues = (password = "") => {
  const issues = [];
  if (String(password).length < PASSWORD_MIN_LENGTH) {
    issues.push(`Au moins ${PASSWORD_MIN_LENGTH} caractères requis.`);
  }
  return issues;
};
