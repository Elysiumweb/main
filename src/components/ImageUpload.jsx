import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { UploadCloud, X, Loader2, ImageOff } from "lucide-react";
import { useLang } from "../lib/i18n";
import { compressImage, uploadBlob, uploadErrorKey, isStorageReady, buildUploadPath } from "../lib/imageUpload";

/* ---------------------------------------------------------------------------
 * Envoi d'image vers Firebase Storage.
 * - Glisser-déposer + sélecteur de fichier
 * - Compression client (canvas) : JPEG, largeur max configurable
 * - Progression, aperçu, retrait
 *
 * Les images ne se saisissent plus en URL : tout passe par un vrai fichier,
 * et un envoi qui n'avance pas se termine tout seul au lieu de tourner
 * indéfiniment (voir src/lib/imageUpload.js).
 * ------------------------------------------------------------------------- */

export const ImageUpload = ({
  value,
  onChange,
  label,
  folder = "uploads",
  maxWidth = 1600,
  accept = "image/*",
  testId = "image-upload",
}) => {
  const { t } = useLang();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const configured = isStorageReady();

  const upload = useCallback(async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      toast.error(t("upload.invalidType"));
      return;
    }
    if (!isStorageReady()) {
      toast.error(t("upload.notConfigured"));
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const blob = await compressImage(file, maxWidth);
      const url = await uploadBlob(blob, buildUploadPath(folder, file), { onProgress: setProgress });
      onChange(url);
      toast.success(t("upload.success"));
    } catch (err) {
      console.error("[upload]", err);
      toast.error(t(uploadErrorKey(err)));
    } finally {
      // Toujours relâcher l'état : c'est ce qui faisait rester l'écran bloqué.
      setBusy(false);
    }
  }, [folder, maxWidth, onChange, t]);

  const openPicker = () => {
    if (busy) return;
    if (!configured) {
      toast.error(t("upload.notConfigured"));
      return;
    }
    inputRef.current?.click();
  };

  return (
    <div data-testid={testId} className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={!configured || busy}
        aria-label={label || t("upload.label")}
        onClick={openPicker}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(); } }}
        onDragOver={(e) => { if (!configured) return; e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer?.files?.[0];
          if (f) upload(f);
        }}
        className={`border border-dashed p-4 text-center transition-colors ${
          busy ? "cursor-wait opacity-70"
            : configured ? "cursor-pointer"
            : "cursor-not-allowed opacity-60"
        } ${
          dragOver ? "border-[#D8CA82] bg-[#D8CA82]/10" : "border-white/20 bg-[#0d0d0d] hover:border-[#D8CA82]/60"
        } focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]`}
        data-testid={`${testId}-dropzone`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          data-testid={`${testId}-input`}
        />
        {busy ? (
          <span className="flex flex-col items-center gap-2 text-[#c8c8c8]">
            <Loader2 size={20} className="text-[#D8CA82] animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className="text-xs uppercase tracking-[0.2em]">{t("upload.uploading")} {progress}%</span>
            <span className="block h-1 w-40 bg-white/10 overflow-hidden">
              <span className="block h-full bg-[#D8CA82] transition-all" style={{ width: `${progress}%` }} />
            </span>
          </span>
        ) : configured ? (
          <span className="flex flex-col items-center gap-2 text-[#c8c8c8]">
            <UploadCloud size={20} className="text-[#D8CA82]" aria-hidden="true" />
            <span className="text-xs uppercase tracking-[0.2em]">{label || t("upload.label")}</span>
            <span className="text-xs text-[#c8c8c8]">{t("upload.hint")}</span>
          </span>
        ) : (
          <span className="flex flex-col items-center gap-2 text-[#c8c8c8]" data-testid={`${testId}-unavailable`}>
            <ImageOff size={20} className="text-[#D8CA82]/70" aria-hidden="true" />
            <span className="text-xs uppercase tracking-[0.2em]">{label || t("upload.label")}</span>
            <span className="text-xs">{t("upload.notConfigured")}</span>
          </span>
        )}
      </div>

      {value && (
        <div className="relative border border-white/10 bg-[#0d0d0d] p-2" data-testid={`${testId}-preview`}>
          <img src={value} alt={label || t("upload.preview")} className="h-28 object-cover w-full" />
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("common.delete")}
            data-testid={`${testId}-clear`}
            className="absolute top-1 right-1 bg-[#111111]/90 border border-white/20 text-[#f7f7f7]/70 p-1 hover:text-red-300 hover:border-red-300/50"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
};