const { test, expect } = require('@playwright/test');

test.describe('parcours critiques publics', () => {
  test('navigation mobile vers recrutement, résultats et support', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-hero')).toBeVisible();

    if (isMobile) {
      const menu = page.getByRole('button', { name: /menu|ouvrir/i });
      if (await menu.count()) await menu.first().click();
    }

    await page.getByTestId('home-cta-results').click();
    await expect(page.getByTestId('results-title')).toBeVisible();
    await page.goto('/support');
    await expect(page.getByTestId('support-title')).toBeVisible();
    await page.goto('/recrutement');
    await expect(page.getByTestId('recruit-title')).toBeVisible();
  });

  test('consultation des résultats et détail de match quand des données existent', async ({ page }) => {
    await page.goto('/resultats');
    await expect(page.getByTestId('results-title')).toBeVisible();
    const firstCard = page.locator('[data-testid^="match-card-"]').first();
    if (await firstCard.count()) {
      await firstCard.click();
      await expect(page.locator('[data-testid^="match-detail-"]').first()).toBeVisible();
    } else {
      await expect(page.getByTestId('results-empty').or(page.getByTestId('results-loading'))).toBeVisible();
    }
  });

  test('404 dédiée sans redirection silencieuse', async ({ page }) => {
    await page.goto('/route-inconnue-e2e');
    await expect(page.getByTestId('not-found-page')).toBeVisible();
    await expect(page).toHaveURL(/route-inconnue-e2e/);
  });
});

test.describe('authentification et formulaires protégés', () => {
  test('connexion visible et candidature invite à se connecter si anonyme', async ({ page }) => {
    await page.goto('/connexion');
    await expect(page.locator('input[type="email"]').first()).toBeVisible();

    await page.goto('/recrutement');
    await expect(page.getByTestId('recruit-title')).toBeVisible();
    await expect(page.getByTestId('recruit-login-prompt')).toBeVisible();
  });

  test('support invite à se connecter si anonyme', async ({ page }) => {
    await page.goto('/support');
    await expect(page.getByTestId('support-login-prompt')).toBeVisible();
  });
});
