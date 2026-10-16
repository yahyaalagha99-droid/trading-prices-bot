import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// التطبيق والهوية
const APP_NAME = "MAi Bot";
const DEVELOPER_NAME = "Yahya Kurdish";

// التوافق الذكي مع مفاتيح البيئة (سواء OpenRouter أو Groq)
const API_KEY = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;
const IS_OPENROUTER = !!process.env.OPENROUTER_API_KEY;

const API_URL = IS_OPENROUTER 
  ? "https://openrouter.ai/api/v1/chat/completions"
  : "https://api.groq.com/openai/v1/chat/completions";

const MODEL = process.env.MODEL || (IS_OPENROUTER ? "google/gemini-2.5-flash" : "llama-3.1-8b-instant");

// خدمة ملفات الواجهة
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "Frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "index.html"), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, "index.html"));
    }
  });
});

// التعرف على أسئلة الهوية
const DEV_QUESTIONS = [
  "منو صانعك", "منو مطورك", "منو بناك", "من هو المطور", "من هو صانعك",
  "kê çêkiriye", "کێ دروستی کردووی", "کێ پەرەی پێداوی",
  "who is your developer", "who created you", "who built you",
];

function isDevQuestion(text = "") {
  const t = String(text).toLowerCase().trim();
  return DEV_QUESTIONS.some((q) => t.includes(q));
}

function extractLastUserText(messages = []) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user") {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        const txt = m.content.find((c) => c.type === "text");
        return txt ? txt.text : "";
      }
    }
  }
  return "";
}

const BASE_SYSTEM = `أنت MAi Bot، مساعد ذكي واحترافي، تم تطويره بواسطة المبدع Yahya.Kurdish.
تحدث بذكاء وسلاسة، وأجب بنفس لغة المستخدم (عربي، كردي، إنجليزي).`;

app.post("/ask/stream", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "مفتاح API غير معرف في متغيرات البيئة (Environment Variables)." });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  const incomingMessages = req.body?.messages || [];
  const lastText = extractLastUserText(incomingMessages);

  if (isDevQuestion(lastText)) {
    res.write(`data: ${JSON.stringify({ token: `المطور هو العبقري والمبدع Yahya Kurdish 🚀` })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  const payloadMessages = [
    { role: "system", content: BASE_SYSTEM },
    ...incomingMessages.slice(-12)
  ];

  try {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    };

    if (IS_OPENROUTER) {
      headers["HTTP-Referer"] = "https://render.com";
      headers["X-Title"] = APP_NAME;
    }

    const response = await globalThis.fetch(API_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: MODEL,
        messages: payloadMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errTxt = await response.text().catch(() => "");
      res.write(`data: ${JSON.stringify({ error: `API Error ${response.status}:${errTxt.slice(0, 200)}` })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(":")) continue;
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);
            const token = parsed?.choices?.[0]?.delta?.content || "";
            if (token) {
              res.write(`data: ${JSON.stringify({ token })}\n\n`);
            }
          } catch {}
        }
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${APP_NAME} running on port ${PORT} 🚀`);
});
