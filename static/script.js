document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('chat-form');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const chatBox = document.getElementById('chat-box');
  const langSelector = document.getElementById('lang-selector');
  const micBtn = document.getElementById('mic-btn');
  const stopBtn = document.getElementById('stop-voice-btn');
  const clearBtn = document.getElementById('clear-voice-btn');
  const inputWrapper = userInput.parentElement;
  const inputError = document.getElementById('input-error');
  const refreshBtn = document.getElementById('refresh-chat-btn');
  let recognition = null;
  let isListening = false;

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = userInput.value.trim();
    if (!message) return;

    const lang_code = langSelector.value;
    addExchange(message, null);
    addTypingExchange();
    userInput.value = '';
    sendBtn.disabled = true;
    userInput.disabled = true;
    micBtn.disabled = true;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, lang_code })
      });

      const data = await response.json();
      const reply = data.reply || "⚠️ No response.";
      const replyLang = data.reply_lang || lang_code;

      removeTyping();
      addExchange(null, reply, replyLang);
      speakText(reply, replyLang);

      userInput.disabled = false;
      micBtn.disabled = false;
      sendBtn.disabled = false;
      userInput.focus();

    } catch (err) {
      removeTyping();
      addExchange(null, "⚠️ Could not connect to server. Please try again.", "en");
      userInput.disabled = false;
      micBtn.disabled = false;
      sendBtn.disabled = false;
      userInput.focus();
    }
  });

  clearBtn.addEventListener('click', () => {
    userInput.value = '';
    inputWrapper.classList.remove('has-text');
    inputError.textContent = '';
    userInput.focus();
  });

  micBtn.addEventListener('click', () => {
    if (isListening) {
      recognition?.abort();
      setMicInactive();
      stopBtn.style.display = 'none';
      inputError.textContent = 'Voice input cancelled.';
      return;
    }

    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      inputError.textContent = "Voice input not supported in this browser.";
      return;
    }

    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = mapLangToLocale(langSelector.value);
    recognition.interimResults = false;

    recognition.onstart = () => {
      setMicActive();
      stopBtn.style.display = 'inline-flex';
      inputError.textContent = '';
    };

    recognition.onresult = (event) => {
      userInput.value = event.results[0][0].transcript;
      inputWrapper.classList.add('has-text');
      setMicInactive();
      stopBtn.style.display = 'none';
    };

    recognition.onerror = (err) => {
      setMicInactive();
      stopBtn.style.display = 'none';
      inputError.textContent = `Voice input error: ${err.error}`;
    };

    recognition.onend = () => {
      setMicInactive();
      stopBtn.style.display = 'none';
    };

    recognition.start();
  });

  stopBtn.addEventListener('click', () => {
    if (recognition && isListening) {
      recognition.stop();
      setMicInactive();
      stopBtn.style.display = 'none';
    }
  });

  refreshBtn.addEventListener('click', () => {
    chatBox.innerHTML = '';
    const welcome = document.createElement('div');
    welcome.className = 'welcome-message';
    welcome.innerHTML = `
      <div class="welcome-icon">🤖</div>
      <h2>Health AI Assistant</h2>
      <p>How can I help you today? Ask me any health-related question.</p>
    `;
    chatBox.appendChild(welcome);
    scrollToBottom();
  });

  function setMicActive() {
    micBtn.classList.add('listening');
    micBtn.innerText = "🎙️";
    isListening = true;
  }

  function setMicInactive() {
    micBtn.classList.remove('listening');
    micBtn.innerText = "🎤";
    isListening = false;
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

  function removeTyping() {
    const typing = chatBox.querySelector('.typing-dots');
    if (typing) typing.closest('.bot-message').remove();
  }

  function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function speakText(text, lang) {
    if (!('speechSynthesis' in window)) return;
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
      "te": "te-IN"
    };
    return locales[lang] || 'en-IN';
  }

  userInput.addEventListener('input', () => {
    inputWrapper.classList.toggle('has-text', userInput.value.trim() !== '');
    inputError.textContent = '';
  });

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) return;
      e.preventDefault();
      sendBtn.click();
    }
  });
});
