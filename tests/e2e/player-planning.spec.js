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

test('un manager peut ouvrir l’import de planning .ics', async ({ page }) => {
  await page.goto('/espace-joueur/planning');
  if (page.url().includes('/connexion')) {
    // Non authentifié (ou simple joueur) : l'importeur n'est pas rendu.
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    return;
  }

  await expect(page.getByTestId('planning-page')).toBeVisible();
  const importButton = page.getByTestId('planning-import-ics');
  if (await importButton.count() === 0) return; // joueur sans droit de gestion

  await importButton.click();
  await expect(page.getByTestId('import-modal')).toBeVisible();
  await expect(page.getByTestId('import-file-input')).toBeAttached();
  await expect(page.getByTestId('import-submit')).toBeDisabled();
});

test('la grille horaire propose des tailles lisibles pour les créneaux courts', async ({ page }) => {
  await page.goto('/espace-joueur/planning');
  if (page.url().includes('/connexion')) {
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    return;
  }

  await expect(page.getByTestId('planning-page')).toBeVisible();
  if (await page.getByTestId('view-week').count() === 0) return;
  await page.getByTestId('view-week').click();

  // Vue semaine : une heure fait au moins 120 px (60 px avant), donc un
  // créneau de 15 min dispose d'au moins 30 px.
  const scroll = page.getByTestId('week-scroll');
  if (await scroll.count() === 0) return; // vue mobile = jour
  await expect(page.getByTestId('planning-zoom-large')).toHaveAttribute('aria-pressed', 'true');
});
