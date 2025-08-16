from flask import Flask, render_template, request, redirect, session, jsonify
import os, sqlite3, smtplib, requests
from werkzeug.security import generate_password_hash, check_password_hash
from email.mime.text import MIMEText
from dotenv import load_dotenv
from deep_translator import GoogleTranslator
from gtts import gTTS
import logging
import re


load_dotenv()
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET", "your_secret_key")

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash"
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
APP_PASSWORD = os.getenv("APP_PASSWORD")

# Email templates
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

# System prompt for Gemini
SYSTEM_PROMPT = {
    "role": "user",
    "parts": [{
        "text": (
            "You are a highly intelligent, empathetic medical assistant chatbot talking one-on-one with a patient.\n"
            "Your goal is to understand the user's symptoms by asking at least three relevant follow-up questions before you give any medical conclusion.\n\n"
            "After you have received clear answers to at least three questions, you can give a structured response in this format **without saying 'Line 1', 'Line 2', or using asterisks**:\n\n"
            "🏪 Health Issue Classification:\n"
            "Risk level - LOW / MEDIUM / HIGH / EMERGENCY.\n"
            "If HIGH or EMERGENCY, also say: ⚠ EMERGENCY. Visit a hospital immediately. An alert email has been sent.\n\n"
            "🧠 Description:\n"
            "Summarize the user's condition in simple language, considering their answers and history.\n"
            "Mention which part or system of the body is affected.\n\n"
            "✅ Precautions:\n"
            "Give one or two home remedies, safety measures, or practical actions they can take immediately.\n\n"
            "💊 Medicines:\n"
            "If possible, suggest over-the-counter (OTC) medicines and mention popular brand names.\n\n"
            "Until enough information is available, do not give any diagnosis or full-format response. Just continue asking short, polite, and relevant questions like a real doctor.\n"
            "Use simple, supportive, and conversational language. Never include placeholder words like 'Line 1', 'Line 2', or '*'.\n"
            "Avoid medical jargon. Keep it human-like and friendly. Do not repeat or summarize user messages."
        )
    }]
}

@app.route('/')
def root():
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
            session['conversation_history'] = []
            return redirect('/chat')
        else:
            return render_template('login.html', error="Invalid credentials")
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')

@app.route('/chat')
def chat_page():
    if 'user_email' in session:
        session['conversation_history'] = []
        return render_template('index.html', name=session.get('user_name'))
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

    if 'conversation_history' not in session:
        session['conversation_history'] = []

    session['conversation_history'].append({"role": "user", "content": user_message})
    session.modified = True

    reply_en, reply_translated = process_multilingual_query(user_message, lang_code, session['conversation_history'])
    session['conversation_history'].append({"role": "assistant", "content": reply_en})
    session.modified = True

    if len(session['conversation_history']) > 8:
        session['conversation_history'] = session['conversation_history'][-8:]

    reply_html = reply_translated.replace("\n", "<br>")

    # Generate voice
    voice_success = generate_speech(reply_translated, lang_code)

    # Email alert
    if ("Risk level - HIGH" in reply_en or "Risk level - EMERGENCY" in reply_en):
        send_email(session['user_email'], session['user_name'], lang_code)

    return jsonify({
        "reply": reply_html,
        "reply_lang": lang_code,
        "voice_available": voice_success
    })

def process_multilingual_query(user_text, lang_code, history):
    try:
        translated_query = GoogleTranslator(source=lang_code, target='en').translate(user_text)
    except:
        return ("⚠️ Translation failed.", "⚠️ Translation failed.")

    conversation = [SYSTEM_PROMPT]
    for exchange in history[:-1]:
        conversation.append({
            "role": "user" if exchange["role"] == "user" else "model",
            "parts": [{"text": exchange["content"]}]
        })

    conversation.append({"role": "user", "parts": [{"text": translated_query}]})
    reply = ask_gemini(conversation)

    try:
        translated_response = GoogleTranslator(source='en', target=lang_code).translate(reply)
    except:
        translated_response = reply

    if lang_code != 'en':
        translated_response = remove_repeated_words(translated_response)

    return reply, translated_response

def ask_gemini(conversation):
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
    }
    payload = {"contents": conversation}
    try:
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
            headers=headers, json=payload, timeout=30
        )
        candidates = response.json().get("candidates", [])
        if candidates:
            return candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "⚠️ No response from Gemini.")
    except Exception as e:
        logging.error(f"Gemini API error: {e}")
    return "⚠️ Gemini API failed."

def generate_speech(text, lang_code='en'):
    try:
        tts = gTTS(text=text, lang=lang_code)
        tts.save(os.path.join("static", "response.mp3"))
        return True
    except Exception as e:
        logging.error(f"TTS generation failed: {e}")
        return False

def remove_repeated_words(text):
    return re.sub(r'\b(\w+)( \1\b)+', r'\1', text, flags=re.IGNORECASE)

def send_email(to_email, name, lang_code):
    logging.info(f"[DEBUG] send_email called for {to_email} with lang_code={lang_code}")
    if not SENDER_EMAIL or not APP_PASSWORD:
        logging.error("Email credentials not set.")
        return

    template = EMAIL_TEMPLATES.get(lang_code, EMAIL_TEMPLATES["en"])
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

# ✅ Fix: Added get_db() function
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

if __name__ == "__main__":
    app.run(debug=True)
