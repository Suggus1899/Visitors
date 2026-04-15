
import { seedDatabase } from '../utils/seeder';
import VisitModel from '../models/Visit';

// Force delete some data to ensure seeding happens or just force seed
async function force() {
    console.log('Forcing seed...');
    // Clear visits to force re-seed if logic depends on count
    // Or just call a modified seed function.
    // The current seedDatabase checks: if (visitCount < 50)
    
    const count = await VisitModel.count();
    console.log('Current visits:', count);
    
    if (count < 5) {
        console.log('Database seems empty. Running standard seed...');
        await seedDatabase();
    } else {
        console.log('Database has data. Checking if we need to add more recent data...');
        // We could manually inject latest data here if needed, but let's try standard first.
        // If the user says "sigue sin verse nada", maybe the dates are old?
        // The seeder generates dates in Jan 2026. Current date in user system?
        // User metadata says: 2026-02-09.
        // Seeder generates Jan 2026 and Feb 2026 data.
        // It should be fine.
        
        // Let's force execution by updating the check in the seeder? No, I can't easily import and modify.
        // I will copy the seeding logic here and run it.
    }
}

force();
