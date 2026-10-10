import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

let fixture: Record<string, string>;
test.beforeAll(() => { fixture = Object.fromEntries(readFileSync('.local/containers/app.env', 'utf8').split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])); });
const changedPassword = 'Ficticio!Changed123';

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/#/login');
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'INGRESAR', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByPlaceholder('Ingresa tu contraseña actual').fill(password);
  await page.getByPlaceholder('Ingresa tu nueva contraseña').fill(changedPassword);
  await page.getByPlaceholder('Confirma tu nueva contraseña').fill(changedPassword);
  await page.getByRole('button', { name: /Cambiar Contraseña/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  // Password changes invalidate the session; the application requires a fresh login.
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(changedPassword);
  await page.getByRole('button', { name: 'INGRESAR', exact: true }).click();
  await expect(page.getByLabel('Cédula', { exact: true })).toBeVisible();
}

test('HTTPS camera, authenticated photographs, consent and complete operational cycle', async ({ page }) => {
  await signIn(page, 'operador', fixture.SEED_OPERADOR_PASSWORD);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  await page.getByLabel('Cédula', { exact: true }).fill('45678901');
  const lookup = page.waitForResponse(response => response.url().includes('/visitors/V-45678901'));
  await page.getByLabel('Nombres', { exact: true }).click(); await lookup;
  await page.getByLabel('Nombres', { exact: true }).fill('Prueba Navegador');
  await page.getByLabel('Apellidos', { exact: true }).fill('Ficticio');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Empresa', { exact: true }).fill('Laboratorio');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Área o departamento').selectOption({ index: 1 });
  await page.getByLabel('Persona a visitar').fill('Responsable Ficticio');
  await page.getByLabel('Motivo de la visita', { exact: true }).selectOption({ index: 1 });
  await expect(page.getByRole('button', { name: 'PONER EN ESPERA' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByText('Usar Cámara', { exact: true }).first().click();
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThan(1);
  await page.getByTitle('Captura instantánea').click();
  const created = page.waitForResponse(response => response.url().endsWith('/visits/checkin') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'PONER EN ESPERA' }).click();
  expect((await created).status()).toBe(201);
  await page.getByRole('button', { name: /En Espera/ }).click();
  await expect(page.getByText('Prueba Navegador Ficticio', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('img[src^="blob:"]').count()).toBeGreaterThan(0);
  expect(await page.request.get('/api/v1/visitors/V-45678901/photo').then(response => response.status())).toBe(401);
  await page.getByRole('button', { name: 'ADMITIR ENTRADA' }).click();
  await page.getByRole('button', { name: /Activas/ }).first().click();
  await page.getByTitle('Salida temporal').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('button', { name: /Intermitencia/ }).click();
  await page.getByRole('button', { name: 'REGRESÓ' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('button', { name: /Activas/ }).first().click();
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText('Prueba Navegador Ficticio', { exact: true })).toBeHidden();
});

test('Mailpit reset link works through HTTPS and cannot be reused', async ({ page, request }) => {
  await page.goto('/#/forgot-password');
  await page.getByLabel('Nombre de usuario').fill('root');
  await page.getByRole('button', { name: /ENVIAR/i }).click();
  await expect(page.getByText(/Si la cuenta tiene correo registrado/)).toBeVisible();
  let messageId = '';
  await expect.poll(async () => {
    const messages = await request.get('http://127.0.0.1:8025/api/v1/messages').then(response => response.json());
    messageId = messages.messages?.[0]?.ID || ''; return Boolean(messageId);
  }).toBe(true);
  const message = await request.get(`http://127.0.0.1:8025/api/v1/message/${messageId}`).then(response => response.json());
  const link = String(message.Text).match(/https:\/\/localhost:8443\/#\/reset-password\?token=[a-f0-9]+/)?.[0];
  expect(Boolean(link)).toBe(true);
  await page.goto(link!);
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(changedPassword);
  const reset = page.waitForResponse(response => response.url().endsWith('/auth/reset-password'));
  await page.getByRole('button', { name: 'CAMBIAR CONTRASEÑA' }).click();
  expect((await reset).status()).toBe(200);
  const token = new URLSearchParams(link!.split('?')[1]).get('token');
  expect(await request.post('/api/v1/auth/reset-password', { data: { token, newPassword: changedPassword } }).then(response => response.status())).toBe(400);
});

test('roles, short search, SSE and proxy headers are enforced by the real API', async ({ request, page }) => {
  await page.goto('/#/login');
  for (const [username, key] of [['admin', 'SEED_ADMIN_PASSWORD'], ['auditor', 'SEED_AUDITOR_PASSWORD'], ['demo', 'SEED_DEMO_PASSWORD']]) {
    const login = await request.post('/api/v1/auth/login', { data: { username, password: fixture[key] }, headers: { 'X-Forwarded-For': '198.51.100.11', 'X-Real-IP': '198.51.100.11' } });
    const original = (await login.json()).data;
    const old = { Authorization: `Bearer ${original.accessToken}` };
    expect(await request.get('/api/v1/events/visits', { headers: old }).then(response => response.status())).toBe(403);
    expect(await request.post('/api/v1/auth/change-password', { headers: old, data: { currentPassword: fixture[key], newPassword: changedPassword, confirmPassword: changedPassword } }).then(response => response.status())).toBe(200);
    const next = await request.post('/api/v1/auth/login', { data: { username, password: changedPassword } }).then(response => response.json());
    const headers = { Authorization: `Bearer ${next.data.accessToken}` };
    const frame = await page.evaluate(async token => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const stream = await fetch('/api/v1/events/visits', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        const reader = stream.body!.getReader();
        const first = await reader.read(); await reader.cancel();
        return new TextDecoder().decode(first.value);
      } finally { clearTimeout(timer); controller.abort(); }
    }, next.data.accessToken);
    expect(frame).toContain('system:connected');
    expect(await request.get('/api/v1/visitors?search=ab', { headers }).then(response => response.status())).toBe(400);
    expect(await request.get('/api/v1/superadmin/users', { headers }).then(response => response.status())).toBe(403);
    if (username !== 'admin') expect(await request.post('/api/v1/visits/checkin', { headers, data: {} }).then(response => response.status())).toBe(403);
  }
});
