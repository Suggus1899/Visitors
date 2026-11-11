// Recorridos de aceptación de la fase 5 (frontend Leptos SSR).
//
// Requisitos para correrlo: el binario Rust en marcha en
// LOGMASTER_APP_URL (por defecto http://127.0.0.1:18085) con los
// usuarios operador, admin, auditor y root sembrados, cuya
// contraseña es LOGMASTER_TEST_PASSWORD. El script de humo de la
// fase 5 (fuera del repo) levanta ese servidor y siembra los
// usuarios; sin ellos los recorridos fallan en el login.
//
// La exportación PDF/XLSX en servidor es fase 6: estos recorridos
// no descargan PDF ni XLSX (solo el JSON ya disponible).
import { test, expect, type Page } from '@playwright/test';

const password = process.env.LOGMASTER_TEST_PASSWORD || 'Private!Safe12Á';
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function signIn(page: Page, username: string, landing: string, heading: string) {
  await page.goto('/login');
  if (!page.url().includes('/login')) {
    // Ya había una sesión (segundo login del mismo test): salir.
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
  }
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  // El formulario redirige a / al iniciar sesión; esperar a esa
  // navegación antes de ir al destino (si no, el goto aborta).
  await expect(page).toHaveURL(/\/$/);
  await page.goto(landing);
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
}

/// Rellena el check-in y devuelve la URL del detalle de la visita.
async function checkin(page: Page, cedula: string, status: 'waiting' | 'active'): Promise<string> {
  const form = page.locator('#checkin-form');
  await form.getByLabel('Cédula', { exact: true }).fill(cedula);
  await page.getByRole('button', { name: 'Buscar perfil' }).click();
  await expect(page.locator('#perfil-info')).toBeVisible();
  await form.getByLabel('Nombres', { exact: true }).fill('Prueba');
  await form.getByLabel('Apellidos', { exact: true }).fill('Navegador');
  await form.getByLabel('Empresa', { exact: true }).fill('Laboratorio');
  await form.getByLabel('Motivo', { exact: true }).fill('Reunión');
  await form.getByLabel('Persona a visitar', { exact: true }).fill('Responsable Ficticio');
  await form.getByLabel('Departamento destino', { exact: true }).fill('Producción');
  await form.getByLabel('Anfitrión', { exact: true }).fill('Jefe de turno');
  await form.locator('select[name="status"]').selectOption(status);
  await form.locator('select[name="action"]').selectOption('Descarga');
  await page
    .locator('#foto-archivo')
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png1x1 });
  await expect(page.locator('#foto-vista')).toBeVisible();
  await page.locator('#consentimiento').check();
  const created = page.waitForResponse(
    (response) => response.url().endsWith('/visits/checkin') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Registrar check-in' }).click();
  expect((await created).status()).toBe(201);
  await expect(page).toHaveURL(/\/visits\/\d+$/);
  return page.url();
}

test('el login anónimo redirige al login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?returnTo=\/$/);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});

test('login y check-in completo con consentimiento y foto', async ({ page }) => {
  await signIn(page, 'operador', '/', 'Punto de control');
  await checkin(page, '44556677', 'waiting');
  await expect(page.getByText('Prueba Navegador', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Admitir', exact: true })).toBeVisible();
  // La visita en espera aparece en el punto de control.
  await page.goto('/');
  await expect(page.getByText('Prueba Navegador', { exact: true })).toBeVisible();
});

test('ciclo completo de una visita: admitir, salida temporal, reingreso y salida', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await signIn(page, 'operador', '/', 'Punto de control');
  const url = await checkin(page, '44556678', 'waiting');
  await expect(page.getByRole('button', { name: 'Admitir', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Admitir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salida temporal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Salida temporal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reingreso', exact: true })).toBeVisible();
  await expect(page.getByText('Salidas temporales')).toBeVisible();
  await page.getByRole('button', { name: 'Reingreso', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salida definitiva', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Salida definitiva', exact: true }).click();
  await expect(page.locator('span.etiqueta.completed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salida definitiva', exact: true })).toBeHidden();
  expect(page.url()).toBe(url);
});

test('flujo de privacidad: crear solicitud ARCO, consultar titular y cambiar estado', async ({
  page,
}) => {
  await signIn(page, 'admin', '/privacy', 'Privacidad');
  const form = page.locator('form[data-api="/api/v1/privacy/arco-requests"]');
  await form.locator('select[name="requestType"]').selectOption('access');
  await form.getByLabel('Cédula', { exact: true }).fill('V-44556677');
  await form.getByLabel('Solicitante', { exact: true }).fill('Prueba Navegador');
  await form.getByLabel('Motivo', { exact: true }).fill('Quiero mis datos');
  await form.getByRole('button', { name: 'Crear solicitud' }).click();
  await expect(page.locator('table').getByText('V-44556677', { exact: true }).first()).toBeVisible();
  await expect(page.locator('table').getByText('Acceso', { exact: true }).first()).toBeVisible();
  // Consulta del titular por fetch.
  await page.locator('#consulta-cedula').fill('V-44556677');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.locator('#consulta-resultado')).toContainText('V-44556677');
  // Cambio de estado por fila.
  const row = page.locator('table form[data-api-form]').first();
  await row.locator('select[name="status"]').selectOption('completed');
  await row.locator('input[name="resolutionNotes"]').fill('Resuelto en prueba');
  await row.getByRole('button', { name: 'Cambiar' }).click();
  await expect(page.locator('table').getByText('Completada', { exact: true }).first()).toBeVisible();
});

test('recorrido de admin y auditoría', async ({ page }) => {
  await signIn(page, 'admin', '/admin', 'Administración');
  await expect(page.getByText('Prueba Navegador', { exact: true }).first()).toBeVisible();
  await page.goto('/audit');
  await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible();
  await expect(page.getByText('LOGIN').first()).toBeVisible();
  await expect(page.getByText('Descargar CSV')).toBeVisible();
  await page.goto('/admin?tab=visitors');
  await expect(page.getByText('Prueba Navegador', { exact: true }).first()).toBeVisible();
  await page.goto('/admin?tab=catalogs');
  await expect(page.getByRole('heading', { name: 'Departamentos' })).toBeVisible();
  // Root: cuentas y respaldos.
  await signIn(page, 'root', '/root', 'Superadmin');
  await expect(page.getByText('Crear cuenta')).toBeVisible();
  await expect(page.locator('table').getByText('operador', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Cuenta actual')).toBeVisible();
  await expect(page.getByText('Auditoría de superadmin')).toBeVisible();
});
