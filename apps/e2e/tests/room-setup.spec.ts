import { test, expect, type Page } from "@playwright/test";

// Camino feliz de Fase 1: "crear sala → unirse → armar equipos", sin
// ningún minijuego todavía. Cubre los criterios Given/When/Then de
// spec.md de "Motor de sala", "Armado de equipos", "Vista de pantalla" y
// "Vista de jugador". Ver specs/features/e2e-room-setup/analysis.md.

async function createRoom(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Crear sala" }).click();
  await page.waitForURL(/\/screen\/.+/);
  const code = new URL(page.url()).pathname.split("/").pop();
  if (!code) throw new Error("No se pudo extraer el código de sala de la URL");
  return code;
}

async function createTeam(page: Page, name: string, swatchLabel: string) {
  await page.getByPlaceholder("Nombre del equipo").fill(name);
  await page.getByRole("button", { name: swatchLabel }).click();
  await page.getByRole("button", { name: "Agregar equipo" }).click();
}

test("crear sala, unirse y armar equipos", async ({ browser }) => {
  const screenContext = await browser.newContext();
  const screen = await screenContext.newPage();

  const code = await createRoom(screen);

  const revealButton = screen.getByRole("button", {
    name: "Mostrar código a los jugadores",
  });
  await expect(revealButton).toBeDisabled();
  await expect(screen.getByText(code, { exact: true })).not.toBeVisible();

  // Crear un equipo con el nombre equivocado y corregirlo con "eliminar"
  // (criterio de remove_team / host-controls).
  await createTeam(screen, "Rojso", "Elegir color #ef4444");
  await expect(screen.getByRole("heading", { name: "Rojso" })).toBeVisible();
  await screen.getByRole("button", { name: "Eliminar equipo Rojso" }).click();
  await expect(screen.getByRole("heading", { name: "Rojso" })).not.toBeVisible();

  await createTeam(screen, "Rojos", "Elegir color #ef4444");
  await createTeam(screen, "Azules", "Elegir color #3b82f6");
  await expect(screen.getByRole("heading", { name: "Rojos" })).toBeVisible();
  await expect(screen.getByRole("heading", { name: "Azules" })).toBeVisible();

  await expect(revealButton).toBeEnabled();
  await revealButton.click();
  await expect(screen.getByText(code, { exact: true })).toBeVisible();
  await expect(screen.locator("svg")).toBeVisible();
  // Los controles de equipos siguen disponibles con el código ya revelado.
  await expect(screen.getByRole("heading", { name: "Rojos" })).toBeVisible();

  // Ana se une desde su celular.
  const anaContext = await browser.newContext();
  const ana = await anaContext.newPage();
  await ana.goto(`/play/${code}`);
  await ana.getByPlaceholder("Tu nombre").fill("Ana");
  await ana.getByRole("button", { name: "Unirme" }).click();
  await expect(ana.getByText("¡Listo, Ana!")).toBeVisible();
  await expect(
    ana.getByText("Esperando a que el anfitrión arme los equipos…"),
  ).toBeVisible();

  // Aparece en la pantalla, sin equipo todavía, sin recargar.
  await expect(screen.getByText("Sin equipo")).toBeVisible();
  await expect(screen.getByText("Ana", { exact: true })).toBeVisible();

  // Asignación manual a "Rojos" desde la pantalla.
  await screen
    .getByRole("button", { name: "Asignar a Ana al equipo Rojos" })
    .click();

  // Ana ve su equipo sin recargar; en la pantalla sale de "Sin equipo".
  await expect(ana.getByRole("heading", { name: "Rojos" })).toBeVisible();
  await expect(screen.getByText("Sin equipo")).not.toBeVisible();

  // Beto se une y queda sin equipo.
  const betoContext = await browser.newContext();
  const beto = await betoContext.newPage();
  await beto.goto(`/play/${code}`);
  await beto.getByPlaceholder("Tu nombre").fill("Beto");
  await beto.getByRole("button", { name: "Unirme" }).click();
  await expect(beto.getByText("¡Listo, Beto!")).toBeVisible();

  await expect(screen.getByText("Sin equipo")).toBeVisible();
  await expect(screen.getByText("Beto", { exact: true })).toBeVisible();

  // Randomizar reparte parejo: cada equipo queda con 1 integrante.
  await screen.getByRole("button", { name: "Randomizar equipos" }).click();
  await expect(screen.getByText("Sin equipo")).not.toBeVisible();

  const rojosCard = screen
    .locator("article", { has: screen.getByRole("heading", { name: "Rojos" }) })
    .first();
  const azulesCard = screen
    .locator("article", { has: screen.getByRole("heading", { name: "Azules" }) })
    .first();
  await expect(rojosCard.getByText(/^(Ana|Beto)$/)).toHaveCount(1);
  await expect(azulesCard.getByText(/^(Ana|Beto)$/)).toHaveCount(1);

  await expect(ana.getByRole("heading", { name: /Rojos|Azules/ })).toBeVisible();
  await expect(beto.getByRole("heading", { name: /Rojos|Azules/ })).toBeVisible();

  // Beto se desconecta (cierra la pestaña) y desaparece de la pantalla.
  await betoContext.close();
  await expect(screen.getByText("Beto", { exact: true })).not.toBeVisible();

  await anaContext.close();
  await screenContext.close();
});
