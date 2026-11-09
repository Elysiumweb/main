import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Handshake,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { useAdminT } from "../../lib/adminI18n";
import { useAuth } from "../../context/AuthContext";
import { logAdminAction } from "../../lib/notify";
import { ImageUpload } from "../ImageUpload";
import { ConfirmAction } from "../ConfirmAction";
import { Markdown } from "../../lib/markdown";
import { isHttpUrl, isImageValue } from "../../lib/validation";
import {
  PARTNER_TIERS,
  isPartnerLinkValue,
  partnerBannerSrc,
  partnerFichePath,
  partnerLogoSrc,
  partnerSlug,
  partnerTier,
  sortPartners,
  slugifyPartner,
} from "../../lib/partners";

/* ---------------------------------------------------------------------------
 * Admin — partenaires affichés sur le site.
 *
 * Chaque partenaire est un document de la collection `partners` :
 *   name, slug, tier, order, active,
 *   logoUrl (ImageUpload), bannerUrl (ImageUpload),
 *   description (Markdown), ctaLabel, ctaUrl (bouton sous la description),
 *   website.
 * Les logos et bannières passent par ImageUpload (base64 Firestore), comme
 * les adversaires et les articles : aucune URL à recopier à la main.
 * ------------------------------------------------------------------------- */

const inputCls =
  "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const labelCls = "text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2";

const EMPTY = {
  name: "",
  slug: "",
  tier: "bronze",
  order: "0",
  description: "",
  logoUrl: "",
  bannerUrl: "",
  ctaLabel: "",
  ctaUrl: "",
  website: "",
  active: true,
};

