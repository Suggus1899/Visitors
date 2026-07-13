import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User';
import VisitorModel from '../models/Visitor';
import VisitModel from '../models/Visit';
import IntermittentLogModel from '../models/IntermittentLog';
import Encryption from './Encryption';
import logger from '../config/logger';
import config from '../config/AppConfig';

/**
 * Generate a cryptographically secure random password
 * Format: 16 chars with uppercase, lowercase, digits, and special chars
 */
const generateSecurePassword = (): string => {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const special = '!@#$%&*';
    const all = upper + lower + digits + special;
    // Ensure at least one of each category
    let password = '';
    password += upper[crypto.randomInt(upper.length)];
    password += lower[crypto.randomInt(lower.length)];
    password += digits[crypto.randomInt(digits.length)];
    password += special[crypto.randomInt(special.length)];
    for (let i = 4; i < 16; i++) {
        password += all[crypto.randomInt(all.length)];
    }
    // Shuffle the password
    return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
};

// Generate random date in January 2026
const randomJanuaryDate = (day: number, hour: number = 9) => {
    return new Date(2026, 0, day, hour, Math.floor(Math.random() * 60), 0);
};

const randomDateInRange = (start: Date, end: Date) => {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const ts = startMs + Math.floor(Math.random() * (endMs - startMs + 1));
    return new Date(ts);
};

// Sample data for generation
const firstNames = ['Juan', 'María', 'Carlos', 'Ana', 'Pedro', 'Lucía', 'Miguel', 'Carmen', 'José', 'Laura',
    'Diego', 'Sofía', 'Andrés', 'Isabella', 'Ricardo', 'Valentina', 'Fernando', 'Camila', 'Roberto', 'Daniela'];
const lastNames = ['Pérez', 'García', 'Rodríguez', 'Martínez', 'López', 'González', 'Hernández', 'Díaz',
    'Torres', 'Ramírez', 'Flores', 'Rivera', 'Gómez', 'Sánchez', 'Morales', 'Castro', 'Ruiz', 'Ortiz', 'Vargas', 'Jiménez'];
const companies = ['TechCorp', 'Distribuidora Norte', 'Servicios Express', 'Consultora Legal', 'Transporte Caribe',
    'Alimentos del Valle', 'Construcciones ABC', 'Marketing Plus', 'Seguros Nacional', 'Farmacia Central',
    'Electrónica Global', 'Textiles Unidos', 'Agroindustria Sur', 'Banco Mercantil', 'Telecomunicaciones VE'];
const reasons = ['Reunión de negocios', 'Entrega de documentos', 'Entrevista de trabajo', 'Mantenimiento técnico',
    'Auditoría', 'Capacitación', 'Visita comercial', 'Consulta legal', 'Entrega de mercancía', 'Firma de contrato'];

type SeedLoadOptions = {
    visitorCount: number;
    startDate?: Date;
    endDate?: Date;
    activeRatio?: number;
};

