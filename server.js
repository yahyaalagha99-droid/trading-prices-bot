import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'Frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'Frontend', 'index.html'));
    }
  });
});

// مسار الشات الحقيقي للذكاء الاصطناعي
app.post('/ask/stream', async (req, res) => {
  try {
    const { messages } = req.body;

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
      const errText = await response.text();
      return res.status(response.status).json({ error: "خطأ من مزود الذكاء الاصطناعي: " + errText });
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
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
