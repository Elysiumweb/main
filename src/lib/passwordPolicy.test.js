import { PASSWORD_MIN_LENGTH, passwordStrength, passwordIssues } from "./passwordPolicy";

describe("passwordPolicy", () => {
  it("expose une politique unique à 8 caractères minimum", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("signale les mots de passe trop courts (ancienne règle 6 caractères refusée)", () => {
    expect(passwordIssues("abc123").length).toBeGreaterThan(0);
    expect(passwordIssues("abcd1234")).toEqual([]);
  });

  it("marque un mot de passe court comme invalide", () => {
    expect(passwordStrength("abc123").valid).toBe(false);
    expect(passwordStrength("abcd1234").valid).toBe(true);
  });

  it("note faiblement les mots de passe triviaux", () => {
    expect(passwordStrength("12345678").score).toBeLessThanOrEqual(1);
    expect(passwordStrength("password").score).toBeLessThanOrEqual(1);
    expect(passwordStrength("aaaaaaaaaa").score).toBeLessThanOrEqual(1);
  });

  it("note fortement un mot de passe long et varié", () => {
    expect(passwordStrength("Tr0mb0ne!Doré#2026").score).toBeGreaterThanOrEqual(3);
  });

  it("progresse avec la longueur et la variété", () => {
    const weak = passwordStrength("abcdefgh").score;
    const strong = passwordStrength("Abcdefgh1234!").score;
    expect(strong).toBeGreaterThan(weak);
  });
});
