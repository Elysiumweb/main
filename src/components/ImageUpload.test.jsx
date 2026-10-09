import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

/* ---------------------------------------------------------------------------
 * Le composant d'envoi ne doit plus pouvoir rester bloqué sur « Envoi en
 * cours », et ne doit plus proposer de coller une URL d'image.
 * ------------------------------------------------------------------------- */

const mockToast = { error: jest.fn(), success: jest.fn() };
jest.mock("sonner", () => ({ toast: { error: (...a) => mockToast.error(...a), success: (...a) => mockToast.success(...a) } }));

const mockUpload = {
  compressImage: jest.fn(),
  uploadBlob: jest.fn(),
  isStorageReady: jest.fn(),
  buildUploadPath: jest.fn(),
  uploadErrorKey: jest.fn(),
};
jest.mock("../lib/imageUpload", () => ({
  compressImage: (...a) => mockUpload.compressImage(...a),
  uploadBlob: (...a) => mockUpload.uploadBlob(...a),
  isStorageReady: (...a) => mockUpload.isStorageReady(...a),
  buildUploadPath: (...a) => mockUpload.buildUploadPath(...a),
  uploadErrorKey: (...a) => mockUpload.uploadErrorKey(...a),
}));

const { ImageUpload } = require("./ImageUpload");
const { LanguageProvider } = require("../lib/i18n");

let container;
let root;
let errorSpy;

const render = () =>
  act(() =>
    root.render(
      <LanguageProvider>
        <ImageUpload value="" onChange={() => {}} testId="test-upload" />
      </LanguageProvider>
    )
  );

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  mockUpload.isStorageReady.mockReturnValue(true);
  mockUpload.compressImage.mockResolvedValue({ type: "image/jpeg", size: 12 });
  mockUpload.buildUploadPath.mockReturnValue("media/a.jpg");
  mockUpload.uploadBlob.mockResolvedValue("https://firebasestorage.googleapis.com/o/a.jpg");
  mockUpload.uploadErrorKey.mockImplementation((err) => `key:${err?.code}`);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  errorSpy.mockRestore();
});

const q = (id) => container.querySelector(`[data-testid="${id}"]`);

/* jsdom n'autorise pas l'écriture directe sur .files : on le redéfinit. */
const pickFile = async (name = "photo.jpg", type = "image/jpeg") => {
  const input = q("test-upload-input");
  const file = new File(["x"], name, { type });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("ImageUpload", () => {
  it("ne propose plus de champ URL : uniquement un fichier", () => {
    render();
    expect(q("test-upload-input")).not.toBeNull();
    expect(q("test-upload-url")).toBeNull();
    expect(q("test-upload-url-toggle")).toBeNull();
    expect(container.textContent).not.toMatch(/https:\/\/\.\.\./);
  });

  it("déverrouille l'état « Envoi en cours » et remonte l'URL quand l'envoi réussit", async () => {
    render();
    await pickFile();
    expect(q("test-upload-dropzone").textContent).not.toMatch(/Envoi en cours/);
    expect(mockUpload.uploadBlob).toHaveBeenCalledTimes(1);
    expect(mockToast.success).toHaveBeenCalled();
  });

  it("sort de l'état occupé même quand l'envoi échoue (pas de boucle)", async () => {
    mockUpload.uploadBlob.mockRejectedValue(Object.assign(new Error("stalled"), { code: "stalled" }));
    render();
    await pickFile();
    expect(container.textContent).not.toMatch(/Envoi en cours/);
    expect(q("test-upload-dropzone")).not.toBeNull();
    expect(mockToast.error).toHaveBeenCalledWith("key:stalled");
  });

  it("signale le stockage non configuré au lieu de bloquer sur l'envoi", async () => {
    mockUpload.isStorageReady.mockReturnValue(false);
    render();
    expect(q("test-upload-unavailable")).not.toBeNull();
    await pickFile();
    expect(mockUpload.uploadBlob).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith("Le stockage d'images n'est pas configuré sur ce site. Contactez l'administrateur.");
  });

  it("refuse un fichier qui n'est pas une image", async () => {
    render();
    await pickFile("notes.pdf", "application/pdf");
    expect(mockUpload.uploadBlob).not.toHaveBeenCalled();
  });
});