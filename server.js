import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/* ============ الإعدادات ============ */
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// موديل سريع + قوي بالعربي والكوردي. تگدر تبدله من ملف .env بدون لمس الكود
const MODEL = process.env.MODEL || "google/gemini-2.5-flash";

const MAX_HISTORY = 12;   // آخر ١٢ رسالة فقط = استجابة أسرع
const MAX_TOKENS  = 800;  // سقف الرد = ما يظل يفكر طويل
const TEMPERATURE = 0.4;  // واطي = التزام أقوى باللغة وأقل تخريف

const DEV_ANSWER = "المطور هو العبقري والمبدع Yahya.Kurdish 🚀";

/* ============ ١) أدوات اللغة — هنا الحل الجذري للخلط ============ */

// حروف كوردية ما موجودة بالعربي = دليل قاطع على كوردي سۆرانی
const KURDISH_SORANI_RE = /[\u0695\u06B5\u06C6\u06CE\u06D5\u06A4\u06AF]/; // ڕ ڵ ۆ ێ ە ڤ گ
const KURDISH_LATIN_RE  = /[çêîşû]/i;                                     // کرمانجی لاتيني
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

// قاعدة لغة تُحقن مع كل رسالة على حدة (مو مرة واحدة بس)
function languageRule(lang) {
  switch (lang) {
    case "ku-sorani":
      return "LANGUAGE LOCK: وەڵامەکەت تەنها بە کوردی (سۆرانی) بێت، بە هەمان شێوازی بەکارهێنەر. بەکارهێنانی وشەی عەرەبی یان ئینگلیزی قەدەغەیە (تەنها ناوی تەکنیکی ڕێگەپێدراوە).";
    case "ku-latin":
      return "LANGUAGE LOCK: Reply ONLY in Kurmanji Kurdish (Latin script). No Arabic or English words (technical names allowed).";
    case "en":
      return "LANGUAGE LOCK: Reply ONLY in English. No Arabic or Kurdish words.";
    default:
      return "قيد اللغة: أجب الآن حصرياً بالعربية وبنفس لهجة المستخدم. يمنع استخدام أي كلمة كوردية أو جملة إنجليزية (الأسماء التقنية فقط مسموحة). لا تخلط اللغات أبداً.";
  }
}

/* ============ ٢) كشف سؤال "منو مطورك" بشكل موحّد ============ */

// توحيد الحروف: أ إ آ -> ا ، ک -> ك ، گ -> ك ، ە/ھ -> ه ، ۆ/ۇ -> و ...
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

/* ============ ٣) بناء الرسائل (ذاكرة محدودة = سرعة) ============ */

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

const BASE_SYSTEM = `
أنت MAi Bot، مساعد ذكي واحترافي، تم تطويره بواسطة المبدع Yahya.Kurdish.

قواعدك:
1. تجاوب مباشرة وبنفس لغة المستخدم، بدون مقدمات طويلة وبدون إعادة صياغة السؤال.
2. ردودك قصيرة وطبيعية (جملة إلى ست جمل عادة) لأنها تُقرأ بالصوت لاحقاً.
3. لا تستخدم ** أو ## ولا قوائم طويلة ولا إيموجي كثيره. نص سلس فقط.
4. تذكّر سياق المحادثة السابقة وكن مترابطاً معها.
5. لا تسأل أسئلة إضافية إلا إذا كان السؤال ناقصاً فعلاً ويستحيل الجواب بدونه، وسؤال واحد فقط.
6. لا تخلط اللغات نهائياً، والتزم بقيد اللغة المرفق في آخر التعليمات.
7. إذا سُئلت عن ميزاتك: ابدأ بالدعم الأكاديمي، ثم الإيميلات والهندسة، ثم اللغات، واجعل التداول والمالية آخر القائمة.
`;

function buildMessages(body, lang) {
  const { messages, message } = body || {};
  const out = [
    { role: "system", content: BASE_SYSTEM.trim() },
    { role: "system", content: languageRule(lang) },
  ];

  if (Array.isArray(messages) && messages.length) {
    const clean = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    return out.concat(clean.slice(-MAX_HISTORY)); // آخر N رسالة فقط
  }

  if (typeof message === "string") out.push({ role: "user", content: message });
  return out;
}

/* ============ ٤) تمرير الرد كلمة كلمة (SSE) ============ */

function parseAndForward(rawLine, res) {
  const line = rawLine.trim();
  if (!line || line.startsWith(":")) return;      // تجاهل الفواصل مثل : OPENROUTER PROCESSING
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
  } catch { /* سطر مكسور: تجاهله ولا توقف الستريم */ }
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

/* ============ ٥) الراوتات ============ */

// راوت الستريمينغ (هذا اللي يعطي تأثير كلمة كلمة)
app.post("/ask/stream", async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: "OPENROUTER_API_KEY not set" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",   // يمنع Nginx من تجميع الرد
  });
  res.write(": connected\n\n");

  const userText = lastUserText(req.body);

  // سؤال المطور: جواب فوري بدون أي طلب للـ API
  if (isDevQuestion(userText)) {
    res.write(`data: ${JSON.stringify({ token: DEV_ANSWER })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  const lang = detectLanguage(userText);

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "MAi Bot",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: buildMessages(req.body, lang),
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        stream: true,
        provider: { sort: "throughput" },  // يروح على أسرع مزوّد متاح
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      res.write(`data: ${JSON.stringify({ error: `Model error ${upstream.status}: ${txt.slice(0, 300)}` })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    await pipeStream(upstream.body, res);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// الراوت القديم باقي شغال (JSON عادي) حتى ما يتعطل أي تطبيق قديم عندك
app.post("/ask", async (req, res) => {
  try {
    if (!API_KEY) return res.json({ error: "OPENROUTER_API_KEY not set" });

    const userText = lastUserText(req.body);
    if (isDevQuestion(userText)) return res.json({ reply: DEV_ANSWER });

    const lang = detectLanguage(userText);

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "MAi Bot",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: buildMessages(req.body, lang),
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        stream: false,
        provider: { sort: "throughput" },
      }),
    });

    const data = await response.json();
    if (!data.choices || !data.choices[0]) return res.json({ error: "Model error", details: data });

    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, model: MODEL }));

app.listen(PORT, () => {
  console.log(`MAi Bot running on port ${PORT} - model: ${MODEL} 🚀`);
});
