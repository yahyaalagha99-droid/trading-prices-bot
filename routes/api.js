import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// إعدادات التطبيق والمطور
const APP_NAME = "Yahya AI";
const DEVELOPER_NAME = "Yahya Kurdish";
const API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// نموذج Groq المستقر والسريع
const MODEL = "llama-3.1-8b-instant";

// توجيه الملفات الثابتة لتقرأ مجلد Frontend والمجلد الرئيسي
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "Frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "index.html"), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, "index.html"));
    }
  });
});

// الكشف عن أسئلة الهوية واسم المطور
const DEV_QUESTIONS = [
  "who created you", "who made you", "who is your developer", "who built you",
  "منو صانعك", "منو المطور", "من هو المطور", "من هو صانعك",
  "کێ دروستت کرد", "کێ داهاتووە", "کێ پەرەی پێداوی"
];

function isIdentityQuestion(text = "") {
  const t = String(text).toLowerCase().trim();
  return DEV_QUESTIONS.some((q) => t.includes(q));
}

function buildSystemPrompt() {
  return `You are ${APP_NAME}, an advanced AI assistant created by ${DEVELOPER_NAME}.
You speak naturally like a human with emotional intelligence.
You support Kurdish (Sorani + Kurmanji), Arabic, and English.
Your tone is warm, smart, human-like, and professional.

If the user writes in Kurdish -> reply Kurdish.
If the user writes in Arabic -> reply Arabic.
If the user writes in English -> reply English.

If asked about identity -> say: "The developer is ${DEVELOPER_NAME}."
Be extremely smart, analyze deeply, and avoid hallucinations.`;
}

function extractLastUserMessage(messages = []) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      const content = messages[i].content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const textItem = content.find((item) => item.type === "text");
        return textItem ? textItem.text : "";
      }
    }
  }
  return "";
}

// المسار الرئيسي المطلوب للواجهة /ask/stream
app.post("/ask/stream", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY environment variable not set in Render" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const messages = req.body?.messages || [];
  const lastUserText = extractLastUserMessage(messages);

  // إذا كان السؤال عن المطور
  if (isIdentityQuestion(lastUserText)) {
    res.write(`data: ${JSON.stringify({ token: `The developer is ${DEVELOPER_NAME}.` })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  // بناء القائمة مع الـ System Prompt
  const formattedMessages = [
    { role: "system", content: buildSystemPrompt() },
    ...messages
  ];

  try {
    const response = await globalThis.fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 500,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      res.write(`data: ${JSON.stringify({ error: `API Error ${response.status}:${errText.slice(0, 200)}` })}\n\n`);
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

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("data:")) {
          const payload = trimmed.slice(5).trim();
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`${APP_NAME} running on port ${PORT} 🚀`);
});
