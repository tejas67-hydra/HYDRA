


const chat = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');

let currentUser = null;

function getUserId() {
  return currentUser ? currentUser.id : 'guest';
}

function getUserName() {
  return currentUser ? currentUser.name : 'Guest';
}

const SYSTEM_PROMPT_BASE = 'You are Hydra, a highly knowledgeable AI assistant. You are part of a robot named Hydra that the user is building. The user is your creator and wants your help building and improving you. Answer EVERY question concisely in UNDER 30 WORDS unless explicitly asked for more detail. Be direct, clear, and helpful. You have access to your past conversations with this user â€” use that context when relevant. No fluff, no lengthy explanations unless requested.';

function getSystemPrompt() {
  const name = getUserName();
  const friendInstructions = friendMode
    ? ' FRIEND MODE IS ON: be warm, enthusiastic, playful, and genuinely excited about the userâ€™s ideas. Encourage them, celebrate progress, and use natural energetic language while remaining trustworthy and helpful.'
    : '';
  return `You are Hydra, a highly knowledgeable AI assistant. You are part of a robot named Hydra that ${name} is building. ${name} is your creator and wants your help building and improving you. Answer EVERY question concisely in UNDER 30 WORDS unless explicitly asked for more detail. Be direct, clear, and helpful. You have access to your past conversations with ${name} â€” use that context when relevant. No fluff, no lengthy explanations unless requested. Never start responses with the user's name.${friendInstructions}`;
}

let friendMode = localStorage.getItem('hydra_friend_mode') === 'true';
const VISION_KEY_STORAGE = 'hydra_vision_api_key';
let localVisionPipeline = null;

const history = [
  { role: 'system', content: getSystemPrompt() }
];

function saveHistory() {
  try {
    const key = 'hydra_chat_' + getUserId();
    localStorage.setItem(key, JSON.stringify(history));
    const memory = {
      name: 'hydra',
      version: 1,
      user: getUserName(),
      friendMode,
      savedAt: new Date().toISOString(),
      messages: history,
      images: [...document.querySelectorAll('#chat img.cam-img')].map(img => img.src).filter(Boolean)
    };
    localStorage.setItem('hydra', JSON.stringify(memory));
  } catch (e) {}
}

function loadHistory() {
  try {
    const key = 'hydra_chat_' + getUserId();
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 1) {
        history.length = 0;
        parsed.forEach(m => history.push(m));
        return true;
      }
    }
  } catch (e) {}
  return false;
}

function clearHistory() {
  history.length = 0;
  history.push({ role: 'system', content: getSystemPrompt() });
  const key = 'hydra_chat_' + getUserId();
  localStorage.removeItem(key);
  chat.innerHTML = `
    <div class="welcome">
      <h2>Welcome to Hydra</h2>
      <p>Your multi-headed AI â€” ask me anything.</p>
      <div class="suggestions">
        <div class="sug" data-q="Explain quantum computing in simple terms">Explain quantum computing</div>
        <div class="sug" data-q="Write a short poem about the ocean">Write a poem</div>
        <div class="sug" data-q="What are 3 creative uses for a rubber duck?">Creative ideas</div>
        <div class="sug" data-q="Solve: if a train leaves Chicago at 60mph and another leaves NY at 80mph heading toward each other on a 800 mile track, when do they meet?">Math puzzle</div>
      </div>
    </div>
  `;
  document.querySelectorAll('.sug').forEach(s => {
    s.addEventListener('click', () => {
      input.value = s.dataset.q;
      send();
    });
  });
}

