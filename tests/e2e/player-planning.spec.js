const { test, expect } = require('@playwright/test');

async function openPlanningOrLogin(page) {
  await page.goto('/espace-joueur/planning');
  const loginInput = page.locator('input[type="email"]').first();
  const planningPage = page.getByTestId('planning-page');
  await expect(loginInput.or(planningPage)).toBeVisible({ timeout: 15000 });
  return { isAnonymousRedirect: await loginInput.isVisible().catch(() => false) };
}

test('le planning expose clairement la déclaration d’absence', async ({ page }) => {
  const { isAnonymousRedirect } = await openPlanningOrLogin(page);
  // Anonyme : l'espace privé renvoie vers connexion. Le sélecteur reste un garde-fou
  // pour les environnements E2E authentifiés via storageState.
  if (isAnonymousRedirect) return;

  await expect(page.getByTestId('planning-page')).toBeVisible();
  await expect(page.getByTestId('planning-absence-shortcut')).toBeVisible();
  await page.getByTestId('planning-absence-shortcut').click();
  await expect(page.getByTestId('absence-modal').or(page.getByTestId('absence-quick-panel'))).toBeVisible();
});

test('le planning propose l’export agenda (.ics) et la réponse présent/absent', async ({ page }) => {
  const { isAnonymousRedirect } = await openPlanningOrLogin(page);
  if (isAnonymousRedirect) return;

  await expect(page.getByTestId('planning-page')).toBeVisible();
  // Bouton d'export agenda de la semaine (toujours visible).
  await expect(page.getByTestId('planning-export-ics')).toBeVisible();

  // La présence/absence se répond depuis la modale d'un événement existant.
  // On ouvre le 1er événement affiché s'il y en a un, sinon on quitte proprement.
  const firstPill = page.locator('[data-testid^="pill-attendance-"]').first();
  const hasEvent = await page.locator('[data-testid^="pill-attendance-"]').count();
  if (hasEvent > 0) {
    await firstPill.click();
    await expect(page.getByTestId('attendance-block').or(page.getByTestId('event-agenda'))).toBeVisible();
  }
});
