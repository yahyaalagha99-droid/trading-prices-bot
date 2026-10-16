import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; // تأكد من توفرها أو استخدام fetch المدمج في Node

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ================= الإعدادات ================= */
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PROD = NODE_ENV === 'production';

const app = express();

app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan(IS_PROD ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));

app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));

/* ================= الواجهة (Frontend) ================= */
// إذا كانت الملفات في الجذر مباشرة، استخدم __dirname
app.use(express.static(__dirname));

/* ================= مسار الشات (Streaming API) ================= */
app.post('/ask/stream', async (req, res) => {
  try {
    const { messages } = req.body;
    
    // استدعاء واجهة الذكاء الاصطناعي (مثلاً OpenAI أو Gemini أو أي مزود تستخدمه)
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: messages,
        stream: true
      })
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "خطأ من مزود الذكاء الاصطناعي" });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    response.body.on('data', (chunk) => {
      res.write(chunk);
    });

    response.body.on('end', () => {
      res.write("data: [DONE]\n\n");
      res.end();
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, env: NODE_ENV }));

/* ================= 404 ================= */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* ================= تشغيل ================= */
app.listen(PORT, () => {
  console.log(`MAi Bot running on port ${PORT} - ${NODE_ENV} 🚀`);
});
