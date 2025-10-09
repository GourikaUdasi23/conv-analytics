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

    // NOTE: For demo convenience we allow public requests but enforce a lightweight
    // per-IP rate limiter to reduce risk of abuse. The GEMINI API key remains
    // only in environment variables on the server and is never exposed to clients.
    const apiKey = process.env.GEMINI_API_KEY;
    const hasApiKey = Boolean(apiKey);
    if (!hasApiKey) {
      const reply = `Dev bot: I heard "${message}". (Set GEMINI_API_KEY in your Vercel project settings to enable real AI responses)`;
      return res.json({ text: reply });
    }

    // Simple in-memory per-IP rate limiter (per function instance). This is not
    // perfect for serverless (each instance has its own memory) but provides a
    // basic guard during demos. For production use a shared store (Redis).
    const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown').toString();
    if (!global._chatRateLimiter) global._chatRateLimiter = new Map();
    const rl = global._chatRateLimiter;
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // 10 minutes
    const maxRequests = 60; // max requests per IP per window
    const entry = rl.get(ip) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }
    entry.count += 1;
    rl.set(ip, entry);
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    // Dynamically import the GoogleGenerativeAI client only when the key exists.
    try {
      // Use dynamic import to support ESM-only SDKs even from CommonJS
  // Initialize Firebase Admin dynamically using service account JSON stored in env var
  let admin = null;
  try {
    admin = await import('firebase-admin');
  } catch (e) {
    // not a fatal error, we'll only require admin if token verification is used
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT || null;
  if (serviceAccountJson && admin) {
    try {
      const sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
      if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
    } catch (e) {
      console.error('Failed to initialize firebase-admin', e && (e.message || e));
    }
  }

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
      // Fallback to a safe dev reply so chat remains functional while debugging.
      const reply = `Dev bot (fallback): I heard "${message}". (AI service error; check function logs)`;
      return res.json({ text: reply });
    }
  } catch (err) {
    console.error('Unhandled function error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: 'Server error' });
  }
};
