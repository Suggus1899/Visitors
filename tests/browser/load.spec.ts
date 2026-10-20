import { test, expect, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.skip(process.env.LOGMASTER_BROWSER_LOAD !== 'true', 'high-capacity laboratory run only');

function loadPassword() {
  const directory = process.env.LOGMASTER_CONFIG_DIR || '.local/containers';
  const variables = Object.fromEntries(readFileSync(`${directory}/load.env`, 'utf8').split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  if (!variables.LAB_PASSWORD) throw new Error('LAB_PASSWORD fixture is missing');
  return variables.LAB_PASSWORD;
}

async function visit(browser: Browser, index: number, password: string) {
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();
  try {
    await page.goto('/login');
    await page.getByLabel('Usuario', { exact: true }).fill(`lab0${index + 1}`);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'INGRESAR', exact: true }).click();
    await expect(page.getByLabel('Cédula', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true);

    const cedula = String(90000001 + index);
    const lookup = page.waitForResponse(response => response.url().includes(`/visitors/V-${cedula}`));
    await page.getByLabel('Cédula', { exact: true }).fill(cedula);
    await page.getByLabel('Nombres', { exact: true }).click();
    await lookup;
    await page.getByLabel('Nombres', { exact: true }).fill('Carga Ficticia');
    await page.getByLabel('Apellidos', { exact: true }).fill(`Visitante ${index + 1}`);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByLabel('Empresa', { exact: true }).fill('Laboratorio de carga');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('note')).toContainText('Cada acompañante debe registrarse por separado');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByLabel('Área o departamento').selectOption({ index: 1 });
    await page.getByLabel('Persona a visitar').fill('Responsable Ficticio');
    await page.getByLabel('Motivo de la visita', { exact: true }).selectOption({ index: 1 });
    await page.getByLabel('Actividad de acceso').selectOption('Ninguna');
    await page.getByRole('checkbox').check();
    const response = page.waitForResponse(item => item.url().endsWith('/visits/checkin') && item.request().method() === 'POST');
    await page.getByRole('button', { name: 'REGISTRAR ENTRADA' }).click();
    expect((await response).status()).toBe(201);
  } finally {
    await context.close();
  }
}

test('five simultaneous browser sessions use HTTPS, BFF cookies and visit registration', async ({ browser }) => {
  test.setTimeout(5 * 60 * 1000);
  const password = loadPassword();
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => visit(browser, index, password)));
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  expect(failures.map(result => String(result.reason))).toEqual([]);
});
