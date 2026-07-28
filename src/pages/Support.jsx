import { useMemo, useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { ThreadsPanel, LoginPrompt } from "../components/ThreadsPanel";
import { createNotification, CONTACT_EMAIL } from "../lib/notify";
import { ActionButton } from "../components/ui/action-button";
import { Field, FormErrorSummary, SuccessBanner, useFormValidation, rules } from "../components/FormControls";
import { PageBreadcrumb } from "../components/PageBreadcrumb";

const CATS = ["account", "technical", "team", "other"];
const PRIOS = ["low", "normal", "high"];

const SUBJECT_MAX = 90;
const DESC_MAX = 1500;
const DESC_MIN = 20;

const EMPTY = { subject: "", description: "", category: "other", priority: "normal", attachment: "" };

export default function Support() {
  const { user, displayName, canSeeSupport } = useAuth();
  const { t } = useLang();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null); // confirmation persistante

  const validation = useMemo(
    () => ({
      subject: rules.compose(
        rules.required("Indiquez un sujet pour votre demande."),
        rules.minLength(5, "Le sujet doit contenir au moins 5 caractères."),
        rules.maxLength(SUBJECT_MAX, `Le sujet ne doit pas dépasser ${SUBJECT_MAX} caractères.`)
      ),
      description: rules.compose(
        rules.required("Décrivez votre problème pour que l'équipe puisse vous aider."),
        rules.minLength(DESC_MIN, `Décrivez votre problème en ${DESC_MIN} caractères minimum.`),
        rules.maxLength(DESC_MAX, `La description ne doit pas dépasser ${DESC_MAX} caractères.`)
      ),
      attachment: rules.url(),
      category: () => null,
      priority: () => null,
    }),
    []
  );

  const form = useFormValidation(EMPTY, validation);
  const { values, fieldProps, isValid, touchAll, visibleErrors, reset } = form;

  const submit = async (e) => {
    e.preventDefault();
    touchAll();
    if (!isValid) {
      toast.error("Merci de corriger les champs signalés.");
      return;
    }
    setSending(true);
    try {
      const meta = `[${t(`support.cat.${values.category}`)} · ${t(`support.prio.${values.priority}`)}]\n${values.description.trim()}${
        values.attachment ? `\nPièce jointe : ${values.attachment.trim()}` : ""
      }`;
      const ref = await addDoc(collection(db, "supportThreads"), {
        uid: user.uid,
        name: displayName,
        email: user.email || "",
        subject: values.subject.trim(),
        meta,
        category: values.category,
        priority: values.priority,
        attachment: values.attachment.trim(),
        status: "open",
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "supportThreads", ref.id, "messages"), {
        uid: user.uid,
        name: displayName,
        text: meta,
        createdAt: serverTimestamp(),
      });
      createNotification({
        targetRoles: ["bureau"],
        type: "support_new",
        extra: values.subject.trim(),
        link: "/support",
      });
      setSent({ id: ref.id, subject: values.subject.trim() });
      reset(EMPTY);
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
    setSending(false);
  };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <PageBreadcrumb items={[{ label: t("support.title") }]} />
          <h1
            className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase"
            data-testid="support-title"
          >
            {t("support.title")}
          </h1>
          <p className="text-[#c8c8c8] mt-4 tracking-wide">{t("support.sub")}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5 space-y-6">
          <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#D8CA82]">
            {t("support.newTicket")}
          </h2>

          {sent && (
            <SuccessBanner
              testId="support-success"
              title="Demande envoyée"
              message={`Votre demande « ${sent.subject} » a bien été ouverte. L'équipe vous répond directement dans le fil de discussion ci-contre.`}
              onDismiss={() => setSent(null)}
            />
          )}

          {!user ? (
            <LoginPrompt messageKey="support.loginRequired" prefix="support" />
          ) : (
            <form
              onSubmit={submit}
              className="space-y-5 border border-white/10 bg-[#1A1A1A] p-6"
              data-testid="support-form"
              noValidate
            >
              <FormErrorSummary errors={visibleErrors} testId="support-form-errors" />

              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  id="support-category"
                  as="select"
                  label={t("support.form.category")}
                  testId="support-category-select"
                  {...fieldProps("category")}
                >
                  {CATS.map((c) => (
                    <option key={c} value={c}>
                      {t(`support.cat.${c}`)}
                    </option>
                  ))}
                </Field>
                <Field
                  id="support-priority"
                  as="select"
                  label={t("support.form.priority")}
                  testId="support-priority-select"
                  {...fieldProps("priority")}
                >
                  {PRIOS.map((p) => (
                    <option key={p} value={p}>
                      {t(`support.prio.${p}`)}
                    </option>
                  ))}
                </Field>
              </div>

              <Field
                id="support-subject"
                label={t("support.form.subject")}
                required
                showCounter
                max={SUBJECT_MAX}
                testId="support-subject-input"
                {...fieldProps("subject")}
              />

              <Field
                id="support-desc"
                as="textarea"
                rows={5}
                label={t("support.form.desc")}
                required
                showCounter
                max={DESC_MAX}
                min={DESC_MIN}
                testId="support-desc-input"
                {...fieldProps("description")}
              />

              <Field
                id="support-attachment"
                type="url"
                label={t("support.form.attachment")}
                placeholder="https://..."
                hint="Lien vers une capture d'écran ou une vidéo (optionnel)."
                testId="support-attachment-input"
                {...fieldProps("attachment")}
              />

              <ActionButton
                type="submit"
                variant="primary"
                size="md"
                icon={Send}
                loading={sending}
                loadingLabel="Envoi en cours…"
                disabled={!isValid && Object.keys(visibleErrors).length > 0}
                disabledReason="Corrigez les champs signalés pour envoyer votre demande"
                data-testid="support-submit-btn"
              >
                {t("support.form.submit")}
              </ActionButton>

              <p className="text-xs text-[#c8c8c8]">
                {t("support.contact")}{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
                  data-testid="support-contact-email"
                >
                  {CONTACT_EMAIL}
                </a>
              </p>
            </form>
          )}
        </div>

        <div className="lg:col-span-7">
          {user && (
            <>
              <h2
                className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#D8CA82] mb-6"
                data-testid="support-threads-title"
              >
                {canSeeSupport ? t("support.allTickets") : t("support.myTickets")}
              </h2>
              <ThreadsPanel
                collectionName="supportThreads"
                canSeeAll={canSeeSupport}
                emptyKey="support.noTickets"
                titleField="subject"
                prefix="support"
                statusOptions={["open", "in_progress", "resolved"]}
                canSetStatus={canSeeSupport}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
