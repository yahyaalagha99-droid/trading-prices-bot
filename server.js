import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const APP_NAME = "MAi Bot";
const DEVELOPER_NAME = "Yahya Kurdish";

// مفتاح Groq من Render فقط
const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "Frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "index.html"), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, "index.html"));
    }
  });
});

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

const BASE_SYSTEM = `You are ${APP_NAME}, a smart AI assistant created by ${DEVELOPER_NAME}.
CRITICAL RULE: Always respond in the exact same language used by the user.`;

app.post("/ask/stream", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
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
    const completion = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: payloadMessages,
      stream: true,
      max_tokens: 500
    });

    for await (const chunk of completion) {
      const token = chunk?.choices?.[0]?.delta?.content || "";
      if (token) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
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
