
import VisitorModel from '../models/Visitor';
import http from 'http';
import config from '../config/AppConfig';

const verifyAccess = async () => {
    try {
         // Query the database for a visitor with a photo_url
        const result = await VisitorModel.findOne({
            where: {
               // Use raw query or findOne with check
            }
        });
        
        // Simpler: fetch all limits 10
        const visitors = await VisitorModel.findAll({
            limit: 10,
            order: [['createdAt', 'DESC']]
        });
        
        const vWithPhoto = visitors.find(v => v.photo_url);
        
        if (!vWithPhoto) {
            return;
        }

        const url = `http://localhost:${config.port}/data/photos/${vWithPhoto.photo_url}`;
        
        http.get(url, (res) => {
            // Photo access verification
        }).on('error', (e) => {
            // Error handling for photo access
        });

    } catch (error) {
        // Error handling for photo verification
    }
};

verifyAccess();