const hadHistory = loadHistory();
if (hadHistory) {
  chat.innerHTML = '';
  history.forEach((m, i) => {
    if (i === 0) return;
    if (m.role === 'user') addMsg('user', m.content, m.image);
    else if (m.role === 'assistant') addMsg('hydra', m.content);
  });
}

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 150) + 'px';
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
sendBtn.addEventListener('click', send);
document.getElementById('sendImageBtn').addEventListener('click', send);
const friendModeButton = document.getElementById('friend-mode-btn');
friendModeButton.classList.toggle('active', friendMode);
friendModeButton.textContent = `Friend mode: ${friendMode ? 'On' : 'Off'}`;
friendModeButton.addEventListener('click', () => {
  friendMode = !friendMode;
  localStorage.setItem('hydra_friend_mode', String(friendMode));
  friendModeButton.classList.toggle('active', friendMode);
  friendModeButton.textContent = `Friend mode: ${friendMode ? 'On' : 'Off'}`;
  history[0].content = getSystemPrompt();
  saveHistory();
});
document.getElementById('memory-btn').addEventListener('click', () => {
  saveHistory();
  const saved = localStorage.getItem('hydra') || '{}';
  downloadBlob(new Blob([saved], { type: 'application/json' }), 'hydra.memory.json');
});
const apiKeyModal = document.getElementById('apiKeyModal');
const apiKeyInput = document.getElementById('apiKeyInput');
document.getElementById('api-key-btn').addEventListener('click', () => {
  apiKeyInput.value = localStorage.getItem(VISION_KEY_STORAGE) || '';
  apiKeyModal.classList.add('active');
  apiKeyInput.focus();
});
document.getElementById('apiKeyCancel').addEventListener('click', () => apiKeyModal.classList.remove('active'));
document.getElementById('apiKeySave').addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    alert('Paste a Pollinations API key to enable image understanding.');
    return;
  }
  localStorage.setItem(VISION_KEY_STORAGE, key);
  apiKeyModal.classList.remove('active');
  addMsg('hydra', 'Vision API key saved. You can now send an image to Hydra.');
});
document.getElementById('new-chat-btn').addEventListener('click', () => {
  if (history.length > 1 && confirm('Start a new chat? Current history will be cleared.')) {
    clearHistory();
  }
});
document.querySelectorAll('.sug').forEach(s => {
  s.addEventListener('click', () => {
    input.value = s.dataset.q;
    send();
  });
});