export const ensureBaseUsers = async () => {
    const adminUserName = 'Admin';
    const adminExists = await User.findOne({ where: { username: adminUserName } });

    if (!adminExists) {
        logger.info('Seeding database with Enterprise Admin...');

        // Default passwords from config (overridable via env)
        const adminPassword = config.seedAdminPassword;
        const operadorPassword = config.seedOperadorPassword;

        const hashedAdmin = await bcrypt.hash(adminPassword, 12);
        const hashedOperador = await bcrypt.hash(operadorPassword, 12);

        await User.create({
            username: adminUserName,
            password: hashedAdmin,
            role: 'admin',
            mustChangePassword: false,
            passwordChangedAt: null
        });
        await User.create({
            username: 'operador',
            password: hashedOperador,
            role: 'operador',
            mustChangePassword: false,
            loginAttempts: 0,
            lockedUntil: null
        });

        // Legacy admin fallback (same password as main admin)
        const legacyAdmin = await User.findOne({ where: { username: 'admin' } });
        if (!legacyAdmin) {
            await User.create({
                username: 'admin',
                password: await bcrypt.hash(adminPassword, 12),
                role: 'admin',
                mustChangePassword: false,
                loginAttempts: 0,
                lockedUntil: null
            });
        }

        logger.info('[Seed] Base admin/operador users created. Passwords come from env (SEED_*_PASSWORD).');
    }

    // Always ensure demo user exists (separate check)
    const demoUser = await User.findOne({ where: { username: 'demo' } });
    if (!demoUser) {
        const demoPassword = config.seedDemoPassword;
        const hashedDemo = await bcrypt.hash(demoPassword, 12);
        await User.create({
            username: 'demo',
            password: hashedDemo,
            role: 'demo',
            mustChangePassword: false,
            loginAttempts: 0,
            lockedUntil: null
        });
        logger.info('[Seed] Demo user created.');
    } else if (demoUser.role !== 'demo') {
        demoUser.role = 'demo';
        await demoUser.save();
        logger.info('[Seed] Demo user role updated.');
    }

    // Always ensure operador user exists (separate check)
    const operadorUser = await User.findOne({ where: { username: 'operador' } });
    if (!operadorUser) {
        const operadorPassword = config.seedOperadorPassword;
        const hashedOperador = await bcrypt.hash(operadorPassword, 12);
        await User.create({
            username: 'operador',
            password: hashedOperador,
            role: 'operador',
            mustChangePassword: false,
            loginAttempts: 0,
            lockedUntil: null
        });
        logger.info('[Seed] Operador user created.');
    } else if (operadorUser.role !== 'operador') {
        operadorUser.role = 'operador';
        await operadorUser.save();
        logger.info('[Seed] Operador user role updated.');
    }

    // Always ensure guard user exists (separate check)
    const guardUser = await User.findOne({ where: { username: 'guard' } });
    if (!guardUser) {
        const guardPassword = config.seedGuardPassword;
        const hashedGuard = await bcrypt.hash(guardPassword, 12);
        await User.create({
            username: 'guard',
            password: hashedGuard,
            role: 'operador',
            mustChangePassword: false,
            loginAttempts: 0,
            lockedUntil: null
        });
        logger.info('[Seed] Guard user created.');
    } else if (guardUser.role !== 'operador') {
        guardUser.role = 'operador';
        await guardUser.save();
        logger.info('[Seed] Guard user role updated.');
    }

    const auditorUser = await User.findOne({ where: { username: 'auditor' } });
    if (!auditorUser) {
        const auditorPassword = config.seedAuditorPassword;
        const hashedAuditor = await bcrypt.hash(auditorPassword, 12);
        await User.create({
            username: 'auditor',
            password: hashedAuditor,
            role: 'auditor',
            mustChangePassword: false,
            loginAttempts: 0,
            lockedUntil: null
        });
        logger.info('[Seed] Auditor user created.');
    } else if (auditorUser.role !== 'auditor') {
        const auditorPassword = config.seedAuditorPassword;
        const hashedAuditor = await bcrypt.hash(auditorPassword, 12);
        auditorUser.role = 'auditor';
        auditorUser.password = hashedAuditor;
        auditorUser.mustChangePassword = false;
        auditorUser.loginAttempts = 0;
        auditorUser.lockedUntil = null;
        await auditorUser.save();
        logger.info('[Seed] Auditor user updated.');
    }


    // Always ensure root user exists
    const rootUser = await User.findOne({ where: { username: 'trebolmaster' } });
    if (!rootUser) {
        const rootPassword = config.seedSuperadminPassword;
        const hashedRoot = await bcrypt.hash(rootPassword, 12);
        await User.create({
            username: 'trebolmaster',
            password: hashedRoot,
            role: 'root',
            mustChangePassword: false,
            loginAttempts: 0,
            lockedUntil: null
        });
        logger.info('[Seed] Root user created.');
    } else if (rootUser.role !== 'root') {
        rootUser.role = 'root';
        await rootUser.save();
        logger.info('[Seed] Root user role updated: trebolmaster');
    }
};

