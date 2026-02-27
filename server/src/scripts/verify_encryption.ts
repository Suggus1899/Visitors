import sequelize from '../database';
import { container } from '../shared/Container';
import Encryption from '../utils/Encryption';
import VisitorModel from '../models/Visitor';

const verify = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // const container = Container.getInstance(); // Container class not exported
        const visitorRepo = container.visitorRepository;
        const visitRepo = container.visitRepository;
        const backupService = container.backupService;

        // 1. Create Visitor
        console.log('--- TEST 1: Create Visitor ---');
        const testCedula = 'TEST-' + Date.now();
        const testVisitor = await visitorRepo.create({
            cedula: testCedula,
            firstName: 'John',
            lastName: 'Doe',
            company: 'Test Corp',
            email: 'john@test.com',
            phone: '555-1234'
        } as any);
        console.log('Created Visitor:', testVisitor.cedula, testVisitor.firstName);

        // Verify DB content (should be encrypted)
        const dbVisitor = await VisitorModel.findByPk(Encryption.hash(testCedula));
        console.log('DB Content (Hash PK):', dbVisitor?.cedula);
        console.log('DB Content (Encrypted First Name):', dbVisitor?.first_name);
        console.log('DB Content (Encrypted Cedula):', dbVisitor?.encrypted_cedula);

        if (dbVisitor?.first_name === 'John') throw new Error('First Name NOT encrypted!');
        if (dbVisitor?.encrypted_cedula === testCedula) throw new Error('Cedula NOT encrypted in encrypted_cedula column!');

        // 2. Find by Cedula
        console.log('--- TEST 2: Find by Cedula ---');
        const found = await visitorRepo.findByCedula(testCedula);
        console.log('Found Visitor:', found?.cedula, found?.firstName);
        if (found?.firstName !== 'John') throw new Error('Decryption failed on findByCedula');

        // 3. Create Visit
        console.log('--- TEST 3: Create Visit ---');
        const visit = await visitRepo.create({
            visitorCedula: testCedula,
            checkInTime: new Date(),
            purpose: 'Testing Encryption',
            personToVisit: 'Admin',
            status: 'ACTIVE'
        } as any);
        console.log('Created Visit:', visit.id);

        // 4. Find Visit (check decryption of visitor name)
        console.log('--- TEST 4: Find Visit & Visitor Details ---');
        console.log('Visit ID:', visit.id);
        const foundVisit = await visitRepo.findById(visit.id!);
        console.log('Found Visit Visitor Name:', foundVisit?.visitorName);
        if (foundVisit?.visitorName !== 'John Doe') throw new Error('Visitor Name not decrypted in Visit');

        // 5. Backup
        console.log('--- TEST 5: Backup ---');
        const backupPath = await backupService.createBackup();
        console.log('Backup created at:', backupPath);
        if (!backupPath.endsWith('.enc')) throw new Error('Backup file extension not .enc');

        // 6. Restore (Optional - risky to run on dev DB if valid data exists, but okay for test env)
        // console.log('--- TEST 6: Restore ---');
        // await backupService.restoreBackup(path.basename(backupPath));
        // console.log('Restore done');

        // Cleanup
        await visitRepo.delete(visit.id!);
        await visitorRepo.delete(testCedula);
        console.log('Cleanup done.');

        process.exit(0);
    } catch (e) {
        console.error('VERIFICATION FAILED:', e);
        process.exit(1);
    }
};

verify();
