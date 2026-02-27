import bcrypt from 'bcryptjs';
import User from '../models/User';
import VisitorModel from '../models/Visitor';
import VisitModel from '../models/Visit';
import Encryption from './Encryption';

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
    const adminEmail = 'Admin@puig.com';
    const adminExists = await User.findOne({ where: { username: adminEmail } });

    if (!adminExists) {
        console.log('Seeding database with Enterprise Admin...');
        const hashedAdmin = await bcrypt.hash('Puig123*', 8);
        const hashedGuard = await bcrypt.hash('guard123', 8);

        await User.create({ username: adminEmail, password: hashedAdmin, role: 'admin' });
        await User.create({ username: 'guard', password: hashedGuard, role: 'guard' });

        // Legacy admin fallback
        const legacyAdmin = await User.findOne({ where: { username: 'admin' } });
        if (!legacyAdmin) {
            await User.create({ username: 'admin', password: await bcrypt.hash('admin123', 8), role: 'admin' });
        }

        console.log('✅ Users Created: Admin@puig.com, guard, admin');
    }

    // Always ensure demo user exists (separate check)
    const demoUser = await User.findOne({ where: { username: 'demo' } });
    if (!demoUser) {
        console.log('Creating demo user...');
        const hashedDemo = await bcrypt.hash('demo123', 8);
        await User.create({ username: 'demo', password: hashedDemo, role: 'admin' });
        console.log('✅ Demo user created: demo/demo123');
    }

    const auditorUser = await User.findOne({ where: { username: 'auditor' } });
    if (!auditorUser) {
        console.log('Creating auditor user...');
        const hashedAuditor = await bcrypt.hash('audit2026', 8);
        await User.create({ username: 'auditor', password: hashedAuditor, role: 'auditor' });
        console.log('✅ Auditor user created: auditor/audit2026');
    } else if (auditorUser.role !== 'auditor') {
        const hashedAuditor = await bcrypt.hash('audit2026', 8);
        auditorUser.role = 'auditor';
        auditorUser.password = hashedAuditor;
        await auditorUser.save();
        console.log('✅ Auditor user updated: auditor/audit2026');
    }
};

export const seedDatabase = async () => {
    try {
        await ensureBaseUsers();

        // Check if extended seed already exists
        const visitCount = await VisitModel.count();
        if (visitCount < 50) {
            console.log('Seeding extended demo data (90 visits in January)...');

            // Generate 30 unique visitors
            const visitors = [];
            for (let i = 1; i <= 30; i++) {
                const cedula = (10000000 + i * 123456 + Math.floor(Math.random() * 100000)).toString().substring(0, 8);
                visitors.push({
                    cedula,
                    first_name: firstNames[Math.floor(Math.random() * firstNames.length)],
                    last_name: lastNames[Math.floor(Math.random() * lastNames.length)],
                    company: companies[Math.floor(Math.random() * companies.length)],
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

            // Generate 90 visits distributed across January 2026
            const visitsToCreate = [];
            for (let i = 0; i < 90; i++) {
                const day = Math.floor(Math.random() * 31) + 1; // 1-31
                const hour = 8 + Math.floor(Math.random() * 9); // 8am to 5pm
                const visitorIndex = Math.floor(Math.random() * visitors.length);
                const checkIn = randomJanuaryDate(day, hour);
                const checkOut = new Date(checkIn.getTime() + (1 + Math.random() * 4) * 3600000); // 1-5 hours later

                visitsToCreate.push({
                    visitor_cedula: Encryption.hash(visitors[visitorIndex].cedula),
                    purpose: reasons[Math.floor(Math.random() * reasons.length)],
                    person_to_visit: `Admin User`, // Default host for demo
                    check_in_time: checkIn,
                    check_out_time: checkOut,
                    status: 'completed'
                });
            }

            // Add February visits (current month) - 30 visits with 25 active
            const now = new Date();
            for (let i = 0; i < 30; i++) {
                const day = Math.min(now.getDate(), 1 + Math.floor(Math.random() * 6)); // First days of Feb
                const hour = 8 + Math.floor(Math.random() * 9);
                const visitorIndex = Math.floor(Math.random() * visitors.length);
                const checkIn = new Date(2026, 1, day, hour, Math.floor(Math.random() * 60));

                // 25 active, 5 completed
                const isActive = i < 25;
                visitsToCreate.push({
                    visitor_cedula: Encryption.hash(visitors[visitorIndex].cedula),
                    purpose: reasons[Math.floor(Math.random() * reasons.length)],
                    person_to_visit: `Admin User`,
                    check_in_time: checkIn,
                    check_out_time: isActive ? null : new Date(checkIn.getTime() + (1 + Math.random() * 3) * 3600000),
                    status: isActive ? 'active' : 'completed'
                });
            }

            // Create all visits
            for (const visitData of visitsToCreate) {
                await VisitModel.create(visitData as any);
            }

            console.log(`✅ Extended seed complete: ${visitors.length} visitors, ${visitsToCreate.length} visits`);
        } else {
            console.log('✅ Database already has sufficient data.');
        }
    } catch (err) {
        console.error('Seed Error:', err);
    }
};

export const seedLoad = async (options: SeedLoadOptions) => {
    const startDate = options.startDate ?? new Date(2026, 0, 6, 8, 0, 0);
    const endDate = options.endDate ?? new Date(2026, 1, 7, 18, 0, 0);
    const activeRatio = options.activeRatio ?? 0.08;
    const visitorCount = Math.max(1, Math.floor(options.visitorCount));

    try {
        await ensureBaseUsers();

        console.log(
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

        console.log(`✅ Load seed complete: ${visitorCount} visitors, ${visitsToCreate.length} visits`);
    } catch (err) {
        console.error('Seed Load Error:', err);
    }
};
