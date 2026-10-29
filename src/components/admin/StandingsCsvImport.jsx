import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  FileUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../../lib/i18n";
import {
  MAX_CSV_BYTES,
  STANDINGS_CSV_TEMPLATE,
  describeDelimiter,
  mergeStandingsRows,
  parseStandingsCsv,
} from "../../lib/standingsCsv";

const PREVIEW_LIMIT = 12;
const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".txt"];
/** Lit un fichier texte (FileReader en secours pour les navigateurs anciens). */
const readFileText = (file) => new Promise((resolve, reject) => {
  if (typeof file.text === "function") {
    file.text().then(resolve, reject);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error || new Error("read-error"));
  reader.readAsText(file);
});

const ERROR_KEYS = {
  empty: "admin.standingsCsv.error.empty",
  "no-rows": "admin.standingsCsv.error.noRows",
  "too-large": "admin.standingsCsv.error.size",
};

/**
 * Import d'un classement depuis un fichier .csv (ou un copier/coller).
 * Le composant ne modifie rien lui-même : il prévisualise l'analyse puis
 * remonte le classement fusionné via `onApply(rows)`.
 */
export function StandingsCsvImport({ existingStandings = [], onApply, disabled = false }) {
  const { t } = useLang();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [errorKey, setErrorKey] = useState("");
  const [mode, setMode] = useState("replace");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  const reset = () => {
    setParsed(null);
    setErrorKey("");
    setFileName("");
    setPasteValue("");
    setPasteOpen(false);
    setDragOver(false);
  };

  const ingest = (text, name = "") => {
    const result = parseStandingsCsv(text);
    setFileName(name);
    setOpen(true);
    if (result.errors.length) {
      setParsed(null);
      setErrorKey(ERROR_KEYS[result.errors[0]] || ERROR_KEYS.empty);
      return;
    }
    setErrorKey("");
    setParsed(result);
  };

  const readFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      setParsed(null);
      setFileName(file.name);
      setErrorKey(ERROR_KEYS["too-large"]);
      setOpen(true);
      return;
    }
    const lower = file.name.toLowerCase();
    const looksLikeCsv = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    try {
      const text = await readFileText(file);
      ingest(text, file.name);
      if (!looksLikeCsv) toast.error(t("admin.standingsCsv.error.extension"));
    } catch (err) {
      console.error(err);
      setParsed(null);
      setErrorKey("admin.standingsCsv.error.format");
      setOpen(true);
    }
  };

  const onFileInput = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await readFile(file);
  };

  const onDrop = async (event) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer?.files?.[0];
    await readFile(file);
  };

  const applyPaste = () => {
    if (!pasteValue.trim()) { setErrorKey(ERROR_KEYS.empty); return; }
    ingest(pasteValue, t("admin.standingsCsv.pasted"));
    setPasteOpen(false);
  };

  const downloadTemplate = () => {
    const blob = new Blob([`\uFEFF${STANDINGS_CSV_TEMPLATE}\n`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modele-classement-elysium.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const apply = () => {
    if (!parsed?.rows?.length) return;
    const merged = mergeStandingsRows(existingStandings, parsed.rows, mode);
    onApply?.(merged, { mode, imported: parsed.rows.length });
    toast.success(`${parsed.rows.length} ${t("admin.standingsCsv.applied")}`);
    reset();
    setOpen(false);
  };

  const cancel = () => {
    reset();
    setOpen(false);
  };

  const previewRows = parsed?.rows ? parsed.rows.slice(0, PREVIEW_LIMIT) : [];
  const hiddenCount = parsed?.rows ? parsed.rows.length - previewRows.length : 0;

  return (
    <div className="border border-[#D8CA82]/25 bg-[#141414] p-4 mb-4" data-testid="admin-standings-csv">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82] flex items-center gap-2">
            <FileSpreadsheet size={14} aria-hidden="true" /> {t("admin.standingsCsv.title")}
          </p>
          <p className="text-xs text-[#c8c8c8] mt-1 max-w-xl">{t("admin.standingsCsv.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            onChange={onFileInput}
            className="sr-only"
            data-testid="admin-standings-csv-input"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="border border-[#D8CA82]/50 text-[#D8CA82] font-display font-bold uppercase tracking-widest text-xs px-4 py-2 flex items-center gap-2 hover:bg-[#D8CA82]/10 disabled:opacity-40"
            data-testid="admin-standings-csv-import-btn"
          >
            <FileUp size={14} aria-hidden="true" /> {t("admin.standingsCsv.import")}
          </button>
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            aria-expanded={pasteOpen}
            className="border border-white/20 text-[#f7f7f7]/80 text-xs uppercase tracking-widest px-3 py-2 flex items-center gap-2 hover:border-[#D8CA82]/40 hover:text-[#D8CA82]"
            data-testid="admin-standings-csv-paste-toggle"
          >
            <ClipboardPaste size={14} aria-hidden="true" /> {t("admin.standingsCsv.paste")}
          </button>
          <button
            type="button"
            onClick={downloadTemplate}
            className="border border-white/15 text-[#c8c8c8] text-xs uppercase tracking-widest px-3 py-2 flex items-center gap-2 hover:text-[#D8CA82] hover:border-[#D8CA82]/40"
            data-testid="admin-standings-csv-template"
          >
            <Download size={14} aria-hidden="true" /> {t("admin.standingsCsv.template")}
          </button>
        </div>
      </div>

      {pasteOpen && (
        <div className="mt-4" data-testid="admin-standings-csv-paste-panel">
          <label htmlFor="standings-csv-paste" className="sr-only">{t("admin.standingsCsv.paste")}</label>
          <textarea
            id="standings-csv-paste"
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            rows={4}
            placeholder={t("admin.standingsCsv.pastePlaceholder")}
            className="w-full bg-[#111111] border border-white/20 px-3 py-2 text-xs font-mono text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
            data-testid="admin-standings-csv-paste-input"
          />
          <button
            type="button"
            onClick={applyPaste}
            className="mt-2 border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest px-4 py-2 hover:bg-[#D8CA82]/10"
            data-testid="admin-standings-csv-paste-apply"
          >
            {t("admin.standingsCsv.analyze")}
          </button>
        </div>
      )}

      {open && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mt-4 border border-dashed px-4 py-5 text-center transition-colors ${dragOver ? "border-[#D8CA82] bg-[#D8CA82]/10" : "border-white/20 bg-[#0f0f0f]"}`}
          data-testid="admin-standings-csv-dropzone"
        >
          <p className="text-xs text-[#c8c8c8]">
            <FileUp size={14} className="inline mr-2 text-[#D8CA82]" aria-hidden="true" />
            {t("admin.standingsCsv.drop")}
          </p>
          <p className="text-[11px] text-[#c8c8c8]/60 mt-1">{t("admin.standingsCsv.dropFormat")}</p>
        </div>
      )}

      {errorKey && (
        <p className="mt-3 text-xs text-red-300 flex items-center gap-2" role="alert" data-testid="admin-standings-csv-error">
          <AlertTriangle size={14} aria-hidden="true" /> {t(errorKey)}
        </p>
      )}

      {parsed && (
        <div className="mt-4" data-testid="admin-standings-csv-preview">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#c8c8c8]">
            {fileName && <span className="text-[#f7f7f7]/80">{fileName}</span>}
            <span>· {parsed.rows.length} {t("admin.standingsCsv.teams")}</span>
            <span>· {describeDelimiter(parsed.delimiter)}</span>
            <span>
              · {parsed.headerDetected ? t("admin.standingsCsv.headerDetected") : t("admin.standingsCsv.headerMissing")}
            </span>
          </div>

          {parsed.warnings.includes("header-missing") && (
            <p className="mt-2 text-[11px] text-amber-300/90">
              {t("admin.standingsCsv.headerMissingHelp")}
            </p>
          )}
          {parsed.ignoredHeaders.length > 0 && (
            <p className="mt-1 text-[11px] text-[#c8c8c8]/70">
              {t("admin.standingsCsv.ignored")} : {parsed.ignoredHeaders.join(", ")}
            </p>
          )}
          {parsed.skippedRows > 0 && (
            <p className="mt-1 text-[11px] text-[#c8c8c8]/70">
              {parsed.skippedRows} {t("admin.standingsCsv.skipped")}
            </p>
          )}

          <div className="overflow-x-auto mt-3 border border-white/10">
            <table className="w-full text-xs">
              <thead className="text-[#c8c8c8] uppercase tracking-widest bg-[#1A1A1A]">
                <tr>
                  <th className="text-left py-2 px-2">#</th>
                  <th className="text-left">{t("admin.standingsCsv.team")}</th>
                  <th className="text-center">J</th>
                  <th className="text-center">V</th>
                  <th className="text-center">N</th>
                  <th className="text-center">D</th>
                  <th className="text-center">+/-</th>
                  <th className="text-right px-2">Pts</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={`${row.team}-${index}`} className="border-t border-white/5" data-testid={`admin-standings-csv-row-${index}`}>
                    <td className="py-1.5 px-2 text-[#c8c8c8]">{index + 1}</td>
                    <td className="py-1.5 font-semibold text-[#f7f7f7]">{row.team}</td>
                    <td className="text-center text-[#c8c8c8]">{row.played}</td>
                    <td className="text-center text-emerald-300/80">{row.wins}</td>
                    <td className="text-center text-[#c8c8c8]">{row.draws}</td>
                    <td className="text-center text-red-300/60">{row.losses}</td>
                    <td className="text-center text-[#c8c8c8]">{row.diff || "—"}</td>
                    <td className="text-right px-2 font-bold text-[#D8CA82]">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hiddenCount > 0 && (
            <p className="mt-2 text-[11px] text-[#c8c8c8]/70">
              + {hiddenCount} {t("admin.standingsCsv.moreRows")}
            </p>
          )}

          <fieldset className="mt-4">
            <legend className="text-[11px] uppercase tracking-[0.2em] text-[#c8c8c8] mb-2">
              {t("admin.standingsCsv.target")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {["replace", "append"].map((value) => (
                <label
                  key={value}
                  className={`cursor-pointer border px-3 py-1.5 text-[11px] uppercase tracking-widest ${mode === value ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#c8c8c8] hover:text-[#f7f7f7]"}`}
                  data-testid={`admin-standings-csv-mode-${value}`}
                >
                  <input
                    type="radio"
                    name="standings-csv-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="sr-only"
                  />
                  {t(`admin.standingsCsv.mode.${value}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {mode === "replace" && existingStandings.length > 0 && (
            <p className="mt-2 text-[11px] text-amber-300/80" data-testid="admin-standings-csv-replace-warning">
              {existingStandings.length} {t("admin.standingsCsv.replaceWarning")}
            </p>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={apply}
              className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-2.5 flex items-center gap-2 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)]"
              data-testid="admin-standings-csv-apply"
            >
              <Check size={14} aria-hidden="true" /> {t("admin.standingsCsv.apply")}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="border border-white/20 text-[#c8c8c8] text-xs uppercase tracking-widest px-4 py-2.5 flex items-center gap-2 hover:text-[#f7f7f7]"
              data-testid="admin-standings-csv-cancel"
            >
              <X size={14} aria-hidden="true" /> {t("admin.standingsCsv.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default StandingsCsvImport;
