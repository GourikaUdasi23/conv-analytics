// Vercel serverless function for /api/chat
// Mirrors server/index.js: accepts POST { message }
// If GEMINI_API_KEY is present it will attempt to use @google/generative-ai,
// otherwise it returns a safe dev fallback echo reply.

export default async function handler(req, res) {
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
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey || '');
      const model = genAI.getGenerativeModel({ model: 'gemini-2' });
      const result = await model.generateContent(message);
      const text = result.response.text();
      return res.json({ text });
    } catch (err) {
      // If the Google client isn't available or fails, log and return an error
      console.error('Generative AI call failed', err);
      return res.status(500).json({ error: 'Failed to generate' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
