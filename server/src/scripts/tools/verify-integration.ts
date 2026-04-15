
import axios from 'axios';

const API_URL = 'http://localhost:3000/api/v1';
const FRONTEND_URL = 'http://localhost:4173';

const log = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    const icons = { info: 'ℹ️', success: '✅', error: '❌' };
    console.log(`${icons[type]} ${msg}`);
};

const runTests = async () => {
    console.log('\n🚀 Starting Integration Tests...\n');
    let token = '';

    // 1. Test Frontend Availability
    try {
        await axios.get(FRONTEND_URL);
        log(`Frontend is reachable at ${FRONTEND_URL}`, 'success');
    } catch (error) {
        log(`Frontend is unreachable at ${FRONTEND_URL}`, 'error');
        process.exit(1);
    }

    // 2. Test Login
    try {
        const res = await axios.post(`${API_URL}/auth/login`, {
            username: 'Admin@trebol.com',
            password: 'Trebol123*' // Default seed credential
        });
        
        if (res.data?.success && res.data?.data?.token) {
            token = res.data.data.token;
            log(`Login successful. User: ${res.data.data.user.username}`, 'success');
        } else {
            throw new Error('Invalid login response');
        }
    } catch (error: any) {
        log(`Login failed: ${error.response?.data?.message || error.message}`, 'error');
        process.exit(1);
    }

    const headers = { Authorization: `Bearer ${token}` };

    // 3. Test Dashboard Stats
    try {
        const res = await axios.get(`${API_URL}/reports/stats`, { headers });
        if (res.data?.success) {
            log(`Fetched Stats: ${JSON.stringify(res.data.data.summary)}`, 'success');
        }
    } catch (error: any) {
        log(`Failed to fetch stats: ${error.message}`, 'error');
    }

    // 4. Test Visits List (Pagination)
    try {
        const res = await axios.get(`${API_URL}/visits?page=1&limit=5`, { headers });
        if (res.data?.success) {
            const count = res.data.data.visits.length;
            const total = res.data.meta?.total || res.data.data.total;
            log(`Fetched Visits: Got ${count} items. Total in DB: ${total}`, 'success');
            
            if (count > 0) {
                const sample = res.data.data.visits[0];
                // Check if visitor data is present (Clean Architecture includes it as flat fields)
                if (sample.visitorName) {
                    log(`Visitor data populated correctly: ${sample.visitorName} (${sample.visitorCompany})`, 'success');
                } else {
                    log('Visitor data missing in visit record', 'error');
                }
            }
        }
    } catch (error: any) {
        log(`Failed to fetch visits: ${error.message}`, 'error');
    }

    // 5. Test Backups List
    try {
        const res = await axios.get(`${API_URL}/backups`, { headers });
        if (res.data?.success) {
            log(`Fetched Backups: ${res.data.data.length} backups found.`, 'success');
        }
    } catch (error: any) {
        log(`Failed to fetch backups: ${error.message}`, 'error');
    }

    console.log('\n✨ Tests Completed.');
};

runTests();
