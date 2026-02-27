
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
            console.log('No visitor with photo found.');
            return;
        }

        console.log(`Testing visitor: ${vWithPhoto.first_name || ''} ${vWithPhoto.last_name || ''}`);
        console.log(`Photo URL in DB: ${vWithPhoto.photo_url}`);
        
        const url = `http://127.0.0.1:${config.port}${vWithPhoto.photo_url}`;
        console.log(`Fetching: ${url}`);
        
        http.get(url, (res) => {
            console.log(`Response Status: ${res.statusCode}`);
            console.log(`Content-Type: ${res.headers['content-type']}`);
            if (res.statusCode === 200) {
                console.log('Success!');
            } else {
                console.log('Failed!');
            }
        }).on('error', (e) => {
            console.error(`Got error: ${e.message}`);
        });

    } catch (error) {
        console.error('Error:', error);
    }
};

verifyAccess();
