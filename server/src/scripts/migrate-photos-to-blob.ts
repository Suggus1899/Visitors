import fs from 'fs';
import path from 'path';
import sequelize from '../database';
import VisitorModel from '../models/Visitor';

async function migratePhotosToBlob() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connected');

    const visitors = await VisitorModel.findAll({
      attributes: ['cedula', 'photo_url', 'id_photo_url', 'photo_data', 'id_photo_data']
    });

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const visitor of visitors) {
      const updates: Partial<{ photo_data: Buffer | null; id_photo_data: Buffer | null }> = {};

      if (visitor.photo_url && !visitor.photo_data) {
        const filePath = visitor.photo_url.startsWith('/data/photos/')
          ? path.join(__dirname, '../../../data/photos', path.basename(visitor.photo_url))
          : visitor.photo_url;

        if (fs.existsSync(filePath)) {
          updates.photo_data = fs.readFileSync(filePath);
          console.log(`  ✓ Migrated photo for ${visitor.cedula.substring(0, 8)}...`);
        } else {
          console.warn(`  ⚠ Photo file not found: ${filePath}`);
          errors++;
        }
      }

      if (visitor.id_photo_url && !visitor.id_photo_data) {
        const filePath = visitor.id_photo_url.startsWith('/data/photos/')
          ? path.join(__dirname, '../../../data/photos', path.basename(visitor.id_photo_url))
          : visitor.id_photo_url;

        if (fs.existsSync(filePath)) {
          updates.id_photo_data = fs.readFileSync(filePath);
          console.log(`  ✓ Migrated ID photo for ${visitor.cedula.substring(0, 8)}...`);
        } else {
          console.warn(`  ⚠ ID photo file not found: ${filePath}`);
          errors++;
        }
      }

      if (Object.keys(updates).length > 0) {
        await visitor.update(updates);
        migrated++;
      } else {
        skipped++;
      }
    }

    console.log(`\n✓ Migration complete:`);
    console.log(`  Migrated: ${migrated} visitors`);
    console.log(`  Skipped (already has blob or no url): ${skipped}`);
    console.log(`  Errors (file not found): ${errors}`);
    console.log('\nNote: Original photo_url fields are kept for backward compatibility.');
    console.log('Run a separate cleanup to remove them after verifying BLOBs are correct.');

    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

migratePhotosToBlob();
