const { test, expect } = require('@playwright/test');

async function loginAsAdmin(page) {
  await page.goto('/connexion');
  await page.getByTestId('login-email-input').fill(process.env.E2E_ADMIN_EMAIL);
  await page.getByTestId('login-password-input').fill(process.env.E2E_ADMIN_PASSWORD);
  await page.getByTestId('login-submit-btn').click();
  if (process.env.E2E_ADMIN_TOTP && await page.getByTestId('login-mfa-form').isVisible().catch(() => false)) {
    await page.getByTestId('login-mfa-code-input').fill(process.env.E2E_ADMIN_TOTP);
    await page.getByTestId('login-mfa-submit').click();
  }
}

test.describe('parcours admin', () => {
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, 'E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD requis pour tester les écritures admin');

  test('créer un match depuis l’administration', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    if (await page.getByTestId('admin-mfa-required').isVisible().catch(() => false)) {
      test.skip(!process.env.E2E_ADMIN_TOTP, 'Compte admin protégé par MFA : fournir E2E_ADMIN_TOTP pour ce run');
    }
    await expect(page.getByTestId('admin-title')).toBeVisible();
    await page.getByTestId('admin-tab-matches').click();
    await page.getByTestId('admin-match-game').selectOption('Rocket League');
    await page.getByTestId('admin-match-opponent').fill(`E2E Opponent ${Date.now()}`);
    await page.getByTestId('admin-match-date').fill('2030-01-15');
    await page.getByTestId('admin-match-status').selectOption('upcoming');
    await page.getByTestId('admin-match-time').fill('20:30');
    await page.getByTestId('admin-match-competition').fill('E2E Cup');
    await page.getByTestId('admin-match-submit').click();
    await expect(page.getByText(/enregistré|saved|match/i).or(page.getByTestId('admin-matches-search'))).toBeVisible();
  });

  test('publier un article depuis l’administration', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    if (await page.getByTestId('admin-mfa-required').isVisible().catch(() => false)) {
      test.skip(!process.env.E2E_ADMIN_TOTP, 'Compte admin protégé par MFA : fournir E2E_ADMIN_TOTP pour ce run');
    }
    await expect(page.getByTestId('admin-title')).toBeVisible();
    await page.getByTestId('admin-tab-articles').click();
    await page.getByTestId('admin-article-title').fill(`Article E2E ${Date.now()}`);
    await page.getByTestId('admin-article-excerpt').fill('Résumé généré par le test E2E.');
    await page.getByTestId('admin-article-content').fill('# Titre E2E\n\nContenu de test publié automatiquement.');
    await page.getByTestId('admin-article-publish-btn').click();
    await expect(page.getByTestId('admin-articles-list')).toContainText(/Article E2E/);
  });
});

test.describe('don', () => {
  test('le fallback PayPal reste visible si le SDK est bloqué', async ({ page }) => {
    await page.route(/paypal\.com|paypalobjects\.com/, (route) => route.abort());
    await page.goto('/soutenir');
    await expect(page.getByTestId('donate-title')).toBeVisible();
    await page.getByTestId('donate-card').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('donate-paypal-fallback')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('donate-paypal-fallback-link')).toHaveAttribute('href', /paypal/i);
  });
});
