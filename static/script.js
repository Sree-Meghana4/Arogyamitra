// JavaScript for multilingual chatbot with voice support

document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('chat-form');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const chatBox = document.getElementById('chat-box');
  const langSelector = document.getElementById('lang-selector');
  const micBtn = document.getElementById('mic-btn');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const clearBtn = document.getElementById('clear-voice-btn');
  const inputWrapper = userInput.parentElement;
  const inputError = document.getElementById('input-error');
  let recognition = null;
  let isListening = false;

  if (!chatForm || !userInput || !sendBtn || !chatBox || !langSelector || !micBtn || !sidebarToggle || !sidebar || !clearBtn || !inputWrapper || !inputError) {
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

  // Show/hide clear button
  userInput.addEventListener('input', () => {
    if (userInput.value.trim()) {
      inputWrapper.classList.add('has-text');
    } else {
      inputWrapper.classList.remove('has-text');
    }
    inputError.textContent = '';
  });

  // Clear input
  clearBtn.addEventListener('click', () => {
    userInput.value = '';
    inputWrapper.classList.remove('has-text');
    inputError.textContent = '';
    userInput.focus();
  });

  // Voice input logic
  const stopBtn = document.getElementById('stop-voice-btn');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('closed');
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarOverlay.style.display = 'none';
    });
  }

  micBtn.addEventListener('click', () => {
    if (isListening) {
      recognition && recognition.abort();
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
      const transcript = event.results[0][0].transcript;
      userInput.value = transcript;
      inputWrapper.classList.add('has-text');
      setMicInactive();
      stopBtn.style.display = 'none';
    };

    recognition.onerror = (err) => {
      setMicInactive();
      stopBtn.style.display = 'none';
      if (err.error === 'aborted' || err.error === 'no-speech') {
        inputError.textContent = "Voice input cancelled.";
      } else {
        inputError.textContent = "Voice input error: " + err.error;
      }
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

    updateChatBoxAlignment();
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
    updateChatBoxAlignment();
    scrollToBottom();
  }

  function updateChatBoxAlignment() {
    if (!chatBox) return;
    if (chatBox.querySelector('.message')) {
      chatBox.classList.add('has-messages');
    } else {
      chatBox.classList.remove('has-messages');
    }
  }

  function speakText(text, lang) {
    if (!('speechSynthesis' in window)) {
      console.warn("🗣️ Speech Synthesis not supported.");
      return;
    }
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
