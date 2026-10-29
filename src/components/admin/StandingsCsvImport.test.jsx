import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { LanguageProvider } from "../../lib/i18n";
import { StandingsCsvImport } from "./StandingsCsvImport";

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

let container;
let root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props) => act(() => {
  root.render(
    <LanguageProvider>
      <StandingsCsvImport onApply={() => {}} {...props} />
    </LanguageProvider>,
  );
});

const $ = (id) => container.querySelector(`[data-testid="${id}"]`);
const click = (id) => act(() => { $(id).click(); });

const setValue = (element, value) => {
  const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value").set;
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const selectCsvFile = async (name, content) => {
  const file = new File([content], name, { type: "text/csv" });
  file.text = async () => content;
  const input = $("admin-standings-csv-input");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const csv = [
  "Équipe;J;V;N;D;Pts;+/-",
  "Team Bravo;10;5;1;4;16;-3",
  "Elysium;10;8;1;1;25;+18",
].join("\n");

describe("StandingsCsvImport", () => {
  test("propose l'import .csv, le modèle et le collage", () => {
    render({});
    expect($("admin-standings-csv-import-btn")).not.toBeNull();
    expect($("admin-standings-csv-template")).not.toBeNull();
    expect($("admin-standings-csv-paste-toggle")).not.toBeNull();
    expect(container.textContent).toContain("équipes, J, V, N, D, Pts, +/-");
  });

  test("importe un fichier .csv et prévisualise les équipes triées", async () => {
    render({});
    await selectCsvFile("classement.csv", csv);
    expect($("admin-standings-csv-preview")).not.toBeNull();
    expect($("admin-standings-csv-row-0").textContent).toContain("Elysium");
    expect($("admin-standings-csv-row-1").textContent).toContain("Team Bravo");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("équipe(s) détectée(s)");
  });

  test("applique le classement importé en mode remplacer", async () => {
    const onApply = jest.fn();
    render({ onApply, existingStandings: [{ team: "Ancienne", points: 3 }] });
    await selectCsvFile("classement.csv", csv);
    click("admin-standings-csv-apply");
    expect(onApply).toHaveBeenCalledTimes(1);
    const [rows, info] = onApply.mock.calls[0];
    expect(info).toEqual({ mode: "replace", imported: 2 });
    expect(rows.map((row) => row.team)).toEqual(["Elysium", "Team Bravo"]);
    expect(rows[0]).toMatchObject({ points: 25, diff: "+18" });
    // L'aperçu est refermé après application.
    expect($("admin-standings-csv-preview")).toBeNull();
  });

  test("ajoute les équipes au classement existant en mode ajouter", async () => {
    const onApply = jest.fn();
    render({ onApply, existingStandings: [{ team: "Ancienne", played: 4, wins: 2, draws: 0, losses: 2, points: 6, diff: "0" }] });
    await selectCsvFile("classement.csv", csv);
    click("admin-standings-csv-mode-append");
    click("admin-standings-csv-apply");
    const [rows] = onApply.mock.calls[0];
    expect(rows.map((row) => row.team)).toEqual(["Elysium", "Team Bravo", "Ancienne"]);
  });

  test("analyse un CSV collé", () => {
    render({});
    click("admin-standings-csv-paste-toggle");
    setValue($("admin-standings-csv-paste-input"), "Elysium,10,8,1,1,25,+18");
    click("admin-standings-csv-paste-apply");
    expect($("admin-standings-csv-preview")).not.toBeNull();
    expect($("admin-standings-csv-row-0").textContent).toContain("Elysium");
  });

  test("affiche une erreur explicite quand aucune équipe n'est trouvée", async () => {
    render({});
    await selectCsvFile("vide.csv", "Équipe;J;V;N;D;Pts;+/-");
    expect($("admin-standings-csv-error").textContent).toContain("Aucune équipe");
    expect($("admin-standings-csv-preview")).toBeNull();
  });

  test("prévient que le mode remplacer écrase les lignes existantes", async () => {
    render({ existingStandings: [{ team: "Ancienne", points: 3 }] });
    await selectCsvFile("classement.csv", csv);
    expect($("admin-standings-csv-replace-warning")).not.toBeNull();
    click("admin-standings-csv-mode-append");
    expect($("admin-standings-csv-replace-warning")).toBeNull();
  });

  test("annuler referme l'aperçu sans rien remonter", async () => {
    const onApply = jest.fn();
    render({ onApply });
    await selectCsvFile("classement.csv", csv);
    click("admin-standings-csv-cancel");
    expect(onApply).not.toHaveBeenCalled();
    expect($("admin-standings-csv-preview")).toBeNull();
  });
});
