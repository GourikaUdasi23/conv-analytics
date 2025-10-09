import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

const apiKey = process.env.GEMINI_API_KEY;
const hasApiKey = Boolean(apiKey);
if (!hasApiKey) {
  console.warn('GEMINI_API_KEY not set — running in local fallback mode (returns echo responses).');
}
const genAI = hasApiKey ? new GoogleGenerativeAI(apiKey || '') : null;

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!hasApiKey || !genAI) {
      // Development fallback: echo the message with a small canned reply
      const reply = `Dev bot: I heard "${message}". (Set GEMINI_API_KEY to enable real AI responses)`;
      return res.json({ text: reply });
    }
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(message);
    const text = result.response.text();
    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));


