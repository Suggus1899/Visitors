import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { Sequelize, QueryTypes } from 'sequelize';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import app from '../src/app';
import config from '../src/config/AppConfig';
import sequelize from '../src/database';
import User from '../src/models/User';
import Visitor from '../src/models/Visitor';
import Visit from '../src/models/Visit';
import History from '../src/models/VisitorEditHistory';
import Arco from '../src/models/ArcoRequest';
import Activity from '../src/models/ActivityLog';
import Encryption from '../src/utils/Encryption';
import { JwtAuthService } from '../src/infrastructure/services/JwtAuthService';
import { SequelizeUserRepository } from '../src/infrastructure/database/repositories/SequelizeUserRepository';
import { PostgresBackupService } from '../src/infrastructure/services/PostgresBackupService';
import { migrator } from '../src/config/umzug';
import { container } from '../src/shared/Container';

const api = '/api/v1';
const cedula = 'V-12345678';
const password = 'Integration!18Secure';
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=';
const tokens: Record<string, string> = {};
const accounts: Record<string, InstanceType<typeof User>> = {};
let visitId: number;
let originalVisitorId: number;
const auth = (role = 'admin') => ({ Authorization: 'Bearer ' + tokens[role], 'User-Agent': 'LogMaster-integration' });
const update = (body: object, role = 'admin') => request(app).patch(api + '/visitors/' + cedula).set(auth(role)).send(body);
const checkin = (extra: object = {}) => ({ visitorCedula: cedula, consent: { accepted: true, policyVersion: '1.0', acceptedAt: new Date().toISOString() },
    purpose: 'Entrega ficticia', personToVisit: 'Responsable ficticio', targetDepartment: 'Producción', hostPerson: 'Responsable ficticio',
    visitorData: { firstName: 'Nombre ficticio', lastName: 'Apellido ficticio', company: 'Empresa ficticia', email: 'visitor@example.test', phone: '+584121234567', photoBase64: photo, idPhotoBase64: photo },
    vehicleBrand: 'Marca', vehicleModel: 'Modelo', vehiclePlate: 'ABC123', companionName: 'Acompañante ficticio', companionCedula: '87654321', status: 'waiting', ...extra });

beforeAll(async () => {
    if (config.dbName !== 'logmaster_test' || config.dbHost !== '127.0.0.1' || config.dbPort !== 55432) throw new Error('Integration tests require the isolated logmaster_test database');
    await sequelize.authenticate();
    await sequelize.query('TRUNCATE "IntermittentLogs", "VisitorEditHistories", "Visits", "Visitors", "ArcoRequests", "ActivityLogs", "Users" RESTART IDENTITY CASCADE');
    const service = new JwtAuthService();
    for (const role of ['root', 'admin', 'operador', 'auditor', 'demo'] as const) {
        accounts[role] = await User.create({ username: 'Test-' + role, role, password: await service.hashPassword(password), email: role + '@example.test', mustChangePassword: false });
        const response = await request(app).post(api + '/auth/login').send({ username: accounts[role].username, password });
        expect(response.status).toBe(200);
        tokens[role] = response.body.data.accessToken;
    }
});
afterAll(async () => { vi.restoreAllMocks(); await sequelize.close(); });

