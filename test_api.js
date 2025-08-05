const axios = require('axios');

async function testAPI() {
  try {
    console.log('Testing health endpoint...');
    const healthResponse = await axios.get('http://localhost:5000/api/health');
    console.log('Health check:', healthResponse.data);

    console.log('\nTesting reports endpoint...');
    const reportsResponse = await axios.get('http://localhost:5000/api/reports');
    console.log('Reports response:', reportsResponse.data);

    console.log('\nTesting POST to reports/entry...');
    const postData = {
      call_sid: "test_call_123",
      conversation_id: "test_conv_123",
      summary: {
        from: "+1234567890",
        to: "+0987654321",
        duration: 120,
        answered: true,
        direction: "inbound"
      }
    };
    
    const postResponse = await axios.post('http://localhost:5000/api/reports/entry', postData);
    console.log('POST response:', postResponse.data);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testAPI(); 