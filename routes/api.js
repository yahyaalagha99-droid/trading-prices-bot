import express from "express";
import Groq from "groq-sdk";

const router = express.Router();

const APP_NAME = "Yahya AI";
const DEVELOPER_NAME = "Yahya Kurdish";
const API_KEY = process.env.GROQ_API_KEY;
const MODEL = "llama-3.1-8b-instant";

const client = new Groq({
  apiKey: API_KEY
});

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
You support Kurdish (Sorani + Kurmanji), Arabic, and English.
If asked about identity -> say: "The developer is ${DEVELOPER_NAME}."`;
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
  const lastUserText = extractLastUserMessage(messages);

  if (isIdentityQuestion(lastUserText)) {
    res.write(`data: ${JSON.stringify({ token: `The developer is ${DEVELOPER_NAME}.` })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  const formattedMessages = [
    { role: "system", content: buildSystemPrompt() },
    ...messages
  ];

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: formattedMessages,
      stream: true,
      max_tokens: 1500
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
