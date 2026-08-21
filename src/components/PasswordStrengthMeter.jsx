import { passwordStrength, PASSWORD_HINT } from "../lib/passwordPolicy";

/**
 * Indicateur de robustesse de mot de passe partagé entre l'inscription
 * (Login) et le changement de mot de passe (Profil).
 */
export const PasswordStrengthMeter = ({ password, id, testId = "password-strength" }) => {
  const { label, color, percent, score } = passwordStrength(password);
  const empty = !password;
  return (
    <div className="mt-2" id={id} data-testid={testId} aria-live="polite">
      <div className="h-1 w-full bg-white/10 overflow-hidden" role="presentation">
        <div
          className="h-full transition-all motion-reduce:transition-none"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
      <p className="form-hint mt-1.5 flex items-center justify-between gap-2">
        <span>{PASSWORD_HINT}</span>
        {!empty && (
          <span
            className="shrink-0 text-xs uppercase tracking-widest font-semibold"
            style={{ color }}
            data-testid={`${testId}-label`}
            data-score={score}
          >
            {label}
          </span>
        )}
      </p>
    </div>
  );
};
