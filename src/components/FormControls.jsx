import { useCallback, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

/* =====================================================================
 * FormControls — retour immédiat sur les formulaires
 *  - validation côté client (à la saisie après un premier blur)
 *  - compteur de caractères
 *  - message d'erreur par champ (aria-describedby / aria-invalid)
 *  - confirmation persistante (bandeau, pas seulement un toast)
 * =================================================================== */

const baseField =
  "w-full bg-[#111111] border px-3 py-2.5 text-sm text-[#f7f7f7] placeholder:text-[#8a8a8a] " +
  "transition-colors motion-reduce:transition-none focus:outline-none";

const stateCls = (invalid, valid) =>
  invalid
    ? "border-[#ff9b95] focus:border-[#ff9b95]"
    : valid
      ? "border-emerald-400/60 focus:border-emerald-400"
      : "border-white/20 focus:border-[#D8CA82]";

export const FieldError = ({ id, message }) =>
  message ? (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-[#ff9b95]">
      <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  ) : null;

export const CharCounter = ({ value = "", max, min = 0, id }) => {
  const len = value.length;
  const over = max ? len > max : false;
  const under = min ? len < min : false;
  return (
    <span
      id={id}
      aria-live="polite"
      className={`text-[11px] tabular-nums tracking-wider ${
        over ? "text-[#ff9b95] font-semibold" : under ? "text-[#c8c8c8]" : "text-[#a0a0a0]"
      }`}
    >
      {len}
      {max ? ` / ${max}` : ""}
      {min && len < min ? ` · ${min - len} caractère${min - len > 1 ? "s" : ""} min.` : ""}
    </span>
  );
};

/**
 * Field — label + contrôle + compteur + erreur, câblés a11y.
 * `as` : "input" | "textarea" | "select"
 */
export const Field = ({
  id,
  label,
  as = "input",
  value = "",
  onChange,
  onBlur,
  error,
  touched,
  hint,
  max,
  min,
  showCounter = false,
  required = false,
  className = "",
  children,
  testId,
  ...props
}) => {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const counterId = `${id}-counter`;
  const invalid = Boolean(touched && error);
  const valid = Boolean(touched && !error && String(value).trim().length > 0);

  const describedBy =
    [hint ? hintId : null, invalid ? errorId : null, showCounter ? counterId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const Comp = as === "textarea" ? "textarea" : as === "select" ? "select" : "input";

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <label htmlFor={id} className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8]">
          {label}
          {required && (
            <span className="text-[#D8CA82] ml-1" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {showCounter && <CharCounter id={counterId} value={String(value)} max={max} min={min} />}
      </div>
      <Comp
        id={id}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        maxLength={as === "select" ? undefined : max}
        data-testid={testId || `${id}-input`}
        className={`${baseField} ${stateCls(invalid, valid)}`}
        {...props}
      >
        {children}
      </Comp>
      {hint && !invalid && (
        <p id={hintId} className="mt-1.5 text-[11px] text-[#a0a0a0]">
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={invalid ? error : null} />
    </div>
  );
};

/** Bandeau de confirmation persistant (reste affiché jusqu'à fermeture) */
export const SuccessBanner = ({ title, message, onDismiss, action, testId = "success-banner" }) => (
  <div
    role="status"
    aria-live="polite"
    data-testid={testId}
    className="relative border border-emerald-400/40 bg-emerald-400/[0.08] p-5 flex items-start gap-3"
  >
    <CheckCircle2 size={20} className="text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
    <div className="flex-1 min-w-0">
      {title && (
        <p className="font-display uppercase tracking-widest text-sm text-emerald-200">{title}</p>
      )}
      <p className="text-sm text-[#e8e8e8] mt-1 leading-relaxed">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
    {onDismiss && (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer la confirmation"
        data-testid={`${testId}-dismiss`}
        className="shrink-0 w-9 h-9 flex items-center justify-center text-emerald-200/70 hover:text-emerald-100 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
      >
        <X size={16} aria-hidden="true" />
      </button>
    )}
  </div>
);

/** Récapitulatif des erreurs en tête de formulaire */
export const FormErrorSummary = ({ errors = {}, testId = "form-error-summary" }) => {
  const list = Object.entries(errors).filter(([, v]) => v);
  if (list.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid={testId}
      className="border border-[#ff9b95]/50 bg-[#8c1d18]/20 p-4"
    >
      <p className="text-xs uppercase tracking-widest text-[#ffd0cd] font-semibold flex items-center gap-2">
        <AlertCircle size={14} aria-hidden="true" />
        {list.length} champ{list.length > 1 ? "s" : ""} à corriger
      </p>
      <ul className="mt-2 space-y-1 text-xs text-[#ffd0cd] list-disc list-inside">
        {list.map(([k, v]) => (
          <li key={k}>{v}</li>
        ))}
      </ul>
    </div>
  );
};

/* ---------------------------------------------------------------------
 * useFormValidation — validation légère, sans dépendance
 * rules: { champ: (value, values) => string | null }
 * ------------------------------------------------------------------- */
export const useFormValidation = (initialValues, rules) => {
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState({});

  const errors = useMemo(() => {
    const out = {};
    Object.entries(rules).forEach(([key, rule]) => {
      const msg = rule(values[key], values);
      if (msg) out[key] = msg;
    });
    return out;
  }, [values, rules]);

  const isValid = Object.keys(errors).length === 0;

  const setValue = useCallback((key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
  }, []);

  const handleChange = useCallback(
    (key) => (e) => setValue(key, e.target.type === "checkbox" ? e.target.checked : e.target.value),
    [setValue]
  );

  const handleBlur = useCallback((key) => () => setTouched((t) => ({ ...t, [key]: true })), []);

  const touchAll = useCallback(() => {
    setTouched(Object.keys(rules).reduce((acc, k) => ({ ...acc, [k]: true }), {}));
  }, [rules]);

  const reset = useCallback(
    (next = initialValues) => {
      setValues(next);
      setTouched({});
    },
    [initialValues]
  );

  const fieldProps = useCallback(
    (key) => ({
      value: values[key] ?? "",
      onChange: handleChange(key),
      onBlur: handleBlur(key),
      error: errors[key],
      touched: Boolean(touched[key]),
    }),
    [values, errors, touched, handleChange, handleBlur]
  );

  return {
    values,
    setValue,
    setValues,
    errors,
    touched,
    isValid,
    touchAll,
    reset,
    fieldProps,
    visibleErrors: Object.fromEntries(
      Object.entries(errors).filter(([k]) => touched[k])
    ),
  };
};

/* Règles réutilisables */
export const rules = {
  required: (msg = "Ce champ est obligatoire") => (v) =>
    !v || String(v).trim().length === 0 ? msg : null,
  minLength: (n, msg) => (v) =>
    v && String(v).trim().length < n ? msg || `${n} caractères minimum.` : null,
  maxLength: (n, msg) => (v) =>
    v && String(v).length > n ? msg || `${n} caractères maximum.` : null,
  url: (msg = "Lien invalide (doit commencer par http:// ou https://)") => (v) =>
    v && !/^https?:\/\/.+/.test(String(v).trim()) ? msg : null,
  email: (msg = "Adresse email invalide.") => (v) =>
    v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) ? msg : null,
  compose: (...fns) => (v, all) => {
    for (const fn of fns) {
      const res = fn(v, all);
      if (res) return res;
    }
    return null;
  },
};
