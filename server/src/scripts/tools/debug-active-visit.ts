import sequelize from '../database';
import Visit from '../models/Visit';
import Visitor from '../models/Visitor';

const debugActiveVisit = async () => {
    try {
        console.log('🔍 Depurando visita activa...\n');

        const activeVisit = await Visit.findOne({
            where: { status: 'active' },
            include: [{ model: Visitor }]
        });

        if (!activeVisit) {
            console.log('No hay visitas activas');
            process.exit(0);
        }

        console.log('Visita activa encontrada:');
        console.log(`ID: ${activeVisit.id}`);
        console.log(`Cédula visitante: ${activeVisit.visitor_cedula}`);
        console.log(`Status: ${activeVisit.status}`);
        console.log('');

        if (activeVisit.Visitor) {
            const decrypted = activeVisit.Visitor.getDecrypted();
            console.log('Datos del visitante (decrypted):');
            console.log(`Cédula: ${decrypted.cedula}`);
            console.log(`Nombre: ${decrypted.first_name} ${decrypted.last_name}`);
            console.log(`Empresa: ${decrypted.company}`);
            console.log(`Email: "${decrypted.email}"`);
            console.log(`Email type: ${typeof decrypted.email}`);
            console.log(`Email is null: ${decrypted.email === null}`);
            console.log(`Email is undefined: ${decrypted.email === undefined}`);
            console.log(`Email length: ${decrypted.email?.length || 0}`);

            // Try to create Visitor entity
            try {
                const { Visitor: VisitorEntity } = await import('../domain/entities/Visitor.entity');
                const visitorEntity = new VisitorEntity(
                    decrypted.cedula,
                    decrypted.first_name,
                    decrypted.last_name,
                    decrypted.company,
                    decrypted.job_title || undefined,
                    decrypted.photo_url || undefined,
                    undefined, // idPhotoUrl
                    decrypted.email || undefined,
                    decrypted.phone || undefined
                );
                console.log('\n✅ Entidad Visitor creada exitosamente');
            } catch (error) {
                console.log('\n❌ Error creando entidad Visitor:', error);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

debugActiveVisit();
