from flask import Flask, render_template, request, redirect, session, jsonify
import os, sqlite3, smtplib, requests
from werkzeug.security import generate_password_hash, check_password_hash
from email.mime.text import MIMEText
from dotenv import load_dotenv
from deep_translator import GoogleTranslator
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET", "your_secret_key")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash"
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
APP_PASSWORD = os.getenv("APP_PASSWORD")

# System prompt for Gemini
SYSTEM_PROMPT = {
    "role": "user",
    "parts": [{"text": (
        "You are a multilingual medical assistant. Respond to symptoms and health concerns in this exact format.\n\n"
        "If the user's input is vague, incomplete, or you need more information to make a better assessment, ask ONE relevant follow-up question as a doctor would, before giving your formatted response. If the user's input is clear and detailed, do NOT ask a follow-up question. Never ask more than one follow-up in a row.\n\n"
        "The follow-up question should be in the user's language and should be specific (e.g., 'How long have you had this symptom?', 'Do you have a fever?', etc.).\n\n"
        "Do not skip sections, and respond in the user's language. Each section should have exactly 2 lines, with 1 blank line between sections.\n"
        "DO NOT use markdown formatting.\n\n"
        "🛑 Omit the 'Nearby Help' section.\n\n"
        "FORMAT:\n\n"
        "🏪 Health Issue Classification:\n"
        "Line 1: Risk level - LOW / MEDIUM / HIGH / EMERGENCY.\n"
        "Line 2: If HIGH or EMERGENCY, say: ⚠ EMERGENCY. Visit a hospital immediately. An alert email has been sent.\n\n"
        "🧠 Description:\n"
        "Line 1: Summarize their issue in plain terms.\n"
        "Line 2: Mention the body system possibly affected.\n\n"
        "✅ Precautions:\n"
        "Line 1: A quick home remedy or first step.\n"
        "Line 2: A second practical precaution.\n\n"
        "💊 Medicines:\n"
        "Line 1: Suggest OTC (over-the-counter) medicines like paracetamol, antacids, etc.\n"
        "Line 2: Mention brand names if applicable, but remind to read dosage instructions carefully.\n\n"
        "If the user just says 'hello', greet them kindly and do NOT use this format."
    )}]
}
# Language-wise email templates
EMAIL_TEMPLATES = {
    "en": {
        "subject": "Health Emergency Alert - HIGH Risk",
        "body": """Dear {name},

Your issue is marked as HIGH risk.
Please visit a hospital immediately.

Nearby hospitals: https://www.google.com/maps/search/hospitals+near+me

Stay Safe,
TEAM AROGYAMITRA"""
    },
    "hi": {
        "subject": "स्वास्थ्य आपातकालीन सूचना - उच्च जोखिम",
        "body": """प्रिय {name},

आपकी समस्या को उच्च जोखिम के रूप में चिह्नित किया गया है।
कृपया तुरंत अस्पताल जाएं।

नजदीकी अस्पताल: https://www.google.com/maps/search/hospitals+near+me

सावधान रहें,
टीम आरोग्यमित्र"""
    },
    "te": {
        "subject": "ఆరోగ్య అత్యవసర హెచ్చరిక - హై రిస్క్",
        "body": """ప్రియమైన {name},

మీ సమస్యను హై రిస్క్‌గా గుర్తించారు.
దయచేసి వెంటనే ఆసుపత్రికి వెళ్లండి.

సమీప ఆసుపత్రులు: https://www.google.com/maps/search/hospitals+near+me

జాగ్రత్తగా ఉండండి,
మీ ఆరోగ్యమిత్ర బృందం"""
    }
}

@app.route('/')
def root():
    return redirect('/login')

@app.route('/chat')
def chat_page():
    if 'user_email' in session:
        return render_template('index.html', name=session.get('user_name'))
    return redirect('/login')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email']
        password = generate_password_hash(request.form['password'])
        try:
            with get_db() as conn:
                conn.execute("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", (name, email, password))
            return redirect('/login')
        except Exception:
            return render_template('register.html', error="Email already exists.")
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        with get_db() as conn:
            user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user and check_password_hash(user['password'], password):
            session['user_email'] = email
            session['user_name'] = user['name']
            return redirect('/chat')
        else:
            return render_template('login.html', error="Invalid credentials")
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')

@app.route("/api/chat", methods=["POST"])
def chat():
    if 'user_email' not in session:
        return jsonify({"reply": "Please log in to use the chat.", "reply_lang": "en"})

    data = request.get_json()
    user_message = data.get("message")
    lang_code = data.get("lang_code", "en")

    if not user_message:
        return jsonify({"reply": "⚠️ Please type a message.", "reply_lang": lang_code})

    reply = process_multilingual_query(user_message, lang_code)
    reply_html = reply.replace("\n", "<br>")

    # Improved emergency detection
    if ("Risk level - HIGH" in reply or "Risk level - EMERGENCY" in reply):
        send_email(session['user_email'], session['user_name'], lang_code)

    return jsonify({"reply": reply_html, "reply_lang": lang_code})

def get_db():
    conn = sqlite3.connect('users.db')
    conn.row_factory = sqlite3.Row
    conn.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT
    )''')
    return conn

def process_multilingual_query(user_text, lang_code):
    try:
        translated_query = GoogleTranslator(source=lang_code, target='en').translate(user_text)
    except:
        return "⚠️ Translation failed."

    # Add a flag to the conversation to prevent repeated follow-ups
    conversation = [{"role": "user", "content": translated_query}]
    if session.get("last_bot_followup"):
        conversation.append({"role": "system", "content": "The user has already been asked a follow-up question. Do not ask another. Provide your full formatted response now."})
        session["last_bot_followup"] = False
    reply = ask_gemini(conversation)

    # Detect if the bot is asking a follow-up
    if "?" in reply and ("please provide" in reply.lower() or "can you tell" in reply.lower() or "more details" in reply.lower()):
        session["last_bot_followup"] = True
    else:
        session["last_bot_followup"] = False

    try:
        translated_response = GoogleTranslator(source='en', target=lang_code).translate(reply)
    except:
        translated_response = reply

    return translated_response

def ask_gemini(conversation):
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
    }
    payload = {
        "contents": [
    SYSTEM_PROMPT
     ] + [
            {"role": msg.get("role", "user"), "parts": [{"text": msg.get("content", "")}]} for msg in conversation
        ]
    }
    try:
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
            headers=headers, json=payload, timeout=30
        )
        candidates = response.json().get("candidates", [])
        if candidates:
            return candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "⚠️ No response from Gemini.")
    except Exception as e:
        print("Gemini API error:", e)
    return "⚠️ Gemini API failed."

def send_email(to_email, name, lang_code):
    if not SENDER_EMAIL or not APP_PASSWORD:
        logging.error("Email credentials not set.")
        return

    logging.info(f"Requested email language: {lang_code}")
    template = EMAIL_TEMPLATES.get(lang_code)
    if not template:
        logging.warning(f"No template for lang_code '{lang_code}', defaulting to English.")
        template = EMAIL_TEMPLATES["en"]
    subject = template["subject"]
    body = template["body"].format(name=name)

    msg = MIMEText(body)
    msg['From'] = SENDER_EMAIL
    msg['To'] = to_email
    msg['Subject'] = subject

    try:
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(SENDER_EMAIL, APP_PASSWORD)
        server.sendmail(SENDER_EMAIL, to_email, msg.as_string())
        server.quit()
        logging.info(f"✅ Email sent to {to_email} in {lang_code}")
    except Exception as e:
        logging.error(f"❌ Email send error: {e}")

if __name__ == "__main__":
    app.run(debug=True)
