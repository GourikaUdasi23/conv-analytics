// Vercel serverless function for /api/chat
// Mirrors server/index.js: accepts POST { message }
// If GEMINI_API_KEY is present it will attempt to use @google/generative-ai,
// otherwise it returns a safe dev fallback echo reply.

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const hasApiKey = Boolean(apiKey);
    if (!hasApiKey) {
      const reply = `Dev bot: I heard "${message}". (Set GEMINI_API_KEY in your Vercel project settings to enable real AI responses)`;
      return res.json({ text: reply });
    }

    // Dynamically import the GoogleGenerativeAI client only when the key exists.
    try {
      // Use dynamic import to support ESM-only SDKs even from CommonJS
  const mod = await import('@google/generative-ai');
  const GoogleGenerativeAI = mod.GoogleGenerativeAI || (mod.default && mod.default.GoogleGenerativeAI) || mod.default || null;
      if (!GoogleGenerativeAI) {
        console.error('GoogleGenerativeAI export not found on module', Object.keys(mod || {}));
        return res.status(500).json({ error: 'Generative AI client not available' });
      }
      const genAI = new GoogleGenerativeAI(apiKey || '');
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(message);
      const text = result.response.text();
      return res.json({ text });
    } catch (err) {
      console.error('Generative AI call failed', err && (err.stack || err.message || err));
      // provide a small diagnostic to the response (keep it safe)
      return res.status(500).json({ error: 'Failed to generate (see function logs for details)' });
    }
  } catch (err) {
    console.error('Unhandled function error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: 'Server error' });
  }
};