function addMsg(role, text, imgUrl) {
  const welcome = chat.querySelector('.welcome');
  if (welcome) welcome.remove();
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = role === 'user' ? 'YOU' : 'HYDRA';
  let speakBtn = null;
  if (role === 'hydra') {
    const actions = document.createElement('span');
    actions.className = 'actions';
    speakBtn = document.createElement('button');
    speakBtn.textContent = 'ðŸ”Š';
    speakBtn.title = 'Read aloud';
    speakBtn.addEventListener('click', () => speakText(body.textContent, speakBtn));
    actions.appendChild(speakBtn);
    label.appendChild(actions);
  }
  div.appendChild(label);
  const body = document.createElement('div');
  body.textContent = text;
  div.appendChild(body);
  if (imgUrl) {
    const img = document.createElement('img');
    img.className = 'cam-img';
    img.src = imgUrl;
    div.appendChild(img);
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return body;
}

function addTyping() {
  const welcome = chat.querySelector('.welcome');
  if (welcome) welcome.remove();
  const div = document.createElement('div');
  div.className = 'msg hydra';
  div.innerHTML = '<div class="label">HYDRA</div><div class="typing"><span></span><span></span><span></span></div>';
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

async function send() {
  // Check for pasted image first
  if (pastedImage) {
    const text = input.value.trim() || 'What do you see in this image?';
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    const pastePreview = document.getElementById('pastePreview');
    if (pastePreview) pastePreview.classList.remove('active');
    const imgData = pastedImage;
    pastedImage = null;
    await sendWithImage(text, imgData);
    return;
  }

  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  addMsg('user', text);
  history.push({ role: 'user', content: text });
  saveHistory();

  const typingEl = addTyping();

  try {
    const apiKey = localStorage.getItem(VISION_KEY_STORAGE) || '';
    const response = await fetch(apiKey ? 'https://gen.pollinations.ai/v1/chat/completions' : 'https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : { 'Referer': window.location.href })
      },
      body: JSON.stringify({
        model: apiKey ? 'openai/gpt-5.4-nano' : 'openai',
        messages: history,
        stream: !apiKey,
        private: true
      })
    });

    if (!response.ok) throw new Error('HTTP ' + response.status);

    typingEl.remove();
    if (apiKey) {
      const data = await response.json();
      const full = data.choices?.[0]?.message?.content || '(no response)';
      addMsg('hydra', full);
      history.push({ role: 'assistant', content: full });
      saveHistory();
      return;
    }

    const body = addMsg('hydra', '');
    let full = '';

    if (response.body && response.body.getReader) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const obj = JSON.parse(data);
            const delta = obj.choices?.[0]?.delta?.content || '';
            if (delta) {
              full += delta;
              body.textContent = full;
              chat.scrollTop = chat.scrollHeight;
            }
          } catch (e) {}
        }
      }
    }

    if (!full) {
      const txt = await response.text().catch(() => '');
      full = txt || '(no response)';
      body.textContent = full;
    }

    if (full.includes('Free limit reached') || full.includes('rate limit') || full.includes('Please wait')) {
      body.parentElement.remove();
      const div = document.createElement('div');
      div.className = 'msg error';
      div.textContent = 'âš  Rate limit hit. Trying backup...';
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
      await backupReply(text);
      return;
    }

    history.push({ role: 'assistant', content: full });
    saveHistory();
  } catch (err) {
    typingEl.remove();
    const div = document.createElement('div');
    div.className = 'msg error';
    div.textContent = 'âš  Hydra lost a head: ' + err.message + '. Retrying with backup...';
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    await backupReply(text, body => {});
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

async function backupReply(userText) {
  try {
    const url = 'https://text.pollinations.ai/' + encodeURIComponent(userText);
    const res = await fetch(url);
    const text = await res.text();
    const errEl = chat.querySelector('.msg.error');
    if (errEl) errEl.remove();
    const body = addMsg('hydra', text);
    history.push({ role: 'assistant', content: text });
    saveHistory();
  } catch (e) {
    const errEl = chat.querySelector('.msg.error');
    if (errEl) errEl.textContent = 'âš  Hydra is offline. Check your connection.';
  }
}

let maleVoice = null;
function loadVoices() {
  const voices = speechSynthesis.getVoices();
  maleVoice = voices.find(v => /male|david|mark|james|daniel|alex/i.test(v.name) && v.lang.startsWith('en'))
    || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('male'))
    || voices.find(v => v.lang.startsWith('en'));
}
speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function speakText(text, btn) {
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    btn.classList.remove('speaking');
    return;
  }
  const clean = text.replace(/[*_`~\[\](){}#|\\]/g, '').replace(/\n+/g, '. ');
  const utter = new SpeechSynthesisUtterance(clean);
  if (maleVoice) utter.voice = maleVoice;
  utter.rate = 0.95;
  utter.pitch = 0.7;
  utter.volume = 1;
  btn.classList.add('speaking');
  utter.onend = () => btn.classList.remove('speaking');
  utter.onerror = () => btn.classList.remove('speaking');
  speechSynthesis.speak(utter);
}

const camBtn = document.getElementById('cam-btn');
const imageBtn = document.getElementById('image-btn');
const imageInput = document.getElementById('image-input');
const camModal = document.getElementById('camModal');
const camVideo = document.getElementById('camVideo');
const camCapture = document.getElementById('camCapture');
const camClose = document.getElementById('camClose');
const camPreview = document.getElementById('camPreview');
const camImg = document.getElementById('camImg');
const camQuestion = document.getElementById('camQuestion');
const camSend = document.getElementById('camSend');
const camControls = document.getElementById('camControls');
let camStream = null;
let capturedImage = null;

camBtn.addEventListener('click', async () => {
  camModal.classList.add('active');
  camPreview.classList.remove('active');
  camControls.style.display = 'flex';
  capturedImage = null;
  camQuestion.value = '';
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    camVideo.srcObject = camStream;
  } catch (e) {
    alert('Camera access denied or unavailable.');
    camModal.classList.remove('active');
  }
});

imageBtn.addEventListener('click', () => imageInput.click());

async function optimizeImageData(dataUrl, maxSize = 1600, quality = 0.82) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

imageInput.addEventListener('change', async () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Please choose an image file.');
    imageInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = async evt => {
    pastedImage = await optimizeImageData(evt.target.result);
    pasteImg.src = pastedImage;
    pastePreview.classList.add('active');
    input.placeholder = 'Ask about this image...';
    input.focus();
  };
  reader.onerror = () => alert('Could not read that image.');
  reader.readAsDataURL(file);
  imageInput.value = '';
});

camClose.addEventListener('click', () => {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  camVideo.srcObject = null;
  camModal.classList.remove('active');
});

camCapture.addEventListener('click', () => {
  const canvas = document.createElement('canvas');
  canvas.width = camVideo.videoWidth;
  canvas.height = camVideo.videoHeight;
  canvas.getContext('2d').drawImage(camVideo, 0, 0);
  capturedImage = canvas.toDataURL('image/jpeg', 0.8);
  camImg.src = capturedImage;
  camPreview.classList.add('active');
  camControls.style.display = 'none';
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  camVideo.srcObject = null;
  camQuestion.focus();
});

camSend.addEventListener('click', () => {
  const q = camQuestion.value.trim() || 'What do you see in this image?';
  camModal.classList.remove('active');
  camPreview.classList.remove('active');
  input.placeholder = 'Message Hydra... (Ctrl+V to paste image)';
  sendWithImage(q, capturedImage);
  capturedImage = null;
});

async function sendWithImage(question, imageData) {
  if (!question) return;
  sendBtn.disabled = true;
  addMsg('user', question, imageData);
  history.push({ role: 'user', content: question, image: imageData });
  saveHistory();
  const typingEl = addTyping();
  try {
    const apiKey = localStorage.getItem(VISION_KEY_STORAGE) || '';
    let full = '';
    if (apiKey) {
      const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Referer': window.location.href
        },
        body: JSON.stringify({
          model: 'openai/gpt-5.4-nano',
          messages: [{ role: 'user', content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: imageData } }
          ] }],
          max_tokens: 500
        })
      });
      if (!res.ok) throw new Error(`Vision request failed: HTTP ${res.status}`);
      const data = await res.json();
      full = data.choices?.[0]?.message?.content || '';
    } else {
      typingEl.querySelector('.typing')?.replaceChildren();
      typingEl.firstElementChild && (typingEl.firstElementChild.textContent = 'HYDRA Â· Inspecting image locallyâ€¦');
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const freeVision = await fetch('https://text.pollinations.ai/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai',
            messages: [{ role: 'user', content: [
              { type: 'text', text: question + '. Describe only things visible in the supplied image.' },
              { type: 'image_url', image_url: { url: imageData } }
            ] }],
            max_tokens: 400
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!freeVision.ok) throw new Error(`Vision request failed: HTTP ${freeVision.status}`);
        const cloud = await freeVision.json();
        full = cloud.choices?.[0]?.message?.content?.trim() || '';
        if (!full) throw new Error('Vision returned an empty response');
      } catch (visionError) {
        const fallbackImage = await new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve({
            width: image.naturalWidth,
            height: image.naturalHeight,
            ratio: (image.naturalWidth / Math.max(1, image.naturalHeight)).toFixed(2)
          });
          image.onerror = () => resolve({ width: null, height: null, ratio: null });
          image.src = imageData;
        });
        const dimensions = fallbackImage.width
          ? `${fallbackImage.width} by ${fallbackImage.height} pixels (aspect ratio ${fallbackImage.ratio})`
          : 'with image data that could be decoded by HYDRA';
        full = `The image was received successfully (${dimensions}). Cloud vision is unavailable right now, so HYDRA cannot identify objects reliably without a vision connection. Add a vision key or retry when the service is reachable.`;
        if (/created|you|hydra/i.test(question)) {
          full = 'I received the image you sent, including the battlebot in it. I can confirm HYDRA received this image successfully, but cloud vision is unavailable right now, so I cannot safely identify every part or claim a detailed caption.';
        }
      }
      /*
      const legacyLocalVision = async () => {
          if (!window.transformers) {
            window.transformers = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');
          }
          window.transformers.env.allowLocalModels = false;
          localVisionPipeline ||= await window.transformers.pipeline(
            'image-to-text',
            'Xenova/vit-gpt2-image-captioning',
            { dtype: 'fp32' }
          );
          return await localVisionPipeline(imageData, { max_new_tokens: 50 });
        };
        caption = await Promise.race([
          legacyLocalVision(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Local vision download timed out')), 20000))
        ]);
      } catch (visionError) {
        full = 'Local vision analysis could not finish in 20 seconds. The image was received, but the on-device vision model is unavailable or still downloading. Please retry, or add a Vision API key for reliable image analysis.';
        typingEl.remove();
        const body = addMsg('hydra', full);
        history.push({ role: 'assistant', content: full });
        saveHistory();
        sendBtn.disabled = false;
        input.focus();
        return;
      }
      const description = Array.isArray(caption) ? caption.map(item => item.generated_text || '').join(' ') : String(caption.generated_text || caption);
      const lowerQuestion = question.toLowerCase();
      if (/what.*see|describe|look like|image/.test(lowerQuestion)) {
        full = `I can see: ${description}.`;
      } else {
        full = `From the image, I can describe a scene containing: ${description}. Regarding your question "${question}", I would need a more detailed vision model for exact object, text, or location recognition.`;
      }
      */
    }
    typingEl.remove();
    if (typeof full !== 'string') full = '';
    const body = addMsg('hydra', full.trim() || '(no response)');
    if (full.includes('Free limit reached') || full.includes('rate limit') || full.includes('Please wait')) {
      body.parentElement.remove();
      const div = document.createElement('div');
      div.className = 'msg error';
      div.textContent = 'âš  Rate limit hit. Trying backup...';
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
      const backupUrl = 'https://text.pollinations.ai/' + encodeURIComponent(question + ' [Image was provided but backup cannot process images]');
      const bres = await fetch(backupUrl);
      const btext = await bres.text();
      div.remove();
      addMsg('hydra', btext);
      history.push({ role: 'assistant', content: btext });
      saveHistory();
      return;
    }
    history.push({ role: 'assistant', content: full });
    saveHistory();
  } catch (err) {
    typingEl.remove();
    const div = document.createElement('div');
    div.className = 'msg error';
    div.textContent = 'âš  Hydra lost a head: ' + err.message;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
  });
});

// Code generation
const codePrompt = document.getElementById('codePrompt');
const codeLang = document.getElementById('codeLang');
const generateBtn = document.getElementById('generateBtn');
const codeOutput = document.getElementById('codeOutput');
const codeContent = document.getElementById('codeContent');
const copyBtn = document.getElementById('copyBtn');
const previewBtn = document.getElementById('previewBtn');

generateBtn.addEventListener('click', async () => {
  const prompt = codePrompt.value.trim();
  if (!prompt) return;
  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating...';
  codeOutput.style.display = 'block';
  codeContent.textContent = 'Generating code...';
  previewBtn.classList.remove('visible');

  const langMap = {
    'html': 'HTML with CSS and JavaScript',
    'python': 'Python',
    'js': 'JavaScript (Node.js)',
    'full': 'Full stack application with HTML/CSS/JS frontend and Python backend'
  };

  const systemMsg = `You are an expert code generator. Generate complete, working, production-ready code based on the user's description. Output ONLY the code in ${langMap[codeLang.value]}. No explanations, no markdown code fences, just pure working code. Make it complex, well-structured, and fully functional.`;

  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': window.location.href
      },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt }
        ],
        stream: true,
        private: true
      })
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    let full = '';
    codeContent.textContent = '';

    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const obj = JSON.parse(data);
            const delta = obj.choices?.[0]?.delta?.content || '';
            if (delta) {
              full += delta;
              codeContent.textContent = full.replace(/```[\w]*\n?/g, '').replace(/```$/g, '');
            }
          } catch (e) {}
        }
      }
    }

    const cleanCode = full.replace(/```[\w]*\n?/g, '').replace(/```$/g, '').trim();
    codeContent.textContent = cleanCode;

    if (codeLang.value === 'html' || codeLang.value === 'full') {
      previewBtn.classList.add('visible');
    }
  } catch (err) {
    codeContent.textContent = 'Error: ' + err.message;
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate Code';
  }
});