export const AdminPartners = () => {
  const { t } = useLang();
  const tx = useAdminT();
  const { user, displayName } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showPreview, setShowPreview] = useState(true);

  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  useEffect(() => {
    return onSnapshot(
      collection(db, "partners"),
      (snap) => setItems(sortPartners(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      (err) => {
        console.error(err);
        toast.error(t("common.error"));
      }
    );
  }, [t]);

  const slugPreview = useMemo(
    () => slugifyPartner(form.slug) || slugifyPartner(form.name) || tx("partnerAdmin.slugFallback"),
    [form.slug, form.name, tx]
  );

  const actor = { uid: user?.uid, name: displayName, email: user?.email };

  const reset = () => {
    setForm(EMPTY);
    setEditId(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (name.length < 2) {
      toast.error(tx("partnerAdmin.nameRequired"));
      return;
    }
    if (form.logoUrl && !isImageValue(form.logoUrl)) {
      toast.error(tx("partnerAdmin.invalidLogo"));
      return;
    }
    if (form.bannerUrl && !isImageValue(form.bannerUrl)) {
      toast.error(tx("partnerAdmin.invalidBanner"));
      return;
    }
    if (form.ctaUrl && !isPartnerLinkValue(form.ctaUrl)) {
      toast.error(tx("partnerAdmin.invalidCta"));
      return;
    }
    if (form.website && !isHttpUrl(form.website)) {
      toast.error(tx("partnerAdmin.invalidWebsite"));
      return;
    }
    if (form.description.length > 20000) {
      toast.error(tx("partnerAdmin.descriptionTooLong"));
      return;
    }

    const slug = slugifyPartner(form.slug) || slugifyPartner(name);
    if (!slug) {
      toast.error(tx("partnerAdmin.slugRequired"));
      return;
    }
    const taken = items.some((p) => p.id !== editId && partnerSlug(p) === slug);
    if (taken) {
      toast.error(tx("partnerAdmin.slugTaken"));
      return;
    }

    const orderNumber = Number.parseInt(form.order, 10);
    const payload = {
      name,
      slug,
      tier: PARTNER_TIERS.includes(form.tier) ? form.tier : "bronze",
      order: Number.isFinite(orderNumber) ? orderNumber : 0,
      description: form.description,
      logoUrl: form.logoUrl,
      bannerUrl: form.bannerUrl,
      ctaLabel: form.ctaLabel.trim(),
      ctaUrl: form.ctaUrl.trim(),
      website: form.website.trim(),
      active: form.active !== false,
    };

    try {
      if (editId) {
        await updateDoc(doc(db, "partners", editId), { ...payload, updatedAt: serverTimestamp() });
        await logAdminAction({
          action: "partner_updated",
          label: `${name} (${slug})`,
          actor,
          target: { collection: "partners", id: editId },
        });
      } else {
        const ref = await addDoc(collection(db, "partners"), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await logAdminAction({
          action: "partner_created",
          label: `${name} (${slug})`,
          actor,
          target: { collection: "partners", id: ref.id },
        });
      }
      toast.success(t("common.saved"));
      reset();
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const edit = (partner) => {
    setEditId(partner.id);
    setForm({
      name: partner.name || "",
      slug: partner.slug || "",
      tier: partnerTier(partner),
      order: String(partner.order ?? 0),
      description: partner.description || "",
      logoUrl: partnerLogoSrc(partner),
      bannerUrl: partnerBannerSrc(partner),
      ctaLabel: partner.ctaLabel || "",
      ctaUrl: partner.ctaUrl || "",
      website: partner.website || "",
      active: partner.active !== false && partner.published !== false,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleActive = async (partner) => {
    const next = !(partner.active !== false && partner.published !== false);
    try {
      await updateDoc(doc(db, "partners", partner.id), { active: next, published: next });
      await logAdminAction({
        action: next ? "partner_published" : "partner_hidden",
        label: partner.name || partner.id,
        actor,
        target: { collection: "partners", id: partner.id },
      });
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const del = async (partner) => {
    try {
      await deleteDoc(doc(db, "partners", partner.id));
      await logAdminAction({
        action: "partner_deleted",
        label: partner.name || partner.id,
        actor,
        target: { collection: "partners", id: partner.id },
      });
      if (editId === partner.id) reset();
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const descriptionLength = form.description.trim().length;

  return (
    <div className="space-y-8" data-testid="admin-partners">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Handshake className="text-[#D8CA82]" size={18} aria-hidden="true" />
          <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">
            {tx("partnerAdmin.title")}
          </h2>
        </div>
        <p className="text-sm text-[#f7f7f7]/50 max-w-3xl">{tx("partnerAdmin.sub")}</p>
      </div>

      <div className="grid lg:grid-cols-12 gap-10">
        <form
          onSubmit={submit}
          className="lg:col-span-5 space-y-5 border border-white/10 bg-[#1A1A1A] p-6"
          data-testid="admin-partners-form"
        >
          <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">
            {editId ? tx("partnerAdmin.edit") : tx("partnerAdmin.add")}
          </p>

          <div>
            <label htmlFor="partner-admin-name" className={labelCls}>
              {tx("partnerAdmin.name")}
            </label>
            <input
              id="partner-admin-name"
              value={form.name}
              onChange={set("name")}
              placeholder={tx("partnerAdmin.namePlaceholder")}
              required
              className={inputCls}
              data-testid="admin-partner-name"
            />
          </div>

          <div>
            <label htmlFor="partner-admin-slug" className={labelCls}>
              {tx("partnerAdmin.slug")}
            </label>
            <input
              id="partner-admin-slug"
              value={form.slug}
              onChange={set("slug")}
              placeholder={tx("partnerAdmin.slugPlaceholder")}
              className={inputCls}
              data-testid="admin-partner-slug"
            />
            <p className="text-xs text-[#a0a0a0] mt-2 break-all">
              {tx("partnerAdmin.slugPreview")} <span className="text-[#D8CA82]">/partenaires/{slugPreview}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="partner-admin-tier" className={labelCls}>
                {tx("partnerAdmin.tier")}
              </label>
              <select
                id="partner-admin-tier"
                value={form.tier}
                onChange={set("tier")}
                className={inputCls}
                data-testid="admin-partner-tier"
              >
                {PARTNER_TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {t(`partners.tiers.${tier}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="partner-admin-order" className={labelCls}>
                {tx("partnerAdmin.order")}
              </label>
              <input
                id="partner-admin-order"
                type="number"
                inputMode="numeric"
                value={form.order}
                onChange={set("order")}
                className={inputCls}
                data-testid="admin-partner-order"
              />
              <p className="text-[11px] text-[#a0a0a0] mt-2">{tx("partnerAdmin.orderHint")}</p>
            </div>
          </div>

          <label className="flex items-center gap-3 border border-white/10 bg-[#111111] px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={set("active")}
              className="accent-[#D8CA82]"
              data-testid="admin-partner-active"
            />
            <span className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/70">
              {form.active ? tx("partnerAdmin.visible") : tx("partnerAdmin.hidden")}
            </span>
          </label>

          <div>
            <p className={labelCls}>{tx("partnerAdmin.logo")}</p>
            <ImageUpload
              value={form.logoUrl}
              onChange={(url) => setForm((f) => ({ ...f, logoUrl: url }))}
              folder="partners"
              maxWidth={800}
              label={tx("partnerAdmin.logoUpload")}
              testId="admin-partner-logo-upload"
            />
            <p className="text-xs text-[#a0a0a0] mt-2">{tx("partnerAdmin.logoHint")}</p>
          </div>

          <div>
            <p className={labelCls}>{tx("partnerAdmin.banner")}</p>
            <ImageUpload
              value={form.bannerUrl}
              onChange={(url) => setForm((f) => ({ ...f, bannerUrl: url }))}
              folder="partner-banners"
              maxWidth={1600}
              label={tx("partnerAdmin.bannerUpload")}
              testId="admin-partner-banner-upload"
            />
            <p className="text-xs text-[#a0a0a0] mt-2">{tx("partnerAdmin.bannerHint")}</p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label htmlFor="partner-admin-description" className={`${labelCls} mb-0`}>
                {tx("partnerAdmin.description")}
              </label>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="text-[11px] uppercase tracking-widest text-[#D8CA82] hover:underline"
                data-testid="admin-partner-preview-toggle"
              >
                {showPreview ? tx("partnerAdmin.hidePreview") : tx("partnerAdmin.showPreview")}
              </button>
            </div>
            <textarea
              id="partner-admin-description"
              value={form.description}
              onChange={set("description")}
              rows={8}
              placeholder={tx("partnerAdmin.descriptionPlaceholder")}
              className={`${inputCls} resize-y font-mono text-[13px]`}
              data-testid="admin-partner-description"
            />
            <p className="text-xs text-[#a0a0a0] mt-2">
              {tx("partnerAdmin.markdownHint")} · {descriptionLength} {tx("partnerAdmin.chars")}
            </p>
            {showPreview && descriptionLength > 0 && (
              <div
                className="mt-3 border border-white/10 bg-[#0c0c0c] p-4 text-sm text-[#c8c8c8]"
                data-testid="admin-partner-description-preview"
              >
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#D8CA82] mb-3">
                  {tx("partnerAdmin.preview")}
                </p>
                <Markdown source={form.description} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="partner-admin-cta-label" className={labelCls}>
                {tx("partnerAdmin.ctaLabel")}
              </label>
              <input
                id="partner-admin-cta-label"
                value={form.ctaLabel}
                onChange={set("ctaLabel")}
                placeholder={tx("partnerAdmin.ctaLabelPlaceholder")}
                className={inputCls}
                data-testid="admin-partner-cta-label"
              />
            </div>
            <div>
              <label htmlFor="partner-admin-cta-url" className={labelCls}>
                {tx("partnerAdmin.ctaUrl")}
              </label>
              <input
                id="partner-admin-cta-url"
                value={form.ctaUrl}
                onChange={set("ctaUrl")}
                placeholder="https://…"
                className={inputCls}
                data-testid="admin-partner-cta-url"
              />
            </div>
          </div>
          <p className="text-xs text-[#a0a0a0] -mt-3">{tx("partnerAdmin.ctaHint")}</p>

          <div>
            <label htmlFor="partner-admin-website" className={labelCls}>
              {tx("partnerAdmin.website")}
            </label>
            <input
              id="partner-admin-website"
              value={form.website}
              onChange={set("website")}
              placeholder="https://…"
              className={inputCls}
              data-testid="admin-partner-website"
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              data-testid="admin-partner-submit"
              className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow inline-flex items-center gap-2"
            >
              {editId ? <Pencil size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
              {editId ? tx("partnerAdmin.save") : tx("partnerAdmin.create")}
            </button>
            {editId && (
              <button
                type="button"
                onClick={reset}
                data-testid="admin-partner-cancel"
                className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-5"
              >
                {t("common.cancel")}
              </button>
            )}
          </div>
        </form>

        <div className="lg:col-span-7 space-y-3" data-testid="admin-partners-list">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[#f7f7f7]/50">
              {tx("partnerAdmin.count")} · {items.length}
            </p>
            <Link
              to="/partenaires"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs uppercase tracking-widest text-[#D8CA82] hover:underline inline-flex items-center gap-1"
            >
              {tx("partnerAdmin.viewPage")} <ExternalLink size={11} aria-hidden="true" />
            </Link>
          </div>

          {items.length === 0 && (
            <div className="border border-white/10 bg-[#1A1A1A] p-8 text-center" data-testid="admin-partners-empty">
              <Handshake className="text-[#D8CA82]/50 mx-auto mb-3" size={28} aria-hidden="true" />
              <p className="text-sm text-[#c8c8c8]">{tx("partnerAdmin.empty")}</p>
            </div>
          )}

          {items.map((partner) => {
            const logo = partnerLogoSrc(partner);
            const active = partner.active !== false && partner.published !== false;
            return (
              <div
                key={partner.id}
                className="flex items-start gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3"
                data-testid={`admin-partner-row-${partner.id}`}
              >
                <div className="w-14 h-14 shrink-0 border border-white/10 bg-[#0c0c0c] flex items-center justify-center overflow-hidden">
                  {logo ? (
                    <img src={logo} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="text-[#a0a0a0]" size={18} aria-hidden="true" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#f7f7f7] truncate">
                    {partner.name || tx("partnerAdmin.untitled")}{" "}
                    <span className="text-xs text-[#a0a0a0]">/{partnerSlug(partner)}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase tracking-widest border border-white/15 px-2 py-0.5 text-[#c8c8c8]">
                      {t(`partners.tiers.${partnerTier(partner)}`)}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 ${
                        active
                          ? "text-emerald-300 border-emerald-300/40"
                          : "text-[#a0a0a0] border-white/15"
                      }`}
                    >
                      {active ? tx("partnerAdmin.visible") : tx("partnerAdmin.hidden")}
                    </span>
                    <span className="text-[11px] text-[#a0a0a0]">
                      #{partner.order ?? 0}
                    </span>
                  </div>
                  {partner.description && (
                    <p className="text-xs text-[#a0a0a0] truncate mt-1">
                      {partner.description.replace(/[#*_>`~\[\]()!]/g, " ").replace(/\s+/g, " ").trim()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    to={partnerFichePath(partner)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={tx("partnerAdmin.openFiche")}
                    aria-label={`${tx("partnerAdmin.openFiche")} ${partner.name || ""}`}
                    className="text-[#D8CA82]/70 hover:text-[#D8CA82]"
                    data-testid={`admin-partner-open-${partner.id}`}
                  >
                    <ExternalLink size={15} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleActive(partner)}
                    title={active ? tx("partnerAdmin.hide") : tx("partnerAdmin.show")}
                    aria-label={`${active ? tx("partnerAdmin.hide") : tx("partnerAdmin.show")} ${partner.name || ""}`}
                    className="text-[#f7f7f7]/60 hover:text-[#D8CA82]"
                    data-testid={`admin-partner-toggle-${partner.id}`}
                  >
                    {active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => edit(partner)}
                    title={t("admin.edit")}
                    aria-label={`${t("admin.edit")} ${partner.name || ""}`}
                    className="text-[#D8CA82]/70 hover:text-[#D8CA82]"
                    data-testid={`admin-partner-edit-${partner.id}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <ConfirmAction
                    title={tx("partnerAdmin.deleteTitle")}
                    description={tx("partnerAdmin.deleteDesc")}
                    confirmLabel={t("common.delete")}
                    onConfirm={() => del(partner)}
                  >
                    <button
                      type="button"
                      title={t("common.delete")}
                      aria-label={`${t("common.delete")} ${partner.name || ""}`}
                      className="text-red-400/70 hover:text-red-400"
                      data-testid={`admin-partner-delete-${partner.id}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </ConfirmAction>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminPartners;
