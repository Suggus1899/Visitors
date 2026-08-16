import sequelize from '../database';

(async () => {
  try {
    await sequelize.authenticate();
    const [rows] = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'ActivityLogs' ORDER BY ordinal_position"
    );
    console.log('ActivityLogs columns:', (rows as any[]).map(r => r.column_name).join(', '));
    process.exit(0);
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }
})();
