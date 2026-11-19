import { test, expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// Direct API (not through the BFF), as in operations.spec.ts.
const API_URL = process.env.LOGMASTER_API_URL || 'http://127.0.0.1:3000';
const changedPassword = 'Ficticio!Changed123';
let api: APIRequestContext;
let rootToken: string;
let rootPassword: string;

const unique = (prefix: string) => `${prefix}_${randomBytes(5).toString('hex')}`;
const strongPassword = () => `Ficticio!${randomBytes(6).toString('hex')}Aa1`;

async function apiLogin(username: string, password: string) {
  const response = await api.post('/api/v1/auth/login', { data: { username, password } });
  return { status: response.status(), data: response.ok() ? (await response.json()).data : undefined };
}

// Accepts the root account whether or not another spec already rotated its seed password.
async function rootSession() {
  const fixture = Object.fromEntries(readFileSync(`${process.env.LOGMASTER_CONFIG_DIR || '.local/containers'}/app.env`, 'utf8').split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  for (const candidate of [changedPassword, fixture.SEED_ROOT_PASSWORD]) {
    const login = await apiLogin('root', candidate);
    if (login.status !== 200) continue;
    if (!login.data.user.mustChangePassword) return { token: login.data.accessToken as string, password: candidate };
    const change = await api.post('/api/v1/auth/change-password', { headers: { Authorization: `Bearer ${login.data.accessToken}` }, data: { currentPassword: candidate, newPassword: changedPassword, confirmPassword: changedPassword } });
    expect(change.status()).toBe(200);
    const fresh = await apiLogin('root', changedPassword);
    return { token: fresh.data.accessToken as string, password: changedPassword };
  }
  throw new Error('root account not available with the seed or the rotated password');
}

// Creates an account as root and completes its mandatory password change.
async function readyAccount(role: 'admin' | 'operador' | 'auditor' | 'demo') {
  const username = unique(`e2e_${role}`);
  const initial = strongPassword();
  const created = await api.post('/api/v1/superadmin/users', { headers: { Authorization: `Bearer ${rootToken}` }, data: { username, password: initial, role, email: role === 'demo' ? undefined : `${username}@example.test` } });
  expect(created.status()).toBe(200);
  const login = await apiLogin(username, initial);
  const password = strongPassword();
  const change = await api.post('/api/v1/auth/change-password', { headers: { Authorization: `Bearer ${login.data.accessToken}` }, data: { currentPassword: initial, newPassword: password, confirmPassword: password } });
  expect(change.status()).toBe(200);
  return { id: (await created.json()).data.id as number, username, password };
}

async function uiLogin(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'INGRESAR', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ baseURL: API_URL });
  ({ token: rootToken, password: rootPassword } = await rootSession());
});
test.afterAll(async () => { await api.dispose(); });

test('superadmin panel creates, edits, resets and deletes accounts', async ({ page }) => {
  await uiLogin(page, 'root', rootPassword);
  await expect(page).toHaveURL(/\/root$/);
  await expect(page.getByRole('heading', { name: 'Gestión de Usuarios' })).toBeVisible();
  const rootRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'root', exact: true }) }).first();
  await expect(rootRow.getByTitle('Eliminar')).toHaveCount(0);

  const username = unique('e2e_panel');
  const initial = strongPassword();
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'Nuevo Usuario' }).click();
  await dialog.getByLabel('Nombre de usuario').fill(username);
  await dialog.getByLabel('Contraseña').fill('debil');
  await dialog.getByLabel('Correo electrónico').fill(`${username}@example.test`);
  await dialog.getByLabel('Rol').selectOption('operador');
  await dialog.getByRole('button', { name: 'Crear Usuario' }).click();
  await expect(dialog).toBeVisible();
  expect((await apiLogin(username, 'debil')).status).toBe(401);

  await dialog.getByLabel('Contraseña').fill(initial);
  await dialog.getByRole('button', { name: 'Crear Usuario' }).click();
  await expect(page.getByText('Usuario creado exitosamente')).toBeVisible();
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: username, exact: true }) });
  await expect(row).toContainText('operador');
  await expect(row).toContainText('Cambio requerido');
  const created = await apiLogin(username, initial);
  expect(created.status).toBe(200);
  expect(created.data.user).toMatchObject({ role: 'operador', mustChangePassword: true });

  await row.getByTitle('Editar').click();
  await dialog.getByLabel('Rol').selectOption('auditor');
  await dialog.getByRole('button', { name: 'Guardar Cambios' }).click();
  await expect(page.getByText('Usuario actualizado exitosamente')).toBeVisible();
  await expect(row).toContainText('auditor');

  const reset = strongPassword();
  await row.getByTitle('Restablecer contraseña').click();
  await expect(dialog).toContainText(username);
  await dialog.getByLabel('Nueva contraseña').fill(reset);
  await dialog.getByRole('button', { name: 'Restablecer' }).click();
  await expect(page.getByText('Contraseña restablecida exitosamente')).toBeVisible();
  expect((await apiLogin(username, initial)).status).toBe(401);
  const afterReset = await apiLogin(username, reset);
  expect(afterReset.status).toBe(200);
  expect(afterReset.data.user).toMatchObject({ role: 'auditor', mustChangePassword: true });

  page.once('dialog', confirm => confirm.dismiss());
  await row.getByTitle('Eliminar').click();
  await expect(row).toBeVisible();
  page.once('dialog', confirm => confirm.accept());
  await row.getByTitle('Eliminar').click();
  await expect(page.getByText('Usuario eliminado exitosamente')).toBeVisible();
  await expect(row).toHaveCount(0);
  expect((await apiLogin(username, reset)).status).toBe(401);

  await page.getByRole('button', { name: 'Logs de Auditoría' }).click();
  await expect(page.getByText('SUPERADMIN_DELETE_USER').first()).toBeVisible();
});

const pages = ['/', '/admin', '/audit', '/privacy', '/root'] as const;
const landing: Record<'admin' | 'operador' | 'auditor' | 'demo', Record<(typeof pages)[number], string>> = {
  admin: { '/': '/', '/admin': '/admin', '/audit': '/audit', '/privacy': '/privacy', '/root': '/' },
  operador: { '/': '/', '/admin': '/', '/audit': '/', '/privacy': '/privacy', '/root': '/' },
  auditor: { '/': '/audit', '/admin': '/audit', '/audit': '/audit', '/privacy': '/privacy', '/root': '/audit' },
  demo: { '/': '/', '/admin': '/', '/audit': '/', '/privacy': '/', '/root': '/' },
};

test('every private page is reachable only by its roles', async ({ browser }) => {
  for (const [role, expected] of Object.entries(landing) as [keyof typeof landing, (typeof landing)[keyof typeof landing]][]) {
    const account = await readyAccount(role);
    const context = await browser.newContext();
    const page = await context.newPage();
    await uiLogin(page, account.username, account.password);
    for (const path of pages) {
      const response = await page.goto(path);
      expect(response?.status(), `${role} ${path}`).toBeLessThan(400);
      expect(new URL(page.url()).pathname, `${role} opening ${path}`).toBe(expected[path]);
    }
    await context.close();
    await api.delete(`/api/v1/superadmin/users/${account.id}`, { headers: { Authorization: `Bearer ${rootToken}` } });
  }

  const anonymous = await browser.newContext();
  const page = await anonymous.newPage();
  for (const path of [...pages, '/change-password']) {
    await page.goto(path);
    expect(new URL(page.url()).pathname, `anonymous ${path}`).toBe('/login');
  }
  await anonymous.close();
});
