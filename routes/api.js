import os
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from openai import OpenAI

# ==========================
# CONFIG
# ==========================
APP_NAME = "Yahya AI"
DEVELOPER_NAME = "Yahya Kurdish"
PORT = int(os.getenv("PORT", 5000))
DEBUG = False

# ==========================
# LOGGING
# ==========================
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(APP_NAME)

# ==========================
# OPENAI CLIENT
# ==========================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY)

# ==========================
# FLASK APP
# ==========================
app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False


# ==========================
# IDENTITY RESPONSE
# ==========================
def detect_identity_question(text: str) -> bool:
    if not text:
        return False
    text = text.lower()
    keywords = [
        "who created you",
        "who made you",
        "who is your developer",
        "who built you",
        "منو صانعك",
        "منو المطور",
        "كي داهاتووه",
        "كێ دروستت کرد"
    ]
    return any(k in text for k in keywords)


def identity_response():
    return f"The developer is {DEVELOPER_NAME}."


# ==========================
# SYSTEM PROMPT
# ==========================
def build_system_prompt():
    return f"""
You are {APP_NAME}, an advanced AI assistant created by {DEVELOPER_NAME}.
You speak naturally like a human with emotional intelligence.
You support Kurdish (Sorani + Kurmanji), Arabic, and English.
Your tone is warm, smart, human-like, and professional.

If the user writes in Kurdish → reply Kurdish.
If the user writes in Arabic → reply Arabic.
If the user writes in English → reply English.

If asked about identity → say: "The developer is {DEVELOPER_NAME}."

Be extremely smart, analyze deeply, and avoid hallucinations.
"""


# ==========================
# GPT‑4o COMPLETION
# ==========================
def ai_reply(user_text: str):
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": build_system_prompt()},
                {"role": "user", "content": user_text}
            ],
            temperature=0.7,
            max_tokens=1500
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        logger.error(f"AI Error: {exc}")
        return "AI error: " + str(exc)


# ==========================
# ROUTE 1 — /ask
# ==========================
@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json(silent=True) or {}
    text = data.get("message") or ""

    if detect_identity_question(text):
        reply = identity_response()
    else:
        reply = ai_reply(text)

    return jsonify({
        "success": True,
        "developer": DEVELOPER_NAME,
        "reply": reply,
        "timestamp": datetime.now().isoformat()
    }), 200


# ==========================
# ROUTE 2 — /api/chat
# ==========================
@app.route("/api/chat", methods=["POST"])
def api_chat():
    data = request.get_json(silent=True) or {}
    text = data.get("text") or data.get("message") or ""

    if detect_identity_question(text):
        reply = identity_response()
    else:
        reply = ai_reply(text)

    return jsonify({
        "success": True,
        "developer": DEVELOPER_NAME,
        "reply": reply,
        "timestamp": datetime.now().isoformat()
    }), 200


# ==========================
# MAIN
# ==========================
if __name__ == "__main__":
    logger.info(f"Starting {APP_NAME} using GPT‑4o")
    logger.info(f"Developer: {DEVELOPER_NAME}")
    app.run(host="0.0.0.0", port=PORT, debug=DEBUG)
