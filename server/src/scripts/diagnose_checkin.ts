
import axios from 'axios';

async function diagnose() {
  try {
    // 1. Login to get token
    console.log('Logging in...');
    const loginRes = await axios.post('http://localhost:3000/api/v1/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    // Handle new response structure { success: true, data: { token, ... } }
    const token = loginRes.data.data ? loginRes.data.data.token : loginRes.data.token;
    console.log('Got token:', token ? 'Yes' : 'No');

    if (!token) {
        console.error('Failed to get token', loginRes.data);
        return;
    }

    // 2. CheckIn payload
    const payload = {
      visitorCedula: "99999999",
      visitorData: {
        firstName: "Diagnose",
        lastName: "User",
        company: "Debug Inc",
        jobTitle: "Tester",
        email: "debug@test.com",
        phone: "+584120000000",
        photoBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
      },
      purpose: "Diagnosis",
      personToVisit: "Recepcion",
      notes: "Diagnosis test"
    };

    console.log('Sending payload to checkin...');
    const res = await axios.post('http://localhost:3000/api/v1/visits/checkin', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Success:', res.data);

  } catch (error: any) {
    if (error.response) {
      console.log('Error Status:', error.response.status);
      console.log('Error Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
  }
}

diagnose();
