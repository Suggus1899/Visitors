
import VisitModel from '../models/Visit';
import VisitorModel from '../models/Visitor';
import { VisitStatus } from '../domain/entities/Visit.entity';

async function forceInsert() {
    console.log('Forcing insertion of recent visits...');
    
    // Ensure at least one visitor exists
    let visitor = await VisitorModel.findOne();
    if (!visitor) {
        visitor = await VisitorModel.create({
            cedula: '88888888',
            first_name: 'Forced',
            last_name: 'Visitor',
            company: 'Emergency One',
            email: 'force@test.com',
            phone: '+584120001122'
        });
    }

    const today = new Date();
    
    // Create 5 active visits for TODAY
    for (let i = 0; i < 5; i++) {
        await VisitModel.create({
            visitor_cedula: visitor.cedula,
            check_in_time: new Date(today.getTime() - i * 3600000), // 0, 1, 2, 3, 4 hours ago
            purpose: 'Emergency Test',
            person_to_visit: 'Admin',
            status: VisitStatus.ACTIVE,
            notes: 'Forced insertion'
        });
    }

    // Create 5 completed visits for TODAY
    for (let i = 0; i < 5; i++) {
        const checkIn = new Date(today.getTime() - (i + 5) * 3600000);
        await VisitModel.create({
            visitor_cedula: visitor.cedula,
            check_in_time: checkIn,
            check_out_time: new Date(checkIn.getTime() + 3600000),
            purpose: 'Completed Test',
            person_to_visit: 'Admin',
            status: VisitStatus.COMPLETED,
            notes: 'Forced insertion completed'
        });
    }

    console.log('✅ Force inserted 10 visits for TODAY.');
}

forceInsert().catch(console.error);