describe.sequential('LogMaster real application and PostgreSQL', () => {
    it('keeps rollback SQL out of the migration list and applies complete SQL', async () => {
        const executed = await migrator.executed();
        expect(executed).toHaveLength(9);
        expect(executed.some(m => m.name.includes('.down.'))).toBe(false);
        expect((await sequelize.query('SELECT name FROM "SequelizeMeta"', { type: QueryTypes.SELECT })).length).toBe(9);
        expect(await migrator.pending()).toHaveLength(0);
        const columns = await sequelize.getQueryInterface().describeTable('Users');
        expect(columns.email).toBeDefined();
        expect(columns.tokenVersion).toBeDefined();
    });

    it('requires consent and records department, host, vehicle and a waiting visitor', async () => {
        expect((await request(app).post(api + '/visits/checkin').set(auth('operador')).send(checkin({ consent: { accepted: false } }))).status).toBe(400);
        const response = await request(app).post(api + '/visits/checkin').set(auth('operador')).send(checkin());
        expect(response.status).toBe(201);
        visitId = response.body.data.id;
        originalVisitorId = (await Visitor.findOne({ where: { cedula: Encryption.hash(cedula) } }))!.id;
        expect(response.body.data).toMatchObject({ status: 'waiting', targetDepartment: 'Producción', hostPerson: 'Responsable ficticio', vehiclePlate: 'ABC123' });
    });

    it('returns complete visitor history, observations and blocking status', async () => {
        const response = await request(app).get(api + '/visitors/' + cedula + '?history=true').set(auth('auditor'));
        expect(response.status).toBe(200);
        expect(response.body.data.isBlocked).toBe(false);
        expect(response.body.data.history[0]).toMatchObject({ id: visitId, targetDepartment: 'Producción', hostPerson: 'Responsable ficticio', vehicleBrand: 'Marca', vehiclePlate: 'ABC123' });
    });

    it('requires a session for both photographs, uses private no-store and adds Helmet headers', async () => {
        for (const suffix of ['photo', 'id-photo']) {
            expect((await request(app).get(api + '/visitors/' + cedula + '/' + suffix)).status).toBe(401);
            for (const role of Object.keys(tokens)) {
                const response = await request(app).get(api + '/visitors/' + cedula + '/' + suffix).set(auth(role));
                expect(response.status).toBe(200);
                expect(response.headers['cache-control']).toBe('private, no-store');
                expect(response.headers['content-type']).toContain('image/png');
                expect(response.headers['x-content-type-options']).toBe('nosniff');
            }
        }
    });

    it('enforces edit passwords, input validation and the full role matrix directly in the API', async () => {
        expect((await update({ firstName: 'Nuevo' })).status).toBe(400);
        expect((await update({ firstName: 'Nuevo', editPassword: 'incorrecta' })).status).toBe(403);
        expect((await update({ firstName: 'Nuevo', editPassword: config.editPassword, id: 999 })).status).toBe(400);
        for (const role of ['auditor', 'demo']) {
            expect((await update({ firstName: 'Nuevo', editPassword: config.editPassword }, role)).status).toBe(403);
            expect((await request(app).post(api + '/visits/' + visitId + '/admit').set(auth(role))).status).toBe(403);
        }
        expect((await update({ isBlocked: true, editPassword: config.editPassword }, 'operador')).status).toBe(403);
        for (const role of ['root', 'admin', 'operador']) expect((await update({ firstName: 'Actualizado-' + role, editPassword: config.editPassword }, role)).status).toBe(200);
        for (const role of ['admin', 'operador', 'auditor', 'demo']) expect((await request(app).get(api + '/superadmin/users').set(auth(role))).status).toBe(403);
        expect((await request(app).get(api + '/superadmin/users').set(auth('root'))).status).toBe(200);
    });

    it('records edits without a visit and encrypts personal old and new values', async () => {
        const history = await History.findAll({ where: { visitorId: originalVisitorId } });
        expect(history.length).toBeGreaterThanOrEqual(3);
        expect(history.every(h => h.visitId === null && h.oldValue?.startsWith('ENC:') && h.newValue?.startsWith('ENC:'))).toBe(true);
        const response = await request(app).get(api + '/visitors/' + cedula + '/edit-history').set(auth());
        expect(response.body.data.at(-1).newValue).toBe('Actualizado-operador');
    });

    it('verifies visit ownership and rolls back changes when history persistence fails', async () => {
        expect((await update({ visitId: 999999, firstName: 'Inválido', editPassword: config.editPassword })).status).toBe(400);
        const spy = vi.spyOn(History, 'create').mockRejectedValueOnce(new Error('Injected audit failure'));
        expect((await update({ firstName: 'Rollback', editPassword: config.editPassword })).status).toBe(500);
        spy.mockRestore();
        expect((await Visitor.findByPk(originalVisitorId))!.getDecrypted().first_name).toBe('Actualizado-operador');
    });

    it('encrypts legacy history idempotently and removes legacy photograph values', async () => {
        const legacy = await History.create({ visitorId: originalVisitorId, visitId: null, field: 'email', oldValue: 'before@example.test', newValue: 'after@example.test', editedBy: accounts.admin.id, editedByUsername: 'Test-admin' });
        const photograph = await History.create({ visitorId: originalVisitorId, visitId: null, field: 'photo_data', oldValue: photo, newValue: photo, editedBy: accounts.admin.id, editedByUsername: 'Test-admin' });
        const { up } = require('../src/migrations/009-stabilization');
        await up({ context: sequelize });
        await legacy.reload();
        expect(Encryption.decrypt(legacy.oldValue!)).toBe('before@example.test');
        const encrypted = legacy.oldValue;
        await up({ context: sequelize });
        await legacy.reload();
        await photograph.reload();
        expect(legacy.oldValue).toBe(encrypted);
        expect(photograph.oldValue).toBeNull();
        expect(photograph.newValue).toBeNull();
        expect((await update({ jobTitle: 'Cargo ficticio '.repeat(12), editPassword: config.editPassword })).status).toBe(200);
    });

    it('stops a migration on duplicate open visits without deleting either event', async () => {
        const { up } = require('../src/migrations/009-stabilization');
        await sequelize.query('DROP INDEX visits_one_open_per_visitor');
        const original = (await Visit.findByPk(visitId))!;
        const { id, ...values } = original.get({ plain: true });
        const duplicate = await Visit.create(values);
        try {
            await expect(up({ context: sequelize })).rejects.toThrow('Duplicate open visits');
            expect(await Visit.count({ where: { id: [original.id, duplicate.id] } })).toBe(2);
        } finally {
            await duplicate.destroy();
            await up({ context: sequelize });
        }
    });

    it('records blocking, unblocking, rectification and photograph metadata', async () => {
        for (const isBlocked of [true, false]) expect((await update({ isBlocked, observations: 'Observación ficticia', editPassword: config.editPassword })).status).toBe(200);
        expect((await request(app).patch(api + '/privacy/subjects/' + cedula).set(auth('operador')).send({ firstName: 'Rectificado', editPassword: config.editPassword })).status).toBe(200);
        expect((await update({ photoBase64: 'data:image/png;base64,aW52YWxpZA==', editPassword: config.editPassword })).status).toBe(400);
        expect((await update({ photoBase64: photo, idPhotoBase64: photo, email: null, editPassword: config.editPassword, visitId })).status).toBe(200);
        expect((await Visitor.findByPk(originalVisitorId))!.email).toBeNull();
        await Visitor.update({ photo_data: null }, { where: { id: originalVisitorId } });
        expect((await update({ photoBase64: photo, editPassword: config.editPassword })).status).toBe(200);
        const entry = await History.findOne({ where: { field: 'photo_data' } });
        expect(entry).not.toBeNull();
        expect(entry!.oldValue).toBeNull();
        expect(entry!.newValue).toBeNull();
    });

    it('rejects open-visit cancellation and duplicate open visits at the database boundary', async () => {
        const response = await request(app).delete(api + '/privacy/subjects/' + cedula).set(auth());
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('OPEN_VISIT_EXISTS');
        const current = (await Visit.findByPk(visitId))!.get({ plain: true });
        const { id, ...duplicate } = current;
        await expect(Visit.create(duplicate)).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
        expect((await request(app).post(api + '/visits/checkin').set(auth()).send(checkin())).status).toBe(400);
    });

    it('enforces mandatory password change immediately in HTTP and SSE', async () => {
        await accounts.operador.update({ mustChangePassword: true });
        expect((await request(app).get(api + '/visitors/' + cedula).set(auth('operador'))).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
        const response = await request(app).get(api + '/events/visits').query({ token: tokens.operador });
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
        expect((await request(app).post(api + '/auth/change-password').set(auth('operador')).send({ currentPassword: 'incorrecta', newPassword: 'Another!18Secure' })).status).toBe(401);
        await accounts.operador.update({ mustChangePassword: false });
        expect((await request(app).get(api + '/visitors/' + cedula).set(auth('operador'))).status).toBe(200);
    });

    it('runs admission, temporary exit, reentry and final checkout', async () => {
        for (const endpoint of ['admit', 'intermittent-exit', 'intermittent-reentry', 'checkout']) {
            const response = await request(app).post(api + '/visits/' + visitId + '/' + endpoint).set(auth('operador')).send({ notes: 'Nota ficticia' });
            expect(response.status).toBe(200);
        }
        expect((await Visit.findByPk(visitId))!.status).toBe('completed');
    });

    it('closes an existing SSE session before sending events after a password restriction', async () => {
        const server = app.listen(0, '127.0.0.1');
        await new Promise<void>(resolve => server.once('listening', resolve));
        const address = server.address() as { port: number };
        try {
            const response = await fetch(`http://127.0.0.1:${address.port}${api}/events/visits?token=${tokens.operador}`, { signal: AbortSignal.timeout(5000) });
            expect(response.status).toBe(200);
            const reader = response.body!.getReader();
            expect(new TextDecoder().decode((await reader.read()).value)).toContain('system:connected');
            await accounts.operador.update({ mustChangePassword: true });
            container.eventEmitter.emitVisitEvent({ type: 'visit:admitted', visitId, timestamp: new Date().toISOString() });
            expect((await reader.read()).done).toBe(true);
        } finally {
            await accounts.operador.update({ mustChangePassword: false });
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });

    it('fully anonymizes PostgreSQL data, keeps events and starts an independent new profile', async () => {
        await Arco.create({ requestType: 'access', subjectCedulaHash: Encryption.hash(cedula), subjectCedulaEncrypted: Encryption.encrypt(cedula), requestedByName: 'Nombre ficticio', requestPayload: JSON.stringify({ phone: '1234567' }), contactEmail: 'visitor@example.test', reason: 'Texto personal' });
        const response = await request(app).delete(api + '/privacy/subjects/' + cedula).set(auth('root'));
        expect(response.status).toBe(200);
        const visitor = (await Visitor.findByPk(originalVisitorId))!;
        expect(visitor.anonymizedAt).not.toBeNull();
        expect(visitor.cedula).not.toBe(Encryption.hash(cedula));
        for (const key of ['encrypted_cedula', 'email', 'phone', 'job_title', 'photo_data', 'id_photo_data', 'photo_url', 'id_photo_url', 'observations'] as const) expect(visitor[key]).toBeNull();
        const history = await History.findAll({ where: { visitorId: originalVisitorId } });
        expect(history.every(h => h.oldValue === null && h.newValue === null)).toBe(true);
        const visit = (await Visit.findByPk(visitId))!;
        expect(visit.status).toBe('completed');
        expect(visit.visitor_cedula).toBe(visitor.cedula);
        expect(visit.companion_name).toBeNull();
        expect(visit.vehicle_plate).toBeNull();
        expect(visit.notes).toBeNull();
        const arco = (await Arco.findOne({ where: { requestType: 'access' } }))!;
        expect(arco.subjectCedulaEncrypted).toBeNull();
        expect(arco.requestPayload).toBeNull();
        expect(arco.contactEmail).toBeNull();
        const list = await request(app).get(api + '/visits').set(auth());
        expect(list.body.data.visits.find((v: { id: number }) => v.id === visitId).visitorCedula).toBeNull();
        expect((await request(app).get(api + '/visitors/' + cedula).set(auth())).status).toBe(404);
        expect((await request(app).post(api + '/visits/checkin').set(auth()).send(checkin())).status).toBe(201);
        const fresh = (await Visitor.findOne({ where: { cedula: Encryption.hash(cedula) } }))!;
        expect(fresh.id).not.toBe(originalVisitorId);
        expect(await History.count({ where: { visitorId: fresh.id } })).toBe(0);
    });

    it('creates operational accounts with email and applies root password policy and persistent session revocation', async () => {
        expect((await request(app).post(api + '/superadmin/users').set(auth('root')).send({ username: 'NewUser', role: 'operador', password })).status).toBe(400);
        const created = await request(app).post(api + '/superadmin/users').set(auth('root')).send({ username: 'NewUser', role: 'operador', password, email: 'new@example.test' });
        expect(created.status).toBe(201);
        expect(created.body.data).toMatchObject({ email: 'new@example.test', mustChangePassword: true });
        const login = await request(app).post(api + '/auth/login').send({ username: accounts.auditor.username, password });
        const refreshToken = login.body.data.refreshToken;
        expect((await request(app).post(api + '/superadmin/users/' + accounts.auditor.id + '/reset-password').set(auth('root')).send({ newPassword: 'alllowercasepassword' })).status).toBe(400);
        expect((await request(app).post(api + '/superadmin/users/' + accounts.auditor.id + '/reset-password').set(auth('root')).send({ newPassword: 'RootReset!18Secure' })).status).toBe(200);
        const reloaded = (await new SequelizeUserRepository().findById(accounts.auditor.id))!;
        expect(reloaded.tokenVersion).toBe(1);
        expect(reloaded.mustChangePassword).toBe(true);
        expect((await request(app).get(api + '/visitors').set(auth('auditor'))).status).toBe(401);
        expect((await request(app).post(api + '/auth/refresh').send({ refreshToken })).status).toBe(401);
    });

    it('captures email in Mailpit, uses a hash-router link and consumes reset tokens only once', async () => {
        await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE' });
        const username = accounts.admin.username;
        const existing = await request(app).post(api + '/auth/forgot-password').send({ username });
        const missing = await request(app).post(api + '/auth/forgot-password').send({ username: 'Missing' });
        await accounts.demo.update({ email: null });
        const noEmail = await request(app).post(api + '/auth/forgot-password').send({ username: accounts.demo.username });
        expect(existing.body).toEqual(missing.body);
        expect(existing.body).toEqual(noEmail.body);
        const messages = await (await fetch('http://127.0.0.1:8025/api/v1/messages')).json() as { messages: { ID: string }[] };
        expect(messages.messages).toHaveLength(1);
        const message = await (await fetch('http://127.0.0.1:8025/api/v1/message/' + messages.messages[0].ID)).json() as { Text: string };
        const token = /\/#\/reset-password\?token=([a-f0-9]{64})/.exec(message.Text)![1];
        const stored = (await User.findByPk(accounts.admin.id))!;
        expect(stored.resetToken).toBe(Encryption.hash(token));
        expect(stored.resetTokenExpiry!.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
        await stored.update({ resetTokenExpiry: new Date(Date.now() - 1000) });
        expect((await request(app).post(api + '/auth/reset-password').send({ token, newPassword: 'MailReset!18Secure' })).status).toBe(400);
        await stored.update({ resetTokenExpiry: new Date(Date.now() + 60_000) });
        const responses = await Promise.all([1, 2].map(() => request(app).post(api + '/auth/reset-password').send({ token, newPassword: 'MailReset!18Secure' })));
        expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
        expect((await request(app).get(api + '/visitors').set(auth())).status).toBe(401);
        const login = await request(app).post(api + '/auth/login').send({ username, password: 'MailReset!18Secure' });
        expect(login.status).toBe(200);
        tokens.admin = login.body.data.accessToken;
    });

    it('keeps statistics, report data, calendar data and audit queries working', async () => {
        for (const endpoint of ['/reports/stats', '/reports/stats/monthly?month=10&year=2026', '/reports/comparison?month=10&year=2026', '/visits', '/audit/logs', '/audit/stats']) {
            expect((await request(app).get(api + endpoint).set(auth('root'))).status).toBe(200);
        }
        expect(await Activity.count()).toBeGreaterThan(0);
        const now = new Date();
        const monthly = await request(app).get(api + `/reports/stats/monthly?month=${now.getMonth()}&year=${now.getFullYear()}`).set(auth('root'));
        expect(monthly.body.data.summary).toMatchObject({ totalVisits: await Visit.count(), uniqueVisitors: 2, completionRate: 50 });
        expect(monthly.body.data.byReason.length).toBeGreaterThan(0);
    });

    it('rejects old access and refresh sessions after restarting the actual server process', async () => {
        const user = await User.create({ username: 'RestartUser', role: 'operador', email: 'restart@example.test', password: await new JwtAuthService().hashPassword(password), mustChangePassword: false });
        const login = await request(app).post(api + '/auth/login').send({ username: user.username, password });
        const reservation = app.listen(0, '127.0.0.1');
        await new Promise<void>(resolve => reservation.once('listening', resolve));
        const port = (reservation.address() as { port: number }).port;
        await new Promise<void>(resolve => reservation.close(() => resolve()));
        const url = `http://127.0.0.1:${port}${api}`;
        const start = async () => {
            const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/server.ts'], {
                cwd: process.cwd(), env: { ...process.env, PORT: String(port), RETENTION_ENABLED: 'false' }, stdio: 'ignore', windowsHide: true
            });
            for (let attempt = 0; attempt < 100; attempt++) {
                try { if ((await fetch(url + '/health')).ok) return child; } catch { /* Wait for startup. */ }
                if (child.exitCode !== null) throw new Error('Local validation server exited before startup');
                await pause(50);
            }
            child.kill();
            throw new Error('Local validation server did not start');
        };
        let child = await start();
        try {
            const headers = { Authorization: 'Bearer ' + login.body.data.accessToken };
            expect((await fetch(url + '/visitors', { headers })).status).toBe(200);
            expect((await request(app).post(api + '/superadmin/users/' + user.id + '/reset-password').set(auth('root')).send({ newPassword: 'RestartReset!18Secure' })).status).toBe(200);
            child.kill();
            await new Promise<void>(resolve => child.once('exit', () => resolve()));
            child = await start();
            expect((await fetch(url + '/visitors', { headers })).status).toBe(401);
            expect((await fetch(url + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: login.body.data.refreshToken }) })).status).toBe(401);
        } finally {
            child.kill();
            await new Promise<void>(resolve => child.once('exit', () => resolve()));
        }
    });

    it('creates an encrypted backup and restores only into logmaster_restore_test', async () => {
        const response = await request(app).post(api + '/backups').set(auth('root'));
        expect(response.status).toBe(200);
        const { filePath, restorePassword } = response.body.data;
        const restoreEnv = dotenv.parse(fs.readFileSync(path.resolve('../.env.logmaster-restore_test.local')));
        expect(restoreEnv.DB_NAME).toBe('logmaster_restore_test');
        expect(restoreEnv.DB_HOST).toBe('127.0.0.1');
        const original = { dbName: config.dbName, dbUser: config.dbUser, dbPassword: config.dbPassword };
        try {
            Object.assign(config, { dbName: restoreEnv.DB_NAME, dbUser: restoreEnv.DB_USER, dbPassword: restoreEnv.DB_PASSWORD });
            const backup = new PostgresBackupService();
            await expect(backup.restoreBackup(path.basename(filePath), 'wrong-password')).rejects.toThrow('Invalid restore password');
            await backup.restoreBackup(path.basename(filePath), restorePassword);
            const restored = new Sequelize({ dialect: 'postgres', host: '127.0.0.1', port: 55432, database: restoreEnv.DB_NAME, username: restoreEnv.DB_USER, password: restoreEnv.DB_PASSWORD, logging: false });
            try {
                const rows = await restored.query<{ count: string }>('SELECT count(*) FROM "Visits"', { type: QueryTypes.SELECT });
                expect(Number(rows[0].count)).toBe(await Visit.count());
            } finally { await restored.close(); }
        } finally { Object.assign(config, original); }
    });
});
