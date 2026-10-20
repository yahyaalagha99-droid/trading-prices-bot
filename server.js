import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { APP_CONFIG } from "./botConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();
dotenv.config({ path: path.join(__dirname, ". env") });

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 700;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "Frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "index.html"), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, "index.html"));
    }
  });
});

function isDevQuestion(text = "") {
  const t = String(text).toLowerCase().trim();
  return APP_CONFIG.devQuestions.some((q) => t.includes(q));
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

app.post("/ask/stream", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY environment variable is not set" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const incomingMessages = req.body?.messages || [];
  const lastText = extractLastUserText(incomingMessages);

  if (isDevQuestion(lastText)) {
    res.write(`data: ${JSON.stringify({ token: `المطور هو العبقري والمبدع ${APP_CONFIG.developerName} 🚀` })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  const BASE_SYSTEM = APP_CONFIG.getSystemPrompt();

  const payloadMessages = [
    { role: "system", content: BASE_SYSTEM },
    ...incomingMessages.slice(-12)
  ];

  try {
    const response = await globalThis.fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
        "HTTP-Referer": "https://render.com",
        "X-Title": APP_CONFIG.appName,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: payloadMessages,
        max_tokens: MAX_TOKENS,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errTxt = await response.text().catch(() => "");
      const msg = response.status === 402
        ? "OpenRouter credit limit reached: reduce max_tokens or add credits."
        : `OpenRouter Error ${response.status}:${errTxt.slice(0, 200)}`;
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
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
  console.log(`${APP_CONFIG.appName} running on port ${PORT} 🚀`);
});
