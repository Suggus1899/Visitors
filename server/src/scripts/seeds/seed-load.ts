import sequelize from '../database';
import User from '../models/User';
import VisitorModel from '../models/Visitor';
import VisitModel from '../models/Visit';
import ActivityLog from '../models/ActivityLog';
import { seedLoad } from '../utils/seeder';

const parseArg = (flag: string) => {
    const index = process.argv.findIndex((arg) => arg === flag);
    if (index === -1) return null;
    return process.argv[index + 1] ?? null;
};

const run = async () => {
    try {
        await sequelize.authenticate();

        // Ensure all models are registered before sync
        void User;
        void VisitorModel;
        void VisitModel;
        void ActivityLog;

        await sequelize.sync();

        const preset = parseArg('--preset') ?? 'standard';
        const countArg = parseArg('--count');
        const activeRatioArg = parseArg('--activeRatio');

        const presetCount = preset === 'max' ? 900 : 300;
        const visitorCount = countArg ? Number(countArg) : presetCount;
        const activeRatio = activeRatioArg ? Number(activeRatioArg) : undefined;

        if (!Number.isFinite(visitorCount) || visitorCount <= 0) {
            throw new Error(`Invalid visitor count: ${countArg}`);
        }

        await seedLoad({
            visitorCount,
            activeRatio
        });

        console.log('✅ Seed load finished.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seed load failed:', error);
        process.exit(1);
    }
};

run();
