const { test, expect } = require('@playwright/test');

/**
 * Parcours public Support + Recrutement.
 * Ces tests ne dépendent d'aucune donnée Firestore : ils valident ce qui doit
 * être visible même sans compte et sans contenu publié (le plus important :
 * un visiteur bloqué avec son compte doit pouvoir écrire au support).
 */
test.describe('support accessible sans compte', () => {
  test('le lien Discord est mis en avant et le ticket invité est ouvert', async ({ page }) => {
    await page.goto('/support');

    await expect(page.getByTestId('support-discord-cta')).toBeVisible();
    const discord = page.getByTestId('support-discord-btn');
    await expect(discord).toBeVisible();
    await expect(discord).toHaveAttribute('href', 'https://discord.gg/RH3ZZkMJsw');

    // Le visiteur garde la porte de connexion (suivi en direct)…
    await expect(page.getByTestId('support-login-prompt')).toBeVisible();
    // …mais n'est plus bloqué pour écrire.
    await expect(page.getByTestId('support-guest-block')).toBeVisible();
    await expect(page.getByTestId('support-guest-email')).toBeVisible();
    await expect(page.getByTestId('support-guest-submit')).toBeVisible();
  });

  test('le ticket invité refuse un email invalide sans appeler le serveur', async ({ page }) => {
    await page.goto('/support');
    await page.getByTestId('support-guest-email').fill('pas-un-email');
    await page.getByTestId('support-guest-subject').fill('Mot de passe oublié');
    await page.getByTestId('support-guest-desc').fill('Je ne peux plus me connecter à mon compte.');
    await page.getByTestId('support-guest-submit').click();
    await expect(page.getByText(/invalid/i).first()).toBeVisible();
  });

  test('la page de suivi d\'une demande est accessible et sans compte', async ({ page }) => {
    await page.goto('/suivi-demande');
    await expect(page.getByTestId('support-track-title')).toBeVisible();
    await expect(page.getByTestId('support-track-form')).toBeVisible();
    await expect(page.getByTestId('support-track-discord')).toHaveAttribute('href', 'https://discord.gg/RH3ZZkMJsw');
  });
});

test.describe('centre d\'aide structuré', () => {
  test('filtre les questions par jeu', async ({ page }) => {
    await page.goto('/support');
    await expect(page.getByTestId('support-faq')).toBeVisible();
    await expect(page.getByTestId('support-help-game-filter')).toBeVisible();

    // La FAQ de secours contient des articles EVA et Rocket League.
    const rlButton = page.getByTestId('support-help-game-Rocket-League');
    await expect(rlButton).toBeVisible();
    await rlButton.click();
    await expect(page.getByText(/Rocket League/).first()).toBeVisible();
    await expect(page.getByText('Comment créer un compte ?')).toBeHidden();

    await page.getByTestId('support-help-game-all').click();
    await expect(page.getByText('Comment créer un compte ?')).toBeVisible();
  });

  test('la recherche plein texte filtre les questions', async ({ page }) => {
    await page.goto('/support');
    await page.getByTestId('support-help-search').fill('mot de passe');
    await expect(page.getByText("J'ai oublié mon mot de passe.")).toBeVisible();
    await expect(page.getByText('Comment créer un compte ?')).toBeHidden();
  });
});

test.describe('parcours de candidature visible', () => {
  test('la frise d\'étapes et les tryouts sont visibles sans compte', async ({ page }) => {
    await page.goto('/recrutement');

    await expect(page.getByTestId('recruit-process')).toBeVisible();
    for (const step of ['received', 'test', 'interview', 'decision']) {
      await expect(page.getByTestId(`recruit-step-${step}`)).toBeVisible();
    }
    // Les délais moyens sont annoncés publiquement.
    await expect(page.getByText(/moyenne/).first()).toBeVisible();

    await expect(page.getByTestId('recruit-tryout-section')).toBeVisible();
    // Sans créneau planifié, la section reste visible et l'explique.
    await expect(page.getByTestId('recruit-tryout-empty').or(page.getByTestId('recruit-tryout-list'))).toBeVisible();
  });
});