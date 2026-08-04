const { test, expect } = require('@playwright/test');

test('le planning expose clairement la déclaration d’absence', async ({ page }) => {
  await page.goto('/espace-joueur/planning');
  // Anonyme : l'espace privé renvoie vers connexion. Le sélecteur reste un garde-fou
  // pour les environnements E2E authentifiés via storageState.
  if (page.url().includes('/connexion')) {
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    return;
  }

  await expect(page.getByTestId('planning-page')).toBeVisible();
  await expect(page.getByTestId('planning-absence-shortcut')).toBeVisible();
  await page.getByTestId('planning-absence-shortcut').click();
  await expect(page.getByTestId('absence-modal').or(page.getByTestId('absence-quick-panel'))).toBeVisible();
});

test('le planning propose l’export agenda (.ics) et la réponse présent/absent', async ({ page }) => {
  await page.goto('/espace-joueur/planning');
  if (page.url().includes('/connexion')) {
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    return;
  }

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
