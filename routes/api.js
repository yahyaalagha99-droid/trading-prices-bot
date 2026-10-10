import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

router.post('/api/chat', async (req, res) => {
  try {
    const userMessage = req.body.message || "";

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.json({ reply: "⚠️ API key غير موجود داخل السيرفر" });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://trading-prices-bot.onrender.com",
        "X-Title": "MAi Bot"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct",
        messages: [
          { role: "system", content: "You are MAi Bot. Developer: Yahya.Kurdish" },
          { role: "user", content: userMessage }
        ]
      })
    });

    const data = await response.json();

    if (!data.choices) {
      return res.json({ reply: "⚠️ خطأ من النموذج", details: data });
    }

    res.json({ reply: data.choices[0].message.content });

  } catch (err) {
    res.json({ reply: "⚠️ خطأ داخل السيرفر: " + err.message });
  }
});

export default router;
