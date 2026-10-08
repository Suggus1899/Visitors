import { Sequelize, QueryTypes } from 'sequelize';
import Encryption from '../utils/Encryption';
import config from '../config/AppConfig';

export async function up({ context }: { context: Sequelize }) {
    if (!/^[a-fA-F0-9]{64}$/.test(config.encryptionKey)) throw new Error('A valid encryption key is required to migrate edit history');
    await context.transaction(async transaction => {
        await context.query(`
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS email VARCHAR(254);
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE "Visitors" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMPTZ;
            ALTER TABLE "Visitors" ALTER COLUMN job_title TYPE TEXT;
            ALTER TABLE "VisitorEditHistories" ALTER COLUMN "visitId" DROP NOT NULL;
            UPDATE "VisitorEditHistories" SET "visitId" = NULL WHERE "visitId" = 0;
            DO $lifecycle$
            DECLARE timestamp_column RECORD;
            BEGIN
                FOR timestamp_column IN SELECT table_name, column_name FROM information_schema.columns
                    WHERE table_schema = current_schema() AND data_type = 'timestamp without time zone'
                    AND table_name IN ('Users', 'Visitors', 'Visits', 'IntermittentLogs', 'VisitorEditHistories', 'ActivityLogs', 'ArcoRequests') LOOP
                    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''',
                        timestamp_column.table_name, timestamp_column.column_name, timestamp_column.column_name);
                END LOOP;
            END $lifecycle$;
        `, { transaction });
        const duplicates = await context.query<{ visitor_cedula: string; ids: number[] }>(`
            SELECT visitor_cedula, array_agg(id ORDER BY id) AS ids FROM "Visits"
            WHERE status IN ('waiting', 'active', 'intermittent') AND check_out_time IS NULL
            GROUP BY visitor_cedula HAVING count(*) > 1`, { transaction, type: QueryTypes.SELECT });
        if (duplicates.length) throw new Error('Duplicate open visits; resolve these visit IDs before migrating: ' + duplicates.map(d => d.ids.join(',')).join('; '));
        await context.query(`CREATE UNIQUE INDEX IF NOT EXISTS visits_one_open_per_visitor ON "Visits" (visitor_cedula)
            WHERE status IN ('waiting', 'active', 'intermittent') AND check_out_time IS NULL`, { transaction });
        const rows = await context.query<{ id: number; field: string; oldValue: string | null; newValue: string | null }>(
            'SELECT id, field, "oldValue", "newValue" FROM "VisitorEditHistories"', { transaction, type: QueryTypes.SELECT });
        for (const row of rows) {
            const encrypt = (value: string | null) => value === null || Encryption.isEncrypted(value) ? value : Encryption.encrypt(value);
            const photo = /^(photo|id_photo|photoBase64|idPhotoBase64)/.test(row.field);
            await context.query('UPDATE "VisitorEditHistories" SET "oldValue" = :old, "newValue" = :new WHERE id = :id', {
                transaction, replacements: { id: row.id, old: photo ? null : encrypt(row.oldValue), new: photo ? null : encrypt(row.newValue) }
            });
        }
    });
}