export const seedDatabase = async () => {
    try {
        await ensureBaseUsers();

        // Check if extended seed already exists
        const visitCount = await VisitModel.count();
        if (visitCount < 50) {
            logger.info('Seeding comprehensive demo data with all visit states...');

            // Generate 40 unique visitors with diverse profiles
            const visitors = [];
            const jobTitles = ['Gerente', 'Supervisor', 'Técnico', 'Contador', 'Abogado', 'Ingeniero', 'Consultor', 'Director', 'Analista', 'Coordinador'];
            const departments = ['Administración', 'Ventas', 'Logística', 'Finanzas', 'Recursos Humanos', 'IT', 'Operaciones', 'Legal'];
            const areas = ['Oficina', 'Planta', 'Almacén', 'Ninguna'] as const;
            const actions = ['Carga', 'Descarga', 'Ninguna'] as const;
            const vehicleBrands = ['Toyota', 'Ford', 'Chevrolet', 'Nissan', 'Honda', 'Hyundai', 'Kia', 'Mazda'];
            const vehicleModels = ['Corolla', 'F-150', 'Silverado', 'Sentra', 'Civic', 'Tucson', 'Sportage', 'CX-5'];

            for (let i = 1; i <= 40; i++) {
                const cedula = (10000000 + i * 123456 + Math.floor(Math.random() * 100000)).toString().substring(0, 8);
                visitors.push({
                    cedula,
                    first_name: firstNames[Math.floor(Math.random() * firstNames.length)],
                    last_name: lastNames[Math.floor(Math.random() * lastNames.length)],
                    company: companies[Math.floor(Math.random() * companies.length)],
                    job_title: jobTitles[Math.floor(Math.random() * jobTitles.length)],
                    email: `visitor${i}@example.com`,
                    phone: `+5841${Math.floor(1000000 + Math.random() * 9000000)}`
                });
            }

            // Create visitors
            for (const v of visitors) {
                const exists = await VisitorModel.findByPk(Encryption.hash(v.cedula));
                if (!exists) {
                    await VisitorModel.create(v);
                }
            }

            // Generate 90 visits distributed across January 2026 (all completed)
            const visitsToCreate = [];
            for (let i = 0; i < 90; i++) {
                const day = Math.floor(Math.random() * 31) + 1; // 1-31
                const hour = 8 + Math.floor(Math.random() * 9); // 8am to 5pm
                const visitorIndex = Math.floor(Math.random() * visitors.length);
                const checkIn = randomJanuaryDate(day, hour);
                const checkOut = new Date(checkIn.getTime() + (1 + Math.random() * 4) * 3600000); // 1-5 hours later
                const hasVehicle = Math.random() > 0.6;
                const hasCompanion = Math.random() > 0.7;

                visitsToCreate.push({
                    visitor_cedula: Encryption.hash(visitors[visitorIndex].cedula),
                    purpose: reasons[Math.floor(Math.random() * reasons.length)],
                    person_to_visit: `Admin User`,
                    check_in_time: checkIn,
                    check_out_time: checkOut,
                    status: 'completed',
                    notes: Math.random() > 0.7 ? 'Visita completada sin novedades' : null,
                    companion_name: hasCompanion ? `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}` : null,
                    companion_cedula: hasCompanion ? (20000000 + Math.floor(Math.random() * 10000000)).toString().substring(0, 8) : null,
                    vehicle_brand: hasVehicle ? vehicleBrands[Math.floor(Math.random() * vehicleBrands.length)] : null,
                    vehicle_model: hasVehicle ? vehicleModels[Math.floor(Math.random() * vehicleModels.length)] : null,
                    vehicle_plate: hasVehicle ? `ABC${Math.floor(100 + Math.random() * 900)}` : null,
                    area: areas[Math.floor(Math.random() * areas.length)],
                    action: actions[Math.floor(Math.random() * actions.length)],
                    department: departments[Math.floor(Math.random() * departments.length)]
                });
            }

            // Add February visits (current month) with diverse states
            const now = new Date();

            // 1. WAITING visits (8 visitors waiting to be admitted)
            logger.info('Creating WAITING visits...');
            for (let i = 0; i < 8; i++) {
                const visitorIndex = Math.floor(Math.random() * visitors.length);
                const checkIn = new Date(now.getTime() - (Math.floor(Math.random() * 30) + 5) * 60000); // 5-35 minutes ago
                const hasVehicle = Math.random() > 0.5;
                const hasCompanion = Math.random() > 0.6;

                visitsToCreate.push({
                    visitor_cedula: Encryption.hash(visitors[visitorIndex].cedula),
                    purpose: reasons[Math.floor(Math.random() * reasons.length)],
                    person_to_visit: `Admin User`,
                    check_in_time: checkIn,
                    check_out_time: null,
                    status: 'waiting',
                    notes: 'Esperando autorización de ingreso',
                    companion_name: hasCompanion ? `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}` : null,
                    companion_cedula: hasCompanion ? (20000000 + Math.floor(Math.random() * 10000000)).toString().substring(0, 8) : null,
                    vehicle_brand: hasVehicle ? vehicleBrands[Math.floor(Math.random() * vehicleBrands.length)] : null,
                    vehicle_model: hasVehicle ? vehicleModels[Math.floor(Math.random() * vehicleModels.length)] : null,
                    vehicle_plate: hasVehicle ? `WTG${Math.floor(100 + Math.random() * 900)}` : null,
                    area: areas[Math.floor(Math.random() * areas.length)],
                    action: actions[Math.floor(Math.random() * actions.length)],
                    department: departments[Math.floor(Math.random() * departments.length)]
                });
            }

            // 2. ACTIVE visits (20 visitors currently inside)
            logger.info('Creating ACTIVE visits...');
            for (let i = 0; i < 20; i++) {
                const visitorIndex = Math.floor(Math.random() * visitors.length);
                const hoursAgo = Math.floor(Math.random() * 6) + 1; // 1-6 hours ago
                const checkIn = new Date(now.getTime() - hoursAgo * 3600000);
                const hasVehicle = Math.random() > 0.5;
                const hasCompanion = Math.random() > 0.7;

                visitsToCreate.push({
                    visitor_cedula: Encryption.hash(visitors[visitorIndex].cedula),
                    purpose: reasons[Math.floor(Math.random() * reasons.length)],
                    person_to_visit: `Admin User`,
                    check_in_time: checkIn,
                    check_out_time: null,
                    status: 'active',
                    notes: Math.random() > 0.8 ? 'Visita en progreso' : null,
                    companion_name: hasCompanion ? `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}` : null,
                    companion_cedula: hasCompanion ? (20000000 + Math.floor(Math.random() * 10000000)).toString().substring(0, 8) : null,
                    vehicle_brand: hasVehicle ? vehicleBrands[Math.floor(Math.random() * vehicleBrands.length)] : null,
                    vehicle_model: hasVehicle ? vehicleModels[Math.floor(Math.random() * vehicleModels.length)] : null,
                    vehicle_plate: hasVehicle ? `ACT${Math.floor(100 + Math.random() * 900)}` : null,
                    area: areas[Math.floor(Math.random() * areas.length)],
                    action: actions[Math.floor(Math.random() * actions.length)],
                    department: departments[Math.floor(Math.random() * departments.length)]
                });
            }

            // 3. COMPLETED visits in February (12 visits)
            logger.info('Creating COMPLETED visits for February...');
            for (let i = 0; i < 12; i++) {
                const day = Math.min(now.getDate(), 1 + Math.floor(Math.random() * Math.max(1, now.getDate() - 1)));
                const hour = 8 + Math.floor(Math.random() * 9);
                const visitorIndex = Math.floor(Math.random() * visitors.length);
                const checkIn = new Date(2026, 1, day, hour, Math.floor(Math.random() * 60));
                const checkOut = new Date(checkIn.getTime() + (1 + Math.random() * 4) * 3600000);
                const hasVehicle = Math.random() > 0.6;
                const hasCompanion = Math.random() > 0.7;

                visitsToCreate.push({
                    visitor_cedula: Encryption.hash(visitors[visitorIndex].cedula),
                    purpose: reasons[Math.floor(Math.random() * reasons.length)],
                    person_to_visit: `Admin User`,
                    check_in_time: checkIn,
                    check_out_time: checkOut,
                    status: 'completed',
                    notes: Math.random() > 0.6 ? 'Visita finalizada exitosamente' : null,
                    companion_name: hasCompanion ? `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}` : null,
                    companion_cedula: hasCompanion ? (20000000 + Math.floor(Math.random() * 10000000)).toString().substring(0, 8) : null,
                    vehicle_brand: hasVehicle ? vehicleBrands[Math.floor(Math.random() * vehicleBrands.length)] : null,
                    vehicle_model: hasVehicle ? vehicleModels[Math.floor(Math.random() * vehicleModels.length)] : null,
                    vehicle_plate: hasVehicle ? `CMP${Math.floor(100 + Math.random() * 900)}` : null,
                    area: areas[Math.floor(Math.random() * areas.length)],
                    action: actions[Math.floor(Math.random() * actions.length)],
                    department: departments[Math.floor(Math.random() * departments.length)]
                });
            }

            // Create all visits
            for (const visitData of visitsToCreate) {
                await VisitModel.create(visitData as any);
            }

            logger.info(`✅ Comprehensive seed complete:`);
            logger.info(`   - ${visitors.length} visitors created`);
            logger.info(`   - ${visitsToCreate.length} total visits`);
            logger.info(`   - 8 WAITING visits (pending admission)`);
            logger.info(`   - 20 ACTIVE visits (currently inside)`);
            logger.info(`   - ${90 + 12} COMPLETED visits (historical data)`);
        } else {
            logger.info('✅ Database already has sufficient data.');
        }
    } catch (err) {
        logger.error('Seed Error:', err);
    }
};

