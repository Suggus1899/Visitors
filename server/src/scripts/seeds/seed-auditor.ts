import sequelize from '../database';
import User from '../models/User';
import { JwtAuthService } from '../infrastructure/services/JwtAuthService';
import ActivityLog from '../models/ActivityLog';

/**
 * Script to seed the Auditor user
 * Usage: npx ts-node server/src/scripts/seed-auditor.ts
 */
const seedAuditor = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    await sequelize.sync(); // Ensure tables exist

    const authService = new JwtAuthService();
    const hashedPassword = await authService.hashPassword('audit2026');

    const [user, created] = await User.findOrCreate({
      where: { username: 'auditor' },
      defaults: {
        username: 'auditor',
        password: hashedPassword,
        role: 'auditor'
      }
    });

    if (created) {
      console.log('✅ Auditor user created successfully.');
      console.log('Username: auditor');
      console.log('Password: audit2026');

      // Log creation
      await ActivityLog.create({
        userId: user.id || 0,
        username: 'system',
        action: 'CREATE',
        entity: 'User',
        entityId: user.username,
        details: 'Auditor user seeded via script',
        ipAddress: '127.0.0.1'
      });
    } else {
      console.log('ℹ️ Auditor user already exists.');
      
      // Update role/password if needed (optional, ensuring it's correct)
      user.role = 'auditor';
      user.password = hashedPassword;
      await user.save();
      console.log('✅ Auditor user updated to ensure correct credentials/role.');
    }

  } catch (error) {
    console.error('❌ Error seeding auditor:', error);
  } finally {
    await sequelize.close();
  }
};

seedAuditor();
