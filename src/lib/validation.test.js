/* ---------------------------------------------------------------------------
 * Les champs image des formulaires admin reçoivent soit une URL http(s),
 * soit une data URL base64 produite par ImageUpload (image stockée dans
 * Firestore). Ces tests verrouillent les deux formats acceptés, et le rejet
 * des valeurs quelconque (ex: saisie libre "mon logo").
 * ------------------------------------------------------------------------- */

const { isHttpUrl, isOptionalHttpUrl, isDataImageUrl, isImageValue } = require("./validation");

const DATA_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2w==";
const DATA_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

describe("isHttpUrl", () => {
  test("accepte http et https", () => {
    expect(isHttpUrl("https://twitch.tv/elysium")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
  });
  test("rejette vide, texte libre et autres schémas", () => {
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
    expect(isHttpUrl("mon logo")).toBe(false);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl(DATA_JPEG)).toBe(false);
  });
  test("tolère les espaces autour", () => {
    expect(isHttpUrl("  https://youtu.be/abc  ")).toBe(true);
  });
});

describe("isOptionalHttpUrl", () => {
  test("accepte vide et URL http(s)", () => {
    expect(isOptionalHttpUrl("")).toBe(true);
    expect(isOptionalHttpUrl(undefined)).toBe(true);
    expect(isOptionalHttpUrl("https://youtube.com/watch?v=1")).toBe(true);
  });
  test("rejette une valeur non vide invalide", () => {
    expect(isOptionalHttpUrl("youtube.com/watch")).toBe(false);
    expect(isOptionalHttpUrl(DATA_JPEG)).toBe(false);
  });
});

describe("isDataImageUrl", () => {
  test("accepte les data URL image produites par ImageUpload", () => {
    expect(isDataImageUrl(DATA_JPEG)).toBe(true);
    expect(isDataImageUrl(DATA_PNG)).toBe(true);
  });
  test("rejette les data URL non image et le base64 invalide", () => {
    expect(isDataImageUrl("data:text/html;base64,PGI+")).toBe(false);
    expect(isDataImageUrl("data:image/jpeg;base64,!!!")).toBe(false);
    expect(isDataImageUrl("https://example.com/logo.png")).toBe(false);
  });
});

describe("isImageValue", () => {
  test("accepte vide, URL externe et data URL image", () => {
    expect(isImageValue("")).toBe(true);
    expect(isImageValue("https://cdn.example.com/logo.png")).toBe(true);
    expect(isImageValue(DATA_JPEG)).toBe(true);
  });
  test("rejette une saisie libre", () => {
    expect(isImageValue("logo-final.png")).toBe(false);
    expect(isImageValue("data:text/html;base64,PGI+")).toBe(false);
  });
});