export const seedLoad = async (options: SeedLoadOptions) => {
    const startDate = options.startDate ?? new Date(2026, 0, 6, 8, 0, 0);
    const endDate = options.endDate ?? new Date(2026, 1, 7, 18, 0, 0);
    const activeRatio = options.activeRatio ?? 0.08;
    const visitorCount = Math.max(1, Math.floor(options.visitorCount));

    try {
        await ensureBaseUsers();

        logger.info(
            `Seeding load data: ${visitorCount} visitors between ${startDate.toISOString()} and ${endDate.toISOString()}`
        );

        const visitors: Array<{ cedula: string; first_name: string; last_name: string; company: string; email: string; phone: string }> = [];
        for (let i = 1; i <= visitorCount; i++) {
            const cedula = (10000000 + i).toString().padStart(8, '0');
            visitors.push({
                cedula,
                first_name: firstNames[Math.floor(Math.random() * firstNames.length)],
                last_name: lastNames[Math.floor(Math.random() * lastNames.length)],
                company: companies[Math.floor(Math.random() * companies.length)],
                email: `visitor${i}@example.com`,
                phone: `+5841${Math.floor(1000000 + Math.random() * 9000000)}`
            });
        }

        for (const v of visitors) {
            const exists = await VisitorModel.findByPk(Encryption.hash(v.cedula));
            if (!exists) {
                await VisitorModel.create(v);
            }
        }

        const activeCount = Math.max(1, Math.round(visitorCount * activeRatio));
        const visitsToCreate = [] as Array<{
            visitor_cedula: string;
            purpose: string;
            person_to_visit: string;
            check_in_time: Date;
            check_out_time: Date | null;
            status: 'active' | 'completed';
        }>;

        const activeWindowStart = new Date(Math.max(startDate.getTime(), endDate.getTime() - 24 * 3600000));

        for (let i = 0; i < visitorCount; i++) {
            const visitor = visitors[i];
            const isActive = i < activeCount;
            const checkIn = isActive
                ? randomDateInRange(activeWindowStart, endDate)
                : randomDateInRange(startDate, endDate);

            const durationHours = 1 + Math.random() * 4;
            const rawCheckOut = new Date(checkIn.getTime() + durationHours * 3600000);
            const checkOut = rawCheckOut.getTime() > endDate.getTime() ? endDate : rawCheckOut;

            visitsToCreate.push({
                visitor_cedula: Encryption.hash(visitor.cedula),
                purpose: reasons[Math.floor(Math.random() * reasons.length)],
                person_to_visit: 'Admin User',
                check_in_time: checkIn,
                check_out_time: isActive ? null : checkOut,
                status: isActive ? 'active' : 'completed'
            });
        }

        for (const visitData of visitsToCreate) {
            await VisitModel.create(visitData as any);
        }

        logger.info(`✅ Load seed complete: ${visitorCount} visitors, ${visitsToCreate.length} visits`);
    } catch (err) {
        logger.error('Seed Load Error:', err);
    }
};

