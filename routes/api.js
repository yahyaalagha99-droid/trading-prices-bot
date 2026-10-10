import express from 'express';
import fetch from 'node-fetch';
import multer from 'multer';

const router = express.Router();

/* ================= رفع الصور ================= */
const upload = multer({ dest: 'uploads/' });

/* ================= دردشة نصية ================= */
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
          {
            role: "system",
            content: `
You are MAi Bot.
Developer: Yahya.Kurdish.
Always call the user by the name: Yahya.Kurdish.
Support Kurdish Sorani and Kurmanji fully.
Support Arabic, English, German, Turkish, Persian, and all languages.
Always detect the user's language automatically and respond in the same language.
You can analyze images and voice if provided.
`
          },
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

/* ================= استقبال الصور ================= */
router.post('/api/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ reply: "⚠️ لم يتم استلام أي صورة" });
    }

    const imagePath = req.file.path;

    // هنا نضيف التحليل الحقيقي لاحقًا
    return res.json({
      reply: "📷 تم استلام الصورة — جاهز أضيف لك تحليلها إذا تريد"
    });

  } catch (err) {
    res.json({ reply: "⚠️ خطأ في معالجة الصورة: " + err.message });
  }
});

/* ================= استقبال الصوت ================= */
router.post('/api/voice', async (req, res) => {
  try {
    return res.json({
      reply: "🎤 تم استلام الصوت — جاهز أضيف لك التحويل إلى نص"
    });
  } catch (err) {
    res.json({ reply: "⚠️ خطأ في الصوت: " + err.message });
  }
});

export default router;
