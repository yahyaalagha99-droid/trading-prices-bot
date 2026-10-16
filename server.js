import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.post('/ask/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  res.write(`data: ${JSON.stringify({ token: "أهلاً بك! السيرفر يعمل وجاهز للرد." })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