// Base64 string for a simple 1x1 gray pixel PNG to act as a placeholder avatar
const DEFAULT_AVATAR_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export const seedComprehensive = async () => {
    try {
        await ensureBaseUsers();

        // 1. Generate 150 visitors with photo
        logger.info('Creating 150 visitors with photos...');
        const visitors = [];
        const jobTitles = ['Gerente', 'Supervisor', 'Técnico', 'Contador', 'Abogado', 'Ingeniero', 'Consultor', 'Director', 'Analista', 'Coordinador'];
        const departments = ['Administración', 'Ventas', 'Logística', 'Finanzas', 'Recursos Humanos', 'IT', 'Operaciones', 'Legal'];
        const areas = ['Oficina', 'Planta', 'Almacén', 'Ninguna'] as const;
        const actions = ['Carga', 'Descarga', 'Ninguna'] as const;
        const vehicleBrands = ['Toyota', 'Ford', 'Chevrolet', 'Nissan', 'Honda', 'Hyundai', 'Kia', 'Mazda'];
        const vehicleModels = ['Corolla', 'F-150', 'Silverado', 'Sentra', 'Civic', 'Tucson', 'Sportage', 'CX-5'];
        const photoBuffer = Buffer.from(DEFAULT_AVATAR_B64, 'base64');

        for (let i = 1; i <= 150; i++) {
            const cedula = (10000000 + i * 1234 + Math.floor(Math.random() * 100000)).toString().substring(0, 8);
            const visitorData = {
                cedula,
                first_name: firstNames[Math.floor(Math.random() * firstNames.length)],
                last_name: lastNames[Math.floor(Math.random() * lastNames.length)],
                company: companies[Math.floor(Math.random() * companies.length)],
                job_title: jobTitles[Math.floor(Math.random() * jobTitles.length)],
                email: `visitor${i}@example.com`,
                phone: `+5841${Math.floor(1000000 + Math.random() * 9000000)}`,
                photo_data: photoBuffer
            };
            visitors.push(visitorData);
            
            const exists = await VisitorModel.findByPk(Encryption.hash(visitorData.cedula));
            if (!exists) {
                await VisitorModel.create(visitorData);
            }
        }

        logger.info('Distributing 150 visits across states...');
        const now = new Date();
        const visitsToCreate = [];

        // 1. COMPLETED visits (40)
        for (let i = 0; i < 40; i++) {
            const visitorIndex = i;
            const checkIn = new Date(now.getTime() - (Math.floor(Math.random() * 72) + 2) * 3600000); // 2-74 hours ago
            const checkOut = new Date(checkIn.getTime() + (1 + Math.random() * 4) * 3600000);

            visitsToCreate.push({
                visitor_cedula: Encryption.hash(visitors[visitorIndex].cedula),
                purpose: reasons[Math.floor(Math.random() * reasons.length)],
                person_to_visit: `Admin User`,
                check_in_time: checkIn,
                check_out_time: checkOut,
                status: 'completed',
                notes: 'Visita finalizada (Seed)',
                area: areas[Math.floor(Math.random() * areas.length)],
                action: actions[Math.floor(Math.random() * actions.length)],
                department: departments[Math.floor(Math.random() * departments.length)]
            });
        }

        // 2. ACTIVE visits (40)
        for (let i = 40; i < 80; i++) {
            const visitorIndex = i;
            const checkIn = new Date(now.getTime() - (Math.floor(Math.random() * 5) + 1) * 3600000); // 1-6 hours ago

            visitsToCreate.push({
                visitor_cedula: Encryption.hash(visitors[visitorIndex].cedula),
                purpose: reasons[Math.floor(Math.random() * reasons.length)],
                person_to_visit: `Admin User`,
                check_in_time: checkIn,
                check_out_time: null,
                status: 'active',
                notes: 'Visita activa adentro (Seed)',
                area: areas[Math.floor(Math.random() * areas.length)],
                action: actions[Math.floor(Math.random() * actions.length)],
                department: departments[Math.floor(Math.random() * departments.length)]
            });
        }

        // 3. INTERMITTENT visits (40)
        for (let i = 80; i < 120; i++) {
            const visitorIndex = i;
            const checkIn = new Date(now.getTime() - (Math.floor(Math.random() * 4) + 2) * 3600000); // 2-6 hours ago

            const visitData: any = {
                visitor_cedula: Encryption.hash(visitors[visitorIndex].cedula),
                purpose: reasons[Math.floor(Math.random() * reasons.length)],
                person_to_visit: `Admin User`,
                check_in_time: checkIn,
                check_out_time: null,
                status: 'intermittent',
                notes: 'Salida temporal registrada (Seed)',
                area: areas[Math.floor(Math.random() * areas.length)],
                action: actions[Math.floor(Math.random() * actions.length)],
                department: departments[Math.floor(Math.random() * departments.length)]
            };

            const createdVisit = await VisitModel.create(visitData);
            
            // Generate the intermittent log entry for this visit
            await IntermittentLogModel.create({
                visit_id: createdVisit.id,
                check_out: new Date(now.getTime() - (Math.floor(Math.random() * 60) + 10) * 60000), // exited 10-70 mins ago
                re_entry: null,
                notes: 'Salió a comprar comida',
                registered_by: 'operador'
            } as any);
        }

        // 4. WAITING visits (30)
        for (let i = 120; i < 150; i++) {
            const visitorIndex = i;
            const checkIn = new Date(now.getTime() - (Math.floor(Math.random() * 45) + 5) * 60000); // 5-50 mins ago

            visitsToCreate.push({
                visitor_cedula: Encryption.hash(visitors[visitorIndex].cedula),
                purpose: reasons[Math.floor(Math.random() * reasons.length)],
                person_to_visit: `Admin User`,
                check_in_time: checkIn,
                check_out_time: null,
                status: 'waiting',
                notes: 'Esperando pase (Seed)',
                area: areas[Math.floor(Math.random() * areas.length)],
                action: actions[Math.floor(Math.random() * actions.length)],
                department: departments[Math.floor(Math.random() * departments.length)]
            });
        }

        // Create the rest of the visits (completed, active, waiting)
        for (const visitData of visitsToCreate) {
            await VisitModel.create(visitData as any);
        }

        logger.info(`✅ Comprehensive seed complete! Created:`);
        logger.info(`   - 150 Visitors with Photos`);
        logger.info(`   - 40 COMPLETED visits`);
        logger.info(`   - 40 ACTIVE visits`);
        logger.info(`   - 40 INTERMITTENT visits (with logs)`);
        logger.info(`   - 30 WAITING visits`);
        
    } catch (err) {
        logger.error('Seed Comprehensive Error:', err);
    }
};
