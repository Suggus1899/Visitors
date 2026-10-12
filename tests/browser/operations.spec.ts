import { test, expect, request as playwrightRequest, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

let fixture: Record<string, string>;
test.beforeAll(() => { fixture = Object.fromEntries(readFileSync('.local/containers/app.env', 'utf8').split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])); });
const changedPassword = 'Ficticio!Changed123';

async function signIn(page: Page, username: string, password: string, readyLabel = 'Cédula') {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'INGRESAR', exact: true }).click();
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByPlaceholder('Ingresa tu contraseña actual').fill(password);
  await page.getByPlaceholder('Ingresa tu nueva contraseña').fill(changedPassword);
  await page.getByPlaceholder('Confirma tu nueva contraseña').fill(changedPassword);
  await page.getByRole('button', { name: /Cambiar Contraseña/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  // Password changes invalidate the session; the application requires a fresh login.
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(changedPassword);
  await page.getByRole('button', { name: 'INGRESAR', exact: true }).click();
  if (readyLabel) await expect(page.getByLabel(readyLabel, { exact: true })).toBeVisible();
}

async function registerVisitor(page: Page, cedula: string, firstName: string, action: 'Carga' | 'Descarga' | 'Ninguna') {
  const lookup = page.waitForResponse(response => response.url().includes(`/visitors/V-${cedula}`));
  await page.getByLabel('Cédula', { exact: true }).fill(cedula);
  await page.getByLabel('Nombres', { exact: true }).click();
  await lookup;
  await page.getByLabel('Nombres', { exact: true }).fill(firstName);
  await page.getByLabel('Apellidos', { exact: true }).fill('Ficticio');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Empresa', { exact: true }).fill('Laboratorio');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('note')).toContainText('Cada acompañante debe registrarse por separado');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Área o departamento').selectOption({ index: 1 });
  await page.getByLabel('Persona a visitar').fill('Responsable Ficticio');
  await page.getByLabel('Motivo de la visita', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Actividad de acceso').selectOption(action);
  await page.getByRole('checkbox').check();
  const created = page.waitForResponse(response => response.url().endsWith('/visits/checkin') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'REGISTRAR ENTRADA' }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  expect((await response.json()).data.action).toBe(action);
}

test('HTTPS camera, authenticated photographs, consent and complete operational cycle', async ({ page, request }) => {
  await signIn(page, 'operador', fixture.SEED_OPERADOR_PASSWORD);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  const lookup = page.waitForResponse(response => response.url().includes('/visitors/V-45678901'));
  await page.getByLabel('Cédula', { exact: true }).fill('45678901');
  await page.getByLabel('Nombres', { exact: true }).click(); await lookup;
  await page.getByLabel('Nombres', { exact: true }).fill('Prueba Navegador');
  await page.getByLabel('Apellidos', { exact: true }).fill('Ficticio');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Empresa', { exact: true }).fill('Laboratorio');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Área o departamento').selectOption({ index: 1 });
  await page.getByLabel('Persona a visitar').fill('Responsable Ficticio');
  await page.getByLabel('Motivo de la visita', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Actividad de acceso').selectOption('Descarga');
  const legacyGroup = await page.evaluate(async () => {
    const response = await fetch('/api/v1/visits/checkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorCedula: 'V-45678904', companionName: 'Persona ficticia' }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(legacyGroup.status).toBe(400);
  expect(legacyGroup.body.error.code).toBe('INDIVIDUAL_REGISTRATION_REQUIRED');
  await expect(page.getByRole('button', { name: 'PONER EN ESPERA' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByText('Usar Cámara', { exact: true }).first().click();
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThan(1);
  await page.getByTitle('Captura instantánea').click();
  await expect(page.locator('img[src^="data:image/"]')).toBeVisible();
  const created = page.waitForResponse(response => response.url().endsWith('/visits/checkin') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'PONER EN ESPERA' }).click();
  const primaryVisit = await created;
  expect(primaryVisit.status()).toBe(201);
  expect((await primaryVisit.json()).data.action).toBe('Descarga');
  await page.getByRole('button', { name: /En Espera/ }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.getByText('Prueba Navegador Ficticio', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('img[src^="blob:"]').count()).toBeGreaterThan(0);
  expect(await request.get('/api/v1/visitors/V-45678901/photo').then(response => response.status())).toBe(401);
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
  await registerVisitor(page, '45678902', 'Acompañante Uno', 'Ninguna');
  await registerVisitor(page, '45678903', 'Acompañante Dos', 'Ninguna');
  await page.getByRole('button', { name: /Activas/ }).first().click();
  await expect(page.getByText('Acompañante Uno Ficticio', { exact: true })).toBeVisible();
  await expect(page.getByText('Acompañante Dos Ficticio', { exact: true })).toBeVisible();
  await expect(page.getByText('Prueba Navegador Ficticio', { exact: true })).toBeHidden();
});

test('Mailpit reset link works through HTTPS and cannot be reused', async ({ page, request }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Nombre de usuario').fill('guard');
  await page.getByRole('button', { name: /ENVIAR/i }).click();
  await expect(page.getByText(/Si la cuenta tiene correo registrado/)).toBeVisible();
  let messageId = '';
  await expect.poll(async () => {
    const messages = await request.get('http://127.0.0.1:8025/api/v1/messages').then(response => response.json());
    messageId = messages.messages?.[0]?.ID || ''; return Boolean(messageId);
  }).toBe(true);
  const message = await request.get(`http://127.0.0.1:8025/api/v1/message/${messageId}`).then(response => response.json());
  const link = String(message.Text).match(/https:\/\/localhost:8443\/reset-password\?token=[a-f0-9]+/)?.[0];
  expect(Boolean(link)).toBe(true);
  await page.goto(link!);
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(changedPassword);
  const reset = page.waitForResponse(response => response.url().endsWith('/auth/reset-password'));
  await page.getByRole('button', { name: 'CAMBIAR CONTRASEÑA' }).click();
  expect((await reset).status()).toBe(200);
  const token = new URLSearchParams(link!.split('?')[1]).get('token');
  const api = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3000' });
  expect(await api.post('/api/v1/auth/reset-password', { data: { token, newPassword: changedPassword } }).then(response => response.status())).toBe(400);
  await api.dispose();
});

test('roles, short search, SSE and proxy headers are enforced by the real API', async ({ request, page }) => {
  await page.goto('/login');
  const api = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3000' });
  for (const [username, key] of [['admin', 'SEED_ADMIN_PASSWORD'], ['auditor', 'SEED_AUDITOR_PASSWORD'], ['demo', 'SEED_DEMO_PASSWORD']]) {
    const login = await api.post('/api/v1/auth/login', { data: { username, password: fixture[key] }, headers: { 'X-Forwarded-For': '198.51.100.11', 'X-Real-IP': '198.51.100.11' } });
    const original = (await login.json()).data;
    const old = { Authorization: `Bearer ${original.accessToken}` };
    expect(await api.get('/api/v1/events/visits', { headers: old }).then(response => response.status())).toBe(403);
    expect(await api.post('/api/v1/auth/change-password', { headers: old, data: { currentPassword: fixture[key], newPassword: changedPassword, confirmPassword: changedPassword } }).then(response => response.status())).toBe(200);
    const next = await api.post('/api/v1/auth/login', { data: { username, password: changedPassword } }).then(response => response.json());
    const headers = { Authorization: `Bearer ${next.data.accessToken}` };
    expect(await api.get('/api/v1/visitors?search=ab', { headers }).then(response => response.status())).toBe(400);
    expect(await api.get('/api/v1/superadmin/users', { headers }).then(response => response.status())).toBe(403);
    if (username !== 'admin') expect(await api.post('/api/v1/visits/checkin', { headers, data: {} }).then(response => response.status())).toBe(403);
  }
  const bffLogin = await page.evaluate(async credentials => {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Real-IP': '198.51.100.11', 'X-Forwarded-For': '198.51.100.11' },
      body: JSON.stringify(credentials),
    });
    return { status: response.status, body: await response.json() };
  }, { username: 'admin', password: changedPassword });
  expect(bffLogin.status).toBe(200);
  expect(JSON.stringify(bffLogin.body)).not.toMatch(/accessToken|refreshToken/);
  expect(await page.evaluate(() => ({
    exposedCookie: /__Host-logmaster-(access|refresh)/.test(document.cookie),
    exposedStorage: [localStorage, sessionStorage].some(storage => Object.keys(storage).some(key => /token|access|refresh/i.test(key))),
  }))).toEqual({ exposedCookie: false, exposedStorage: false });
  const frame = await page.evaluate(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const stream = await fetch('/api/v1/events/visits', { credentials: 'same-origin', signal: controller.signal });
        const reader = stream.body!.getReader();
        const first = await reader.read(); await reader.cancel();
        return new TextDecoder().decode(first.value);
      } finally { clearTimeout(timer); controller.abort(); }
    });
  expect(frame).toContain('system:connected');
  await api.dispose();
});

test('administration defers inactive panels and produces real PDF and Excel files', async ({ page }) => {
  const chunks: string[] = [];
  page.on('request', request => { if (request.url().includes('/_next/static/chunks/')) chunks.push(request.url()); });
  await signIn(page, 'root', fixture.SEED_ROOT_PASSWORD, '');
  await expect(page).toHaveURL(/\/root$/);
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Exportar PDF', exact: true })).toBeEnabled();
  const beforeCalendar = new Set(chunks);
  await page.getByRole('button', { name: 'Calendario', exact: true }).click();
  await expect(page.getByText('Calendario de visitas', { exact: true })).toBeVisible();
  await expect.poll(() => chunks.some(url => !beforeCalendar.has(url))).toBe(true);
  await page.getByRole('button', { name: 'Reportes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exportar PDF', exact: true })).toBeEnabled();
  const beforePDF = new Set(chunks);
  const pdfReady = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click();
  const pdf = await pdfReady;
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  await expect.poll(() => chunks.some(url => !beforePDF.has(url))).toBe(true);
  const beforeExcel = new Set(chunks);
  const excelReady = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar Excel', exact: true }).click();
  const excel = await excelReady;
  expect(readFileSync((await excel.path())!).subarray(0, 2).toString()).toBe('PK');
  await expect.poll(() => chunks.some(url => !beforeExcel.has(url))).toBe(true);
});
