import sequelize from '../database';
import VisitorModel from '../models/Visitor';
import VisitModel from '../models/Visit';
import Encryption from '../utils/Encryption';
import { QueryTypes } from 'sequelize';

const migrate = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // Get all raw visitors (plain text)
        const visitors = await sequelize.query("SELECT * FROM Visitors", { type: QueryTypes.SELECT });
        console.log(`Found ${visitors.length} visitors to migrate.`);

        // Add encrypted_cedula column if not exists
        try {
            await sequelize.getQueryInterface().addColumn('Visitors', 'encrypted_cedula', {
               type: 'TEXT',
               allowNull: true
            });
             console.log('Added encrypted_cedula column.');
        } catch (e: any) {
             // Ignore if duplicate column error
             if (e.message && e.message.includes('duplicate column')) {
                 console.log('Column encrypted_cedula already exists.');
             } else {
                 console.log('Adding column failed (might exist):', e.message);
             }
        }

        let successCount = 0;
        let errorCount = 0;

        // Strategy: Insert New (Hash) -> Update FKs -> Delete Old
        // This avoids Foreign Key violation without disabling checks (which is connection-specific)

        for (const v of visitors as any[]) {
            const oldCedula = v.cedula;
            // Skip if already hashed (len 64 hex)
            if (oldCedula.length === 64 && /^[0-9a-fA-F]+$/.test(oldCedula)) {
                // Check if we need to clean up old unhashed duplicates? 
                // Unlikely in this logic flow unless interrupted.
                continue;
            }

            const newHash = Encryption.hash(oldCedula);
            const newEncrypted = Encryption.encrypt(oldCedula);
            const firstName = v.first_name && !Encryption.isEncrypted(v.first_name) ? Encryption.encrypt(v.first_name) : v.first_name;
            const lastName = v.last_name && !Encryption.isEncrypted(v.last_name) ? Encryption.encrypt(v.last_name) : v.last_name;
            const email = v.email && !Encryption.isEncrypted(v.email) ? Encryption.encrypt(v.email) : v.email;
            const phone = v.phone && !Encryption.isEncrypted(v.phone) ? Encryption.encrypt(v.phone) : v.phone;

            const t = await sequelize.transaction();

            try {
                // 1. Check if New Hash Visitor already exists (Partial migration)
                const [existing] = await sequelize.query("SELECT cedula FROM Visitors WHERE cedula = :newHash", { 
                    replacements: { newHash }, 
                    type: QueryTypes.SELECT,
                    transaction: t
                });

                if (!existing) {
                    // 2. Insert New Visitor Record
                    await sequelize.query(
                        `INSERT INTO Visitors (cedula, encrypted_cedula, first_name, last_name, company, job_title, photo_url, email, phone, createdAt, updatedAt)
                         VALUES (:newHash, :newEncrypted, :firstName, :lastName, :company, :jobTitle, :photoUrl, :email, :phone, :createdAt, :updatedAt)`,
                        {
                            replacements: {
                                newHash, newEncrypted, firstName, lastName, 
                                company: v.company, jobTitle: v.job_title, photoUrl: v.photo_url, 
                                email, phone, createdAt: v.createdAt, updatedAt: v.updatedAt
                            },
                            transaction: t
                        }
                    );
                }

                // 3. Update Visits to point to New Hash
                await sequelize.query(
                    "UPDATE Visits SET visitor_cedula = :newHash WHERE visitor_cedula = :oldCedula",
                    { replacements: { newHash, oldCedula }, transaction: t }
                );

                // 4. Delete Old Visitor Record (Now orphans, safe to delete)
                await sequelize.query(
                    "DELETE FROM Visitors WHERE cedula = :oldCedula",
                    { replacements: { oldCedula }, transaction: t }
                );

                await t.commit();
                successCount++;
                if (successCount % 10 === 0) console.log(`Migrated ${successCount}/${visitors.length}`);
            } catch (err) {
                await t.rollback();
                console.error(`Failed to migrate ${oldCedula}:`, err);
                errorCount++;
            }
        }

        console.log(`Migration Complete. Success: ${successCount}, Errors: ${errorCount}`);
        process.exit(0);
    } catch (error) {
        console.error('Migration Fatal Error:', error);
        process.exit(1);
    }
};

migrate();
