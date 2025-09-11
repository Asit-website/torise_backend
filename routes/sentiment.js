const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Fallback sentiment analysis function
const fallbackSentimentAnalysis = (messages) => {
  return messages.map((msg, index) => {
    const content = (msg.content || msg.message || '').toLowerCase();
    let sentiment = 0;
    let emotion = 'neutral';
    let confidence = 0.6;

    // Simple keyword-based analysis
    const positiveWords = ['good', 'great', 'excellent', 'happy', 'thanks', 'thank you', 'yes', 'ok', 'sure', 'perfect', 'love', 'like'];
    const negativeWords = ['bad', 'terrible', 'hate', 'no', 'problem', 'error', 'wrong', 'angry', 'frustrated', 'sad', 'disappointed'];
    
    const positiveCount = positiveWords.filter(word => content.includes(word)).length;
    const negativeCount = negativeWords.filter(word => content.includes(word)).length;
    
    if (positiveCount > negativeCount) {
      sentiment = Math.min(0.8, positiveCount * 0.2);
      emotion = 'happy';
    } else if (negativeCount > positiveCount) {
      sentiment = Math.max(-0.8, -negativeCount * 0.2);
      emotion = 'frustrated';
    } else {
      sentiment = 0;
      emotion = 'neutral';
    }

    return {
      index: index + 1,
      sentiment: Math.round(sentiment * 100) / 100,
      confidence: confidence,
      emotion: emotion,
      reasoning: `Based on keyword analysis: ${positiveCount} positive, ${negativeCount} negative`,
      timestamp: msg.timestamp || new Date().toISOString(),
      content: msg.content || msg.message || '',
      sender: msg.sender || 'unknown'
    };
  });
};

// Sentiment analysis endpoint
router.post('/analyze', async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Messages array is required and must not be empty' 
      });
    }

    // Force fallback analysis for now to ensure it works
    console.log('Using fallback analysis for all requests');
    const fallbackResults = fallbackSentimentAnalysis(messages);
    return res.json({
      success: true,
      data: fallbackResults,
      totalMessages: messages.length,
      method: 'fallback',
      warning: 'Using fast fallback analysis'
    });

    // If too many messages, use fallback for speed
    if (messages.length > 20) {
      console.log('Using fallback analysis for large conversation');
      const fallbackResults = fallbackSentimentAnalysis(messages);
      return res.json({
        success: true,
        data: fallbackResults,
        totalMessages: messages.length,
        method: 'fallback'
      });
    }

    // Prepare messages for analysis
    const conversationText = messages.map((msg, index) => {
      const sender = msg.sender === 'user' ? 'User' : 'Assistant';
      const content = msg.content || msg.message || '';
      return `${sender}: ${content}`;
    }).join('\n');

    // Call OpenAI API with timeout wrapper
    const analyzeWithTimeout = () => {
      return Promise.race([
        openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `Analyze sentiment of each message. Return JSON array with:
- sentiment: number -1 to 1 (negative to positive)
- emotion: string (happy, sad, angry, neutral, frustrated, excited, confused)
- confidence: number 0 to 1

Keep responses concise.`
            },
            {
              role: "user",
              content: `Analyze sentiment:\n${conversationText}`
            }
          ],
          temperature: 0.1,
          max_tokens: 1000
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Analysis timeout')), 8000)
        )
      ]);
    };

    const completion = await analyzeWithTimeout();

    const response = completion.choices[0].message.content;
    
    // Parse the JSON response
    let sentimentResults;
    try {
      sentimentResults = JSON.parse(response);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', response);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to parse sentiment analysis response' 
      });
    }

    // Validate and format the response
    if (!Array.isArray(sentimentResults) || sentimentResults.length !== messages.length) {
      console.error('Invalid response format:', {
        isArray: Array.isArray(sentimentResults),
        resultLength: sentimentResults?.length,
        expectedLength: messages.length,
        response: sentimentResults
      });
      return res.status(500).json({ 
        success: false, 
        error: 'Invalid sentiment analysis response format' 
      });
    }

    // Format the response to match frontend expectations
    const formattedResults = sentimentResults.map((result, index) => ({
      index: index + 1,
      sentiment: typeof result.sentiment === 'number' ? result.sentiment : 0,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      emotion: result.emotion || 'neutral',
      reasoning: result.reasoning || 'No reasoning provided',
      timestamp: messages[index].timestamp || new Date().toISOString(),
      content: messages[index].content || messages[index].message || '',
      sender: messages[index].sender || 'unknown'
    }));

    res.json({
      success: true,
      data: formattedResults,
      totalMessages: messages.length
    });

  } catch (error) {
    console.error('Sentiment analysis error:', error);
    
    // Handle specific OpenAI errors
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({ 
        success: false, 
        error: 'OpenAI API quota exceeded. Please check your billing.' 
      });
    }
    
    if (error.code === 'invalid_api_key') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid OpenAI API key. Please check your configuration.' 
      });
    }

    if (error.code === 'timeout' || error.message.includes('timeout')) {
      return res.status(408).json({ 
        success: false, 
        error: 'Analysis timed out. Please try again with fewer messages.' 
      });
    }

    if (error.code === 'rate_limit_exceeded') {
      return res.status(429).json({ 
        success: false, 
        error: 'Rate limit exceeded. Please wait a moment and try again.' 
      });
    }

    // If OpenAI fails, use fallback analysis
    console.log('OpenAI failed, using fallback analysis:', error.message);
    const fallbackResults = fallbackSentimentAnalysis(messages);
    return res.json({
      success: true,
      data: fallbackResults,
      totalMessages: messages.length,
      method: 'fallback',
      warning: 'Using fallback analysis due to OpenAI service issues'
    });
  }
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    // Test OpenAI connection with a simple request
    await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 5
    });
    
    res.json({ 
      success: true, 
      message: 'OpenAI sentiment analysis service is healthy',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'OpenAI service is not available',
      details: error.message
    });
  }
});

module.exports = router;
