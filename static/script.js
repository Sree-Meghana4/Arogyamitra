// JavaScript for multilingual chatbot with voice support

document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('chat-form');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const chatBox = document.getElementById('chat-box');
  const langSelector = document.getElementById('lang-selector');
  const micBtn = document.getElementById('mic-btn');

  if (!chatForm || !userInput || !sendBtn || !chatBox || !langSelector || !micBtn) {
    console.error("❌ Missing one or more elements.");
    return;
  }

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = userInput.value.trim();
    if (!message) return;
    const lang_code = langSelector.value;

    addExchange(message, null);
    addTypingExchange();
    userInput.value = '';
    sendBtn.disabled = true;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          lang_code: lang_code
        })
      });

      const data = await response.json();
      const reply = data.reply || "⚠️ No response.";
      const replyLang = data.reply_lang || lang_code;

      const typing = chatBox.querySelector('.typing-dots');
      if (typing) typing.closest('.bot-message').remove();

      addExchange(null, reply, replyLang);
      speakText(reply, replyLang);
    } catch (err) {
      console.error("❌ Fetch error:", err);
      const typing = chatBox.querySelector('.typing-dots');
      if (typing) typing.closest('.bot-message').remove();
      addExchange(null, "⚠️ Could not connect to server.", "en");
    }

    sendBtn.disabled = false;
  });

  micBtn.addEventListener('click', () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = mapLangToLocale(langSelector.value);
    recognition.interimResults = false;

    recognition.onstart = () => {
      micBtn.innerText = "🎙️ Listening...";
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      userInput.value = transcript;
      micBtn.innerText = "🎤";
    };

    recognition.onerror = (err) => {
      console.error("🎤 Voice error:", err);
      alert("Voice input error: " + err.error);
      micBtn.innerText = "🎤";
    };

    recognition.onend = () => {
      micBtn.innerText = "🎤";
    };

    recognition.start();
  });

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatBox.scrollTop = chatBox.scrollHeight;
    });
  }

  function addExchange(userText, botText, botLang) {
    if (userText) {
      const userMessage = document.createElement('div');
      userMessage.className = 'message user-message';
      userMessage.textContent = userText;
      chatBox.appendChild(userMessage);
    }

    if (botText) {
      const botMessage = document.createElement('div');
      botMessage.className = 'message bot-message';

      const botAvatar = document.createElement('div');
      botAvatar.className = 'bot-avatar';
      botAvatar.textContent = '🤖';

      const botContent = document.createElement('div');
      botContent.className = 'bot-content';
      botContent.innerHTML = botText;

      botMessage.appendChild(botAvatar);
      botMessage.appendChild(botContent);
      chatBox.appendChild(botMessage);
    }

    scrollToBottom();
  }

  function addTypingExchange() {
    const typingMessage = document.createElement('div');
    typingMessage.className = 'message bot-message';
    typingMessage.innerHTML = `
      <div class="bot-avatar">🤖</div>
      <div class="bot-content">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    chatBox.appendChild(typingMessage);
    scrollToBottom();
  }

  function speakText(text, lang) {
    try {
      const utterance = new SpeechSynthesisUtterance(text.replace(/<br>/g, ' '));
      utterance.lang = mapLangToLocale(lang || 'en');
      speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("🗣️ TTS error:", e);
    }
  }

  function mapLangToLocale(lang) {
    const locales = {
      "en": "en-IN",
      "hi": "hi-IN",
      "te": "te-IN",
      "ta": "ta-IN",
      "kn": "kn-IN",
      "ml": "ml-IN",
      "bn": "bn-IN",
      "mr": "mr-IN",
      "ur": "ur-IN",
      "gu": "gu-IN"
    };
    return locales[lang] || 'en-IN';
  }
});
