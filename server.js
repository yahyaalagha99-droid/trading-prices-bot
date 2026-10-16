import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// قراءة ملفات الواجهة سواء كانت في المجلد الرئيسي أو داخل مجلد Frontend
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'Frontend')));

// مسار رئيسي يعرض الواجهة index.html تلقائياً
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'Frontend', 'index.html'));
    }
  });
});

// مسار الشات للرد التدفق
app.post('/ask/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.write(`data: ${JSON.stringify({ token: "أهلاً بك! السيرفر يعمل بنجاح والواجهة متصلة بالكامل." })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
