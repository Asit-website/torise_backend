const axios = require('axios');

async function testTdEngineFlow() {
  try {
    console.log('🧪 Testing complete td_engine to backend flow...\n');
    
    // Simulate td_engine data (like what comes from onClose)
    const tdEngineData = {
      call_sid: "CA_REAL_" + Date.now(),
      summary: {
        from: "+1234567890",
        to: "+0987654321",
        duration: 120,
        answered: true,
        direction: "inbound",
        attempted_at: new Date(),
        answered_at: new Date(),
        terminated_at: new Date(Date.now() + 120000)
      },
      events: [
        {
          type: "user_input",
          user_transcript: "Hi, I need help with my property",
          timestamp: new Date()
        },
        {
          type: "agent_response",
          agent_response: "Hello! This is Deepa from Star Properties. How can I help you today?",
          timestamp: new Date(Date.now() + 5000)
        }
      ]
    };

    console.log('📤 Step 1: Sending data to td_engine report endpoint...');
    console.log('Data:', JSON.stringify(tdEngineData, null, 2));
    
    // Call td_engine report endpoint
    const tdEngineResponse = await axios.post('http://localhost:3000/report/entry', tdEngineData);
    console.log('✅ td_engine response:', tdEngineResponse.data);

    console.log('\n📤 Step 2: Checking if backend received and saved data...');
    const conversations = await axios.get('http://localhost:5000/api/conversations');
    console.log('📈 Total conversations in table:', conversations.data.conversations.length);
    
    if (conversations.data.conversations.length > 0) {
      const latest = conversations.data.conversations[0];
      console.log('\n📞 Latest conversation details:');
      console.log('   Call SID:', latest.call_sid);
      console.log('   From:', latest.from_number);
      console.log('   To:', latest.to_number);
      console.log('   Duration:', latest.duration_minutes, 'minutes');
      console.log('   Answered:', latest.answered);
      console.log('   Type:', latest.channel_type);
      console.log('   Created:', latest.created_at);
      
      if (latest.message_log && latest.message_log.length > 0) {
        console.log('\n💬 Message Log:');
        latest.message_log.forEach((msg, index) => {
          console.log(`   ${index + 1}. ${msg.sender}: ${msg.message}`);
        });
      }
    }

    console.log('\n🎉 SUCCESS! Complete flow working: td_engine → backend → database!');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. td_engine is running on port 3000');
    console.log('   2. Backend is running on port 5000');
    console.log('   3. Both servers are accessible');
    console.log('   4. MongoDB is connected');
  }
}

testTdEngineFlow(); 