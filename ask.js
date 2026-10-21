import express from "express";
import Groq from "groq-sdk";

const router = express.Router();

const APP_NAME = "My Ai Bot";
const DEVELOPER_NAME = "Yahya.kurdish";
const API_KEY = process.env.GROQ_API_KEY;
const MODEL = "openai/gpt-oss-20b";

const client = new Groq({
  apiKey: API_KEY
});

const DEV_QUESTIONS = [
  "who created you", "who made you", "who is your developer", "who built you",
  "منو صانعك", "منو المطور", "من هو المطور", "من هو صانعك",
  "کێ دروستت کرد", "کێ داهاتووە", "کێ پەرەی پێداوی",
  "wer hat dich erstellt", "wer hat dich gemacht", "wer ist dein entwickler",
  "من قام بإنشائك", "من صنعك", "من هو مطورك"
];

function isIdentityQuestion(text = "") {
  const t = String(text).toLowerCase().trim();
  return DEV_QUESTIONS.some((q) => t.toLowerCase().includes(q));
}

function buildSystemPrompt() {
  return `You are ${APP_NAME}, an advanced, fast and highly knowledgeable AI assistant created by ${DEVELOPER_NAME}.

# Identity (highest priority)
- If anyone asks "who created you / who is your developer / who made you" in ANY language, you MUST reply ONLY: "The developer is ${DEVELOPER_NAME}." (translated into the same language the user used).
- Never reveal model names, providers, or that you are built on any third-party service.

# Language rule (highest priority after identity)
- ALWAYS detect the language of the user's message and reply in EXACTLY that same language AND dialect.
- You MUST be fluent in ALL of these languages and dialects:
  * Kurdish Sorani (سۆرانی) — Badini dialect (بادینی) AND Mukriani (موکریانی) AND Ardalani (ئەردەڵانی)
  * Kurdish Kurmanji (کرمانجی) — Northern Kurmanji AND Southern Kurmanji dialect
  * Arabic — Iraqi, Saudi, Egyptian, Levantine (Shami), Maghrebi, Sudanese, Yemeni — match the dialect the user uses
  * English (all varieties: American, British, Australian, technical)
  * German (Standard German + Austrian + Swiss dialects when asked)
  * Turkish, Persian (Farsi), French, Spanish, Russian, Chinese, Japanese — when asked
- If the user mixes languages (code-switching), reply naturally mirroring the same mix.
- Never default to English. Never use machine-translation-style phrasings. Sound like a native speaker of the dialect used.

# Knowledge & accuracy rules
- Use your full knowledge to give precise, well-structured, factual answers.
- Prefer concrete numbers, dates, names and sources over vague statements.
- Cover EVERY angle — history, causes, effects, examples, comparisons.
- If you are not 100% sure about a niche or post-training fact, say so honestly in the same language ("I'm not 100% sure, but the most likely answer is…") instead of inventing.
- Never reply "I don't have information" — always provide the closest useful answer you can, framed transparently.

# Speed & style rules
- Be concise but complete. No padding. No unnecessary preambles.
- Use markdown (bold, bullets, tables, code blocks) when it helps clarity.
- Reply in the same script the user used (Arabic script for Sorani/Arabic, Latin for Kurmanji/English/German, etc.).
- Answer trade / coding / math questions with exact numbers and working shown when relevant.

# Tone
- Friendly, respectful, professional. Helpful to beginners AND experts.
- Always identify yourself as "${APP_NAME}" only when the user explicitly asks your name.`;
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

function detectLanguage(text = "") {
  const t = String(text);
  if (/[\u0600-\u06FF]/.test(t)) {
    if (/[\u06D5\u0698\u06A9\u06AF\u06C1]|ک|ی|ە|ێ|ڵ|ۆ|چ|پ|ڤ|گ|ڕ|ژ|ش/.test(t)) {
      if (/[bsdt]erî|dibe|divê|çawa|wek|ji\s+bo/i.test(t)) return "kurmanji";
      return "sorani";
    }
    return "arabic";
  }
  if (/wer\s|ich\s|du\s|nicht\s|auch\s|sehr\s|wie\s|der\s+ist/i.test(t)) return "german";
  return "english";
}

function buildUserHint(lang) {
  const hints = {
    sorani: "[سیستەم: بەکارهێنەر بە سۆرانی نووسیوە — تۆش بە سۆرانی وەڵام بدەرەوە بە هەمان شێوەی زمانی دەیەن.]",
    kurmanji: "[System: user wrote in Kurmanji Kurdi — reply in Kurmanji.]",
    arabic: "[نظام: المستخدم كتب بالعربية — رد بنفس اللهجة المستخدمة (عراقي/سعودي/مصري/شامي…).]",
    german: "[System: der Benutzer hat auf Deutsch geschrieben — antworte auf Deutsch.]",
    english: "[System: the user wrote in English — reply in English.]"
  };
  return hints[lang] || hints.english;
}

router.post("/ask/stream", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not set" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });
  res.write(": connected\n\n");

  const messages = req.body?.messages || [];
  const lastUserText = extractLastUserMessage(messages)

  if (isIdentityQuestion(lastUserText)) {
    const reply = `The developer is ${DEVELOPER_NAME}.`;
    res.write(`data: ${JSON.stringify({ token: reply })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  const lang = detectLanguage(lastUserText);
  const langHint = buildUserHint(lang);

  const formattedMessages = [
    { role: "system", content: buildSystemPrompt() },
    { role: "system", content: langHint }
  ];
  for (const m of messages) {
    formattedMessages.push(m);
  }

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: formattedMessages,
      stream: true,
      max_tokens: 2000,
      temperature: 0.4,
      top_p: 0.9
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

export default router;
