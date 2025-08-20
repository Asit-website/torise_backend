const axios = require('axios');

class ConversationSummarizer {
    constructor() {
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.backendApiUrl = process.env.BACKEND_API_URL || 'http://localhost:5000';
        console.log('ConversationSummarizer initialized with OpenAI API key:', !!this.openaiApiKey);
    }

    // Summarize conversation using OpenAI
    async summarizeConversation(messages) {
        try {
            if (!this.openaiApiKey) {
                console.error('OpenAI API key not found');
                return null;
            }

            console.log(`Summarizing conversation with ${messages.length} messages`);

            // Format messages for OpenAI
            const formattedMessages = messages.map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.message
            }));

            // Create conversation text
            const conversationText = formattedMessages
                .map(msg => `${msg.role}: ${msg.content}`)
                .join('\n');

            const prompt = `Please provide a concise summary of the following conversation between a user and a customer service agent. Focus on the main topics discussed, any issues raised, and the resolution provided. Keep the summary professional and informative.

Conversation:
${conversationText}

Summary:`;

            console.log('Sending request to OpenAI...');
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that summarizes customer service conversations professionally and concisely.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 300,
                temperature: 0.3
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 seconds timeout
            });

            const summary = response.data.choices[0].message.content.trim();
            console.log('✅ Conversation summarized successfully');
            return summary;

        } catch (error) {
            console.error('Error summarizing conversation:', error.message);
            if (error.response) {
                console.error('OpenAI API Error:', error.response.data);
            }
            return null;
        }
    }

    // Update conversation log with summary
    async updateConversationSummary(conversationId, summary) {
        try {
            // Extract the MongoDB ID from the conversation ID
            let mongoId = conversationId;
            if (conversationId.startsWith('conv_')) {
                mongoId = conversationId.replace('conv_', '');
            }
            
            console.log(`Updating summary for conversation ID: ${conversationId}, MongoDB ID: ${mongoId}`);
            
            const response = await axios.put(`${this.backendApiUrl}/api/conversations/${mongoId}/summary`, {
                summary: summary
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 seconds timeout
            });

            if (response.status === 200) {
                console.log(`✅ Conversation summary updated for ID: ${conversationId}`);
                return true;
            } else {
                console.error(`Failed to update conversation summary: ${response.status}`);
                return false;
            }

        } catch (error) {
            console.error('Error updating conversation summary:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            return false;
        }
    }

    // Main function to summarize and update conversation
    async processConversationSummary(conversationId, messages) {
        try {
            console.log(`Processing summary for conversation: ${conversationId}`);

            // Generate summary
            const summary = await this.summarizeConversation(messages);
            
            if (!summary) {
                console.error('Failed to generate summary');
                return false;
            }

            // Update conversation log
            const updated = await this.updateConversationSummary(conversationId, summary);
            
            if (updated) {
                console.log(`✅ Conversation ${conversationId} summarized and updated successfully`);
                return true;
            } else {
                console.error(`Failed to update conversation ${conversationId}`);
                return false;
            }

        } catch (error) {
            console.error('Error processing conversation summary:', error.message);
            return false;
        }
    }
}

module.exports = ConversationSummarizer;
