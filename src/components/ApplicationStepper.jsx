import { useMemo } from "react";
import { Check, Clock } from "lucide-react";
import { useLang } from "../lib/i18n";
import {
  APPLICATION_STEPS,
  daysSince,
  isTerminalStatus,
  stepIndexForStatus,
} from "../lib/recruitment";

/**
 * Frise d'étapes du parcours de candidature.
 * ----------------------------------------------------------------------------
 * Avant, un candidat ne voyait qu'un badge de statut (« En examen ») sans savoir
 * ce qu'il restait à faire ni dans quel délai. La frise rend le parcours public
 * (`variant="public"`, sur la page recrutement) ET personalised dans le fil de
 * candidature du candidat (`variant="thread"`), avec les délais moyens.
 */
export const ApplicationStepper = ({
  variant = "public",
  status,
  createdAt,
  tryout,
  delays,
  testId,
}) => {
  const { t, lang } = useLang();
  const currentIndex = variant === "thread" ? stepIndexForStatus(status) : -1;
  const terminal = variant === "thread" && isTerminalStatus(status);
  const elapsed = variant === "thread" ? daysSince(createdAt) : null;

  const dayLabel = (n) => {
    const days = Number(n) || 0;
    if (lang === "en") return `${days} ${days > 1 ? "days" : "day"}`;
    return `${days} ${days > 1 ? "jours" : "jour"}`;
  };

  /* Date limite indicative de l'étape courante : somme des délais des étapes
     déjà franchies + délai de l'étape en cours. */
  const expectedTotal = useMemo(
    () => APPLICATION_STEPS.slice(0, currentIndex + 1).reduce((sum, s) => sum + (Number(delays?.[s.delayKey]) || 0), 0),
    [currentIndex, delays]
  );

  return (
    <ol
      className={variant === "thread" ? "flex flex-col gap-0" : "grid sm:grid-cols-2 lg:grid-cols-4 gap-4"}
      data-testid={testId || (variant === "thread" ? "recruit-stepper" : "recruit-process")}
      aria-label={t("recruit.steps.title")}
    >
      {APPLICATION_STEPS.map((step, i) => {
        const delay = delays?.[step.delayKey] ?? 0;
        const done = currentIndex > i || (terminal && currentIndex === i);
        const current = currentIndex === i && !terminal;
        const overdue =
          variant === "thread" && current && elapsed !== null && elapsed > expectedTotal;

        return (
          <li
            key={step.id}
            className={
              variant === "thread"
                ? "flex gap-3"
                : "border border-white/10 bg-[#141414] p-5 flex flex-col gap-2 relative"
            }
            aria-current={current ? "step" : undefined}
            data-testid={`recruit-step-${step.id}`}
            data-state={current ? "current" : done ? "done" : "todo"}
          >
            {variant === "thread" && (
              <span
                aria-hidden="true"
                className={`mt-0.5 h-6 w-6 shrink-0 border flex items-center justify-center ${
                  done
                    ? "border-[#D8CA82] bg-[#D8CA82] text-[#111111]"
                    : current
                      ? "border-[#D8CA82] text-[#D8CA82]"
                      : "border-white/20 text-[#c8c8c8]/40"
                }`}
              >
                {done ? <Check size={13} /> : <span className="text-[10px] font-display">{i + 1}</span>}
              </span>
            )}

            <div className={variant === "thread" ? "flex-1 pb-4" : "flex-1"}>
              <div className="flex items-center gap-2 flex-wrap">
                <p
                  className={`font-display text-xs uppercase tracking-[0.2em] ${
                    current ? "text-[#D8CA82]" : done ? "text-[#f7f7f7]/80" : "text-[#c8c8c8]/50"
                  }`}
                >
                  {t(step.labelKey)}
                </p>
                {current && (
                  <span className="text-[10px] uppercase tracking-widest border border-[#D8CA82]/50 text-[#D8CA82] px-1.5 py-0.5">
                    {terminal ? t("recruit.steps.done") : t("recruit.steps.current")}
                  </span>
                )}
              </div>

              <p className="text-xs text-[#c8c8c8]/70 mt-1 leading-relaxed">{t(step.hintKey)}</p>

              <p className="text-[11px] uppercase tracking-[0.18em] text-[#c8c8c8]/50 mt-2 flex items-center gap-1.5">
                <Clock size={11} aria-hidden="true" /> {dayLabel(delay)} {t("recruit.steps.avgDelay")}
              </p>

              {overdue && (
                <p className="text-[11px] text-orange-300/90 mt-1" data-testid="recruit-step-overdue">
                  {t("recruit.steps.overdue")}
                </p>
              )}
            </div>
          </li>
        );
      })}

      {variant === "thread" && elapsed !== null && (
        <li className="pt-1 text-xs text-[#c8c8c8]/60" data-testid="recruit-step-elapsed">
          {t("recruit.steps.elapsed")} {dayLabel(elapsed)}
          {status === "pending_parental_consent" && ` — ${t("recruit.steps.pendingParental")}`}
          {tryout?.start && (
            <span className="block text-[#D8CA82]">
              {t("recruit.tryout.bookedOn")}{" "}
              {new Date(tryout.start).toLocaleString(lang === "en" ? "en-GB" : "fr-FR", {
                weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })}
              {tryout.title ? ` — ${tryout.title}` : ""}
            </span>
          )}
        </li>
      )}
    </ol>
  );
};