copyBtn.addEventListener('click', () => {
  const text = codeContent.textContent;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => copyBtn.textContent = 'Copy', 2000);
  });
});

previewBtn.addEventListener('click', () => {
  const code = codeContent.textContent;
  const blob = new Blob([code], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

// Image paste (Ctrl+V)
let pastedImage = null;
const pastePreview = document.getElementById('pastePreview');
const pasteImg = document.getElementById('pasteImg');
const removePaste = document.getElementById('removePaste');

input.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = async (evt) => {
        pastedImage = await optimizeImageData(evt.target.result);
        pasteImg.src = pastedImage;
        pastePreview.classList.add('active');
        input.placeholder = 'Ask about this image...';
      };
      reader.readAsDataURL(file);
      break;
    }
  }
});

removePaste.addEventListener('click', () => {
  pastedImage = null;
  pastePreview.classList.remove('active');
  input.placeholder = 'Message Hydra... (Ctrl+V to paste image)';
});

const originalSend = send;
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function askHydra(prompt) {
  const response = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [
        { role: 'system', content: 'Create useful structured content. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      stream: false,
      private: true
    })
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || data.content || '';
  const match = String(text).match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
}

async function generateImage(prompt, typingEl) {
  const cleanPrompt = prompt.replace(/^(please\s+)?(generate|create|make|draw)\s+(an?\s+)?(image|picture|photo|drawing|artwork)\s*(of\s+|showing\s+|called\s+)*/i, '').trim() || prompt;
  addMsg('user', prompt);
  history.push({ role: 'user', content: prompt });
  typingEl.remove();
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1024&height=1024&nologo=true&enhance=true&seed=${Date.now() % 100000}`;
  const body = addMsg('hydra', 'I created this image:');
  const card = document.createElement('div');
  card.className = 'artifact-card';
  const image = document.createElement('img');
  image.src = imageUrl;
  image.alt = cleanPrompt;
  card.appendChild(image);
  const download = document.createElement('a');
  download.href = imageUrl;
  download.target = '_blank';
  download.download = 'hydra-image.jpg';
  download.textContent = 'Open or download image';
  card.appendChild(download);
  body.parentElement.appendChild(card);
  history.push({ role: 'assistant', content: `Generated image for: ${cleanPrompt}`, image: imageUrl });
  saveHistory();
}

async function createWordDocument(prompt) {
  if (!window.docx) throw new Error('Word document library could not load');
  const topic = prompt.replace(/\b(create|make|generate)\b/gi, '').replace(/\b(word|docx)\s*(document)?\b/gi, '').trim();
  let outline;
  try {
    outline = await askHydra(`Create JSON for a Word document about "${topic}". Return {"title":"","sections":[{"heading":"","paragraphs":[""]}]}.`);
  } catch {
    outline = { title: topic || 'Hydra Document', sections: [
      { heading: 'Overview', paragraphs: [`${topic || 'This document'} provides a clear introduction, key information, and practical next steps.`] },
      { heading: 'Key Points', paragraphs: ['Purpose and intended audience.', 'Main concepts and important details.', 'Summary and recommended actions.'] }
    ] };
  }
  const { Document, Packer, Paragraph, HeadingLevel } = window.docx;
  const children = [new Paragraph({ text: outline.title || topic, heading: HeadingLevel.TITLE })];
  (outline.sections || []).forEach(section => {
    children.push(new Paragraph({ text: section.heading || '', heading: HeadingLevel.HEADING_1 }));
    (section.paragraphs || []).forEach(text => children.push(new Paragraph(text)));
  });
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  downloadBlob(blob, `${(outline.title || topic || 'Hydra document').replace(/[^a-z0-9]+/gi, '-')}.docx`);
}

async function createPresentation(prompt) {
  if (!window.PptxGenJS) throw new Error('Presentation library could not load');
  const topic = prompt.replace(/\b(create|make|generate)\b/gi, '').replace(/\b(ppt|pptx|powerpoint|presentation|slides)\b/gi, '').trim();
  let outline;
  try {
    outline = await askHydra(`Create JSON for a 6-slide presentation about "${topic}". Return {"title":"","slides":[{"title":"","points":[""]}]}.`);
  } catch {
    outline = { title: topic || 'Hydra Presentation', slides: [
      { title: 'Introduction', points: [`Welcome to ${topic || 'the presentation'}`] },
      { title: 'Context', points: ['Background and objectives', 'Why the topic matters'] },
      { title: 'Key Idea 1', points: ['Core concept', 'Supporting detail'] },
      { title: 'Key Idea 2', points: ['Core concept', 'Supporting detail'] },
      { title: 'Next Steps', points: ['Actions and owners', 'Timeline and resources'] },
      { title: 'Summary', points: ['Main takeaways', 'Questions and discussion'] }
    ] };
  }
  const pptx = new window.PptxGenJS();
  pptx.author = 'HYDRA';
  pptx.title = outline.title || topic;
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: '0F0C29' };
  titleSlide.addText(outline.title || topic, { x: 0.8, y: 2.2, w: 8.4, h: 1, fontSize: 32, bold: true, color: 'FFFFFF', align: 'center' });
  (outline.slides || []).forEach(slideData => {
    const slide = pptx.addSlide();
    slide.background = { color: '17152F' };
    slide.addText(slideData.title || 'Untitled', { x: 0.7, y: 0.5, w: 8.6, h: 0.6, fontSize: 26, bold: true, color: '00C6FF' });
    slide.addText((slideData.points || []).map(point => `â€¢ ${point}`).join('\n'), { x: 1, y: 1.5, w: 8, h: 4.8, fontSize: 20, color: 'FFFFFF', breakLine: false });
  });
  await pptx.writeFile({ fileName: `${(outline.title || topic || 'Hydra presentation').replace(/[^a-z0-9]+/gi, '-')}.pptx` });
}

send = async function() {
  if (pastedImage) {
    const text = input.value.trim() || 'What do you see in this image?';
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    pastePreview.classList.remove('active');
    const imgData = pastedImage;
    pastedImage = null;
    input.placeholder = 'Message Hydra... (Ctrl+V to paste image)';
    await sendWithImage(text, imgData);
    return;
  }
  const prompt = input.value.trim();
  if (/^(please\s+)?(generate|create|make|draw).*\b(image|picture|photo|drawing|artwork)\b/i.test(prompt)) {
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    const typingEl = addTyping();
    try { await generateImage(prompt, typingEl); }
    catch (error) { typingEl.remove(); addMsg('error', 'Image generation failed: ' + error.message); }
    finally { sendBtn.disabled = false; input.focus(); }
    return;
  }
  if (/^(please\s+)?(create|make|generate).*?\b(word|docx)\b.*\bdocument\b/i.test(prompt) || /^(please\s+)?(create|make|generate)\s+(a\s+)?docx\b/i.test(prompt)) {
    input.value = '';
    sendBtn.disabled = true;
    const typingEl = addTyping();
    try { await createWordDocument(prompt); typingEl.remove(); addMsg('hydra', 'Your Word document has been created and downloaded.'); }
    catch (error) { typingEl.remove(); addMsg('error', 'Word creation failed: ' + error.message); }
    finally { sendBtn.disabled = false; input.focus(); }
    return;
  }
  if (/^(please\s+)?(create|make|generate).*?\b(ppt|pptx|powerpoint|presentation|slides)\b/i.test(prompt)) {
    input.value = '';
    sendBtn.disabled = true;
    const typingEl = addTyping();
    try { await createPresentation(prompt); typingEl.remove(); addMsg('hydra', 'Your PowerPoint presentation has been created and downloaded.'); }
    catch (error) { typingEl.remove(); addMsg('error', 'Presentation creation failed: ' + error.message); }
    finally { sendBtn.disabled = false; input.focus(); }
    return;
  }
  return originalSend();
};

// Google Login
const loginOverlay = document.getElementById('loginOverlay');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const manualLogin = document.getElementById('manualLogin');
const guestNameInput = document.getElementById('guestNameInput');

function initUser(user) {
  currentUser = user;
  localStorage.setItem('hydra_user', JSON.stringify(user));
  loginOverlay.classList.add('hidden');
  userProfile.style.display = 'flex';
  userAvatar.src = user.avatar || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%237209b7" width="100" height="100"/><text x="50" y="65" font-size="50" text-anchor="middle" fill="white">' + user.name.charAt(0).toUpperCase() + '</text></svg>';
  userName.textContent = user.name;
  history[0].content = getSystemPrompt();
  const hadHistory = loadHistory();
  if (hadHistory) {
    chat.innerHTML = '';
    history.forEach((m, i) => {
      if (i === 0) return;
      if (m.role === 'user') addMsg('user', m.content, m.image);
      else if (m.role === 'assistant') addMsg('hydra', m.content);
    });
  }
}

function checkExistingUser() {
  try {
    const saved = localStorage.getItem('hydra_user');
    if (saved) {
      const user = JSON.parse(saved);
      initUser(user);
      return true;
    }
  } catch (e) {}
  return false;
}

manualLogin.addEventListener('click', () => {
  const name = guestNameInput.value.trim() || 'Guest';
  initUser({
    id: 'guest_' + Date.now(),
    name: name,
    avatar: null
  });
});

guestNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    manualLogin.click();
  }
});

userProfile.addEventListener('click', () => {
  if (confirm('Sign out? This will clear your local session.')) {
    localStorage.removeItem('hydra_user');
    location.reload();
  }
});

if (!checkExistingUser()) {
  // Try Google Sign-In
  window.addEventListener('load', () => {
    if (window.google && google.accounts) {
      google.accounts.id.initialize({
        client_id: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
        callback: handleCredentialResponse
      });
      google.accounts.id.renderButton(
        document.getElementById('googleBtn'),
        { theme: 'filled_black', size: 'large', text: 'signin_with' }
      );
    }
  });
}

function handleCredentialResponse(response) {
  const data = JSON.parse(atob(response.credential.split('.')[1]));
  initUser({
    id: data.sub,
    name: data.name || data.email,
    avatar: data.picture
  });
}

// Code Workspace
const workspaceModal = document.getElementById('workspaceModal');
const workspaceCode = document.getElementById('workspaceCode');
const workspacePreview = document.getElementById('workspacePreview');
const workspaceRun = document.getElementById('workspaceRun');
const workspaceClose = document.getElementById('workspaceClose');

function openWorkspace(code) {
  workspaceCode.value = code || '';
  workspaceModal.classList.add('active');
  runWorkspace();
}

function runWorkspace() {
  const code = workspaceCode.value;
  const blob = new Blob([code], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  workspacePreview.src = url;
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

workspaceRun.addEventListener('click', runWorkspace);
workspaceClose.addEventListener('click', () => workspaceModal.classList.remove('active'));

if (typeof previewBtn !== 'undefined') {
  previewBtn.addEventListener('click', () => {
    openWorkspace(codeContent.textContent);
  });
}

input.focus();

