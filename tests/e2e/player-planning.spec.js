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
