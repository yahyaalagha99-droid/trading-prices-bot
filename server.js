import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ================= الإعدادات ================= */
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PROD = NODE_ENV === 'production';

const CORS_ORIGINS = String(process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();

// مهم على Render (بروكسي)
app.set('trust proxy', 1);

/* ================= CORS ================= */
app.use(
  cors(
    CORS_ORIGINS.length
      ? { origin: CORS_ORIGINS, credentials: true }
      : { origin: true }
  )
);

/* ================= الأمان ================= */
app.use(helmet({ contentSecurityPolicy: false }));

/* ================= compression (لا يكبس الستريم) ================= */
app.use(
  compression({
    filter: (req, res) => {
      const ct = String(res.getHeader('Content-Type') || '');
      if (ct.includes('text/event-stream')) return false;
      return compression.filter(req, res);
    },
  })
);

app.use(morgan(IS_PROD ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));

/* ================= rate limit ================= */
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});
app.use(limiter);

/* ================= الواجهة (Frontend) ================= */
app.use(express.static(path.join(__dirname, 'Frontend')));

/* ================= الراوتات: /ask و /ask/stream ================= */
app.use('/', apiRoutes);

app.get('/health', (_req, res) => res.json({ ok: true, env: NODE_ENV }));

/* ================= 404 ================= */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* ================= error handler ================= */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

/* ================= تشغيل ================= */
app.listen(PORT, () => {
  console.log(`MAi Bot running on port ${PORT} - ${NODE_ENV} 🚀`);
});
