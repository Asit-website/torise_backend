const axios = require('axios');

async function testConversationSave() {
  try {
    console.log('🚀 Testing conversation save to ConversationLog table...\n');
    
    // Test data
    const testData = {
      call_sid: "CA_TEST_" + Date.now(),
      summary: {
        from: "+1234567890",
        to: "+0987654321", 
        duration: 180,
        answered: true,
        direction: "inbound",
        attempted_at: new Date(),
        answered_at: new Date(),
        terminated_at: new Date(Date.now() + 180000)
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

    console.log('📤 Sending data to backend...');
    console.log('Data:', JSON.stringify(testData, null, 2));
    
    const response = await axios.post('http://localhost:5000/api/conversations/save', testData);
    console.log('✅ Response:', response.data);

    console.log('\n📊 Checking if data was saved...');
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
    }

    console.log('\n🎉 SUCCESS! Data saved to ConversationLog table!');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. Backend is running on port 5000');
    console.log('   2. MongoDB is connected');
    console.log('   3. ConversationLog model exists');
  }
}

testConversationSave(); 