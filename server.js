import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

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
app.use(express.static(__dirname));

/* ================= مسار الشات المؤقت للاختبار ================= */
app.post('/ask/stream', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // رد تجريبي مؤقت للتأكد من أن الاتصال ينجح وتصل الرسالة
    res.write(`data: ${JSON.stringify({ token: "أهلاً بك! السيرفر يعمل بنجاح، جارٍ ربط الذكاء الاصطناعي..." })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, env: NODE_ENV }));

/* ================= 404 ================= */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* ================= تشغيل ================= */
app.listen(PORT, () => {
  console.log(`MAi Bot running on port ${PORT} - ${NODE_ENV} 🚀`);
});
