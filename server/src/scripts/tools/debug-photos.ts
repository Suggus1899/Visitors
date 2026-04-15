
import VisitorModel from '../models/Visitor';
import VisitModel from '../models/Visit';
import path from 'path';
import config from '../config/AppConfig';
import fs from 'fs';

const debugPhotos = async () => {
    try {
        console.log('--- Debugging Photos ---');
        console.log('Config DB Path:', config.dbPath);
        const photosDir = path.join(config.dbPath, 'photos');
        console.log('Photos Dir:', photosDir);
        
        if (fs.existsSync(photosDir)) {
            console.log('Photos directory exists.');
            const files = fs.readdirSync(photosDir);
            console.log(`Found ${files.length} files in photos directory.`);
            if (files.length > 0) {
                console.log('Last 3 files:', files.slice(-3));
            }
        } else {
            console.error('Photos directory DOES NOT EXIST!');
        }

        console.log('\n--- Checking Visitors ---');
        const visitors = await VisitorModel.findAll({
            limit: 5,
            order: [['createdAt', 'DESC']]
        });

        for (const v of visitors) {
            console.log(`Visitor: ${v.first_name} ${v.last_name} (${v.cedula})`);
            console.log(`  Photo URL in DB: ${v.photo_url}`);
            if (v.photo_url) {
                // Check if file exists
                // Expected: /data/photos/filename.jpg
                const filename = path.basename(v.photo_url);
                const fullPath = path.join(photosDir, filename);
                const exists = fs.existsSync(fullPath);
                console.log(`  File exists at ${fullPath}? ${exists}`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
};

debugPhotos();
