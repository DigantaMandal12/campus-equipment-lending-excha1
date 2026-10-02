const { getAssistantResponse } = require('../services/aiService');

exports.getChat = (req, res) => {
  const hasKey = Boolean(process.env.OPENROUTER_API_KEY || req.session?.openRouterApiKey);
  res.render('chat', {
    title: 'AI Equipment Assistant',
    assistantName: process.env.AI_ASSISTANT_NAME || 'Campus Lending Assistant',
    isOpenRouterConfigured: hasKey,
    openRouterModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'
  });
};

exports.postChat = async (req, res) => {
  try {
    const { message, apiKey } = req.body;
    
    // Allow setting API key dynamically via chat request or session
    if (apiKey && apiKey.trim()) {
      req.session.openRouterApiKey = apiKey.trim();
      process.env.OPENROUTER_API_KEY = apiKey.trim();
    }

    const activeKey = (apiKey && apiKey.trim()) || req.session?.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    const response = await getAssistantResponse(message, req.session?.user, activeKey);

    return res.json({
      success: true,
      ...response
    });
  } catch (err) {
    console.error('[CHAT ERROR]', err);
    return res.status(500).json({
      success: false,
      reply: 'I ran into a temporary issue. Please ask again in a moment.'
    });
  }
};

// Endpoint to dynamically save/activate OpenRouter API key
exports.postSaveApiKey = (req, res) => {
  try {
    const { apiKey, model } = req.body;
    if (apiKey && apiKey.trim()) {
      req.session.openRouterApiKey = apiKey.trim();
      process.env.OPENROUTER_API_KEY = apiKey.trim();
      if (model && model.trim()) {
        process.env.OPENROUTER_MODEL = model.trim();
      }
      return res.json({ 
        success: true, 
        message: 'OpenRouter API Key activated successfully for live AI responses!' 
      });
    }
    return res.status(400).json({ success: false, message: 'Please provide a valid OpenRouter API Key.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
