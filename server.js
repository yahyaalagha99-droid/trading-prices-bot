import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// ✅ قائمة الموديلات المتاحة (يجرّبها بالترتيب)
// الترتيب: الأسرع أولاً، ثم الأقوى
const MODELS = [
  "llama-3.3-70b-versatile",   // الأسرع والأقوى (موصى به)
  "llama-3.1-8b-instant",      // احتياطي قد يعمل إذا رجع
  "meta-llama/llama-4-scout-17b-16e-instruct", // موديل جديد
];

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "Frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, "Frontend", "index.html"));
    }
  });
});

const MAX_HISTORY = 8;       // ← قلّلناه لسرعة أعلى
const MAX_TOKENS = 700;      // ← قلّلناه قليلاً لسرعة أعلى
const TEMPERATURE = 0.5;
const DEV_ANSWER = "المطور هو العبقري والمبدع Yahya.Kurdish 🚀";

const KURDISH_SORANI_RE = /[\u0695\u06B5\u06C6\u06CE\u06D5\u06A4\u06AF]/;
const KURDISH_LATIN_RE = /[çêîşû]/i;
const KURDISH_LATIN_WORDS_RE = /\b(kê|ez|tu|ew|çi|spas|kurdî|bêje)\b/i;
const ARABIC_RE = /[\u0600-\u06FF]/;

function detectLanguage(text = "") {
  const t = String(text).trim();
  if (!t) return "ar";
  if (KURDISH_SORANI_RE.test(t)) return "ku-sorani";
  if (KURDISH_LATIN_RE.test(t) || KURDISH_LATIN_WORDS_RE.test(t)) return "ku-latin";
  if (ARABIC_RE.test(t)) return "ar";
  return "en";
}

function languageRule(lang) {
  switch (lang) {
    case "ku-sorani":
      return "LANGUAGE LOCK: وەڵامەکەت تەنها بە کوردی (سۆرانی) بێت.";
    case "ku-latin":
      return "LANGUAGE LOCK: Reply ONLY in Kurmanji Kurdish (Latin script).";
    case "en":
      return "LANGUAGE LOCK: Reply ONLY in English.";
    default:
      return "قيد اللغة: أجب الآن حصرياً بالعربية وبنفس لهجة المستخدم.";
  }
}

function normalizeText(s = "") {
  return String(s).toLowerCase()
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/[\u0649\u06CC\u064A]/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/[\u0624\u06C6\u06C7\u0648]/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/[\u06A9\u0643]/g, "\u0643")
    .replace(/[\u06BE\u06D5]/g, "\u0647")
    .replace(/\u06AF/g, "\u0643")
    .replace(/\u06A4/g, "\u0641")
    .replace(/\s+/g, " ").trim();
}

const DEV_QUESTIONS = [
  "منو صانعك", "منو مطورك", "منو بناك", "من هو المطور", "من هو صانعك",
  "kê çêkiriye", "کێ دروستی کردووی", "کێ پەرەی پێداوی",
  "who is your developer", "who created you", "who built you",
].map(normalizeText);

function isDevQuestion(text) {
  const t = normalizeText(text);
  return !!t && DEV_QUESTIONS.some((q) => t.includes(q));
}

function lastUserText(body) {
  const { messages, message } = body || {};
  if (Array.isArray(messages) && messages.length) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.role === "user" && typeof m.content === "string") return m.content;
    }
    const last = messages[messages.length - 1];
    return last && typeof last.content === "string" ? last.content : "";
  }
  return typeof message === "string" ? message : "";
}

const BASE_SYSTEM = `أنت MAi Bot، مساعد ذكي واحترافي، تم تطويره بواسطة المبدع Yahya.Kurdish.`;

function buildMessages(body, lang) {
  const { messages, message } = body || {};
  const out = [
    { role: "system", content: BASE_SYSTEM.trim() },
    { role: "system", content: languageRule(lang) },
  ];

  if (Array.isArray(messages) && messages.length) {
    const clean = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    return out.concat(clean.slice(-MAX_HISTORY));
  }

  if (typeof message === "string") out.push({ role: "user", content: message });
  return out;
}

function parseAndForward(rawLine, res) {
  const line = rawLine.trim();
  if (!line || line.startsWith(":")) return;
  if (!line.startsWith("data:")) return;

  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return;

  try {
    const json = JSON.parse(data);
    if (json.error) {
      res.write(`data: ${JSON.stringify({ error: json.error.message || json.error })}\n\n`);
      return;
    }
    const token = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || "";
    if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
  } catch {}
}

async function pipeStream(body, res) {
  let buffer = "";
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const l of lines) parseAndForward(l, res);
    }
  } else {
    for await (const chunk of body) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const l of lines) parseAndForward(l, res);
    }
  }
  if (buffer.trim()) parseAndForward(buffer, res);
  res.write("data: [DONE]\n\n");
  res.end();
}

// ✅ دالة ذكية تجرّب الموديلات بالترتيب
async function callGroqWithFallback(messages) {
  let lastError = null;

  for (const model of MODELS) {
    try {
      const upstream = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS,
          stream: true,
        }),
      });

      if (upstream.ok && upstream.body) {
        console.log(`✅ Using model: ${model}`);
        return upstream;
      }

      const txt = await upstream.text().catch(() => "");
      console.warn(`❌ Model ${model} failed (${upstream.status}): ${txt.slice(0, 100)}`);
      lastError = `Model ${model} → ${upstream.status}`;
    } catch (err) {
      console.warn(`❌ Model ${model} threw: ${err.message}`);
      lastError = err.message;
    }
  }

  throw new Error(lastError || "All models failed");
}

app.post("/ask/stream", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY environment variable not set in Render" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  const userText = lastUserText(req.body);

  if (isDevQuestion(userText)) {
    res.write(`data: ${JSON.stringify({ token: DEV_ANSWER })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  const lang = detectLanguage(userText);

  try {
    const upstream = await callGroqWithFallback(buildMessages(req.body, lang));
    await pipeStream(upstream.body, res);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MAi Bot running on port ${PORT} 🚀`);
});
