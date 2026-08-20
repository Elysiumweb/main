import { useRef, useState, useCallback } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { toast } from "sonner";
import { UploadCloud, X, ImageIcon, Loader2 } from "lucide-react";
import { storage } from "../lib/firebase";
import { useLang } from "../lib/i18n";

/* ---------------------------------------------------------------------------
 * Upload direct d'image vers Firebase Storage.
 * - Drag & drop + sélecteur de fichier
 * - Compression client (canvas) : JPEG, largeur max configurable
 * - Progression, aperçu, et champ URL de secours (liens externes existants)
 * ------------------------------------------------------------------------- */

const compressImage = (file, maxWidth) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-error"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode-error"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas-error"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("encode-error"))),
          "image/jpeg",
          0.82
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

const extensionFor = (file) => {
  const name = (file.name || "").toLowerCase();
  if (/\.png$/.test(name)) return "png";
  if (/\.webp$/.test(name)) return "webp";
  if (/\.gif$/.test(name)) return "gif";
  return "jpg";
};

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

  const upload = useCallback(async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("upload.invalidType"));
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const blob = await compressImage(file, maxWidth);
      const ext = extensionFor(file);
      const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, blob, { contentType: "image/jpeg" });
      task.on("state_changed",
        (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => {
          console.error("[upload]", err);
          setBusy(false);
          toast.error(t("upload.error"));
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          onChange(url);
          setBusy(false);
          toast.success(t("upload.success"));
        });
    } catch (err) {
      console.error("[upload]", err);
      setBusy(false);
      toast.error(t("upload.error"));
    }
  }, [folder, maxWidth, onChange, t]);

  return (
    <div data-testid={testId} className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label={label || t("upload.label")}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
        className={`border border-dashed p-4 text-center cursor-pointer transition-colors ${
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
        ) : (
          <span className="flex flex-col items-center gap-2 text-[#c8c8c8]">
            <UploadCloud size={20} className="text-[#D8CA82]" aria-hidden="true" />
            <span className="text-xs uppercase tracking-[0.2em]">{label || t("upload.label")}</span>
            <span className="text-xs text-[#c8c8c8]">{t("upload.hint")}</span>
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

      <label className="flex items-center gap-2 text-xs text-[#c8c8c8] cursor-pointer" data-testid={`${testId}-url-toggle`}>
        <ImageIcon size={12} className="text-[#D8CA82]/70" aria-hidden="true" />
        <span>{t("upload.orUrl")}</span>
        <input
          type="url"
          value={/^https?:/i.test(value || "") ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="flex-1 bg-[#111111] border border-white/15 px-2 py-1.5 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
          data-testid={`${testId}-url`}
        />
      </label>
    </div>
  );
};
