/**
 * ⚡ PROMPTCRAFT // VR DEVELOPMENTS
 * Pure Prompt Engineering & Generator Terminal
 * 100% Client-Side Compatible (Works directly on GitHub Pages & Local Servers)
 * 
 * Powered by Groq LPUs (openai/gpt-oss-120b & openai/gpt-oss-20b)
 */

(function () {
  'use strict';

  // Strict Prompt-Only System Prompt (Single Master Prompt, No Multi-file Splitting)
  const PROMPTCRAFT_SYSTEM = `You are PromptCraft, an elite AI Prompt Engineering System developed by VR DEVELOPMENTS.

YOUR SOLE MISSION:
Transform the user's idea, topic, goal, or requirements into ONE comprehensive, world-class Master Prompt ready for use in ChatGPT, Claude, Cursor, v0, Gemini, etc.

CRITICAL RULES:
1. CASUAL / POLITE INPUT (e.g. "thanks", "cool tq", "hi", "awesome", "ok", "got it", "hello"):
   - Respond naturally in 1 short, warm sentence: "You're welcome! Whenever you're ready, drop your next topic or idea to craft another prompt."
   - Do NOT format casual replies as a prompt or wrap them in code blocks.

2. FOR PROMPTS (Topics, Tasks, Ideas, Projects):
   - Output ONE unified Master Prompt directly in structured markdown.
   - Organize the prompt cleanly with:
     * **Role & Objective**: High-level persona and core mission.
     * **Scope & Core Requirements**: Specific features, interactions, and edge cases.
     * **Design & UX Guidelines**: Visual aesthetic, layout, responsive breakpoints (mobile/tablet/desktop), typography, and color palette.
     * **Technical Architecture & Deliverables**: Specify file structure (e.g. index.html, styles.css, main.js) in clean bullet points.
     * **Constraints & Code Quality**: Accessibility (WCAG AA), performance, SEO, modular clean code.
     * **Output Format**: Instruct the target AI to deliver complete, production-ready, non-truncated code for all files.
   - CRITICAL RESTRICTION:
     * NEVER output dummy code blocks (e.g., DO NOT output \`\`\`html <!DOCTYPE html>...\`\`\` or \`\`\`css :root {...}\`\`\`) inside your prompt!
     * You are writing the PROMPT for another AI to execute, not writing the code snippets yourself.
     * Output ONLY the pure prompt markdown. Zero conversational filler, zero strategy tips, zero preamble.`;

  // Live Groq Production Models
  const GROQ_MODELS = [
    { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT-OSS 120B', speed: '~500 tok/s', context: '131k', desc: 'Flagship open model on Groq Developer Tier (Default).' },
    { id: 'openai/gpt-oss-20b', name: 'OpenAI GPT-OSS 20B', speed: '~1000 tok/s', context: '131k', desc: 'Ultra-fast 20B reasoning model (~1000 tok/s).' },
    { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', speed: '~450 tok/s', context: '131k', desc: 'Alibaba Cloud high-capability model.' },
    { id: 'minimaxai/minimax-m2.7', name: 'MiniMax M2.7', speed: '~260 tok/s', context: '196k', desc: 'Large context model.' }
  ];

  // Retired models: migrate away from these
  const RETIRED_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'llama3-70b-8192',
    'llama3-8b-8192',
    'llama2-70b-4096'
  ];

  let savedModel = localStorage.getItem('groq_model');
  if (!savedModel || RETIRED_MODELS.includes(savedModel) || savedModel.includes('llama')) {
    savedModel = 'openai/gpt-oss-120b';
    localStorage.setItem('groq_model', 'openai/gpt-oss-120b');
  }

  // State
  const state = {
    apiKey: localStorage.getItem('groq_api_key') || '',
    activeModel: savedModel,
    theme: localStorage.getItem('groq_theme') || 'dark',
    systemPrompt: PROMPTCRAFT_SYSTEM,
    sessions: JSON.parse(localStorage.getItem('promptcraft_sessions') || '[]'),
    currentSessionId: null,
    cmdHistory: JSON.parse(localStorage.getItem('promptcraft_history') || '[]'),
    cmdHistoryIndex: -1,
    isStreaming: false,
    abortController: null,
    isDemoMode: localStorage.getItem('groq_demo') === 'true',
    accessibleModels: [],
    failedAttempts: new Set()
  };

  // DOM Elements
  const terminalScreen = document.getElementById('terminal-screen');
  const inputEl = document.getElementById('terminal-input');
  const sendBtn = document.getElementById('send-btn');
  const stopBtn = document.getElementById('stop-btn');
  const historyToggleBtn = document.getElementById('history-toggle-btn');
  const historyDrawer = document.getElementById('history-drawer');
  const historyBackdrop = document.getElementById('drawer-backdrop');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const newChatBtn = document.getElementById('new-chat-btn');
  const historyList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const statusDot = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');
  const headerModel = document.getElementById('header-model');

  // ==========================================================================
  // Markdown & Syntax Formatter
  // ==========================================================================
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightTokens(code) {
    const escaped = escapeHtml(code);
    return escaped
      .replace(/(#.*$|\/\/.*$)/gm, '<span class="hl-cmt">$1</span>')
      .replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span class="hl-str">$1</span>')
      .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hl-num">$1</span>')
      .replace(/\b(def|class|return|import|from|function|const|let|var|async|await|try|catch|except|if|elif|else|for|while|in|yield|export|default|None|True|False|true|false)\b/g, '<span class="hl-kw">$1</span>');
  }

  // Cache for prompt copying & code blocks
  window._masterPrompts = {};
  window._codeCache = [];

  function isCasualGreeting(text) {
    if (!text) return false;
    const clean = text.trim();
    if (clean.length > 280) return false;
    // If it has prompt structure headers, it is definitely NOT casual
    if (/#+\s*(role|objective|instructions|rules|prompt|deliverables|system|architecture)/i.test(clean)) return false;
    if (/\b(you are a|act as a|as a senior|objective:|rules:|technology stack:)\b/i.test(clean)) return false;

    // Common conversational replies from PromptCraft
    const casualPatterns = [
      /^you'?re welcome/i,
      /^welcome/i,
      /^no problem/i,
      /^glad to help/i,
      /^happy to help/i,
      /^anytime/i,
      /^hello/i,
      /^hi\b/i,
      /^hey\b/i,
      /drop (your )?(next )?(topic|idea)/i,
      /ready to craft/i,
      /how can i help/i,
      /what would you like/i
    ];
    return casualPatterns.some(p => p.test(clean));
  }

  function stripOuterFence(raw) {
    let s = (raw || '').trim();
    // Strip complete enclosing 3 or 4 backticks if present
    const fullMatch = s.match(/^(`{3,})[a-zA-Z0-9_\-\+]*\r?\n([\s\S]*?)\r?\n\1$/);
    if (fullMatch) {
      return fullMatch[2].trim();
    }
    // Strip leading fence if present
    s = s.replace(/^`{3,}[a-zA-Z0-9_\-\+]*\r?\n/, '');
    // Strip trailing fence if present
    s = s.replace(/\r?\n`{3,}$/, '');
    return s.trim();
  }

  function renderMarkdown(md) {
    if (!md) return '';

    const codeBlocks = [];

    // Fenced Code Block matching: standard triple backticks for code blocks inside prompts
    let text = md.replace(/```([a-zA-Z0-9_\-\+]*)\r?\n([\s\S]*?)```/g, function (match, lang, code) {
      const id = codeBlocks.length;
      lang = (lang || '').trim();
      const cleanCode = code.replace(/\n$/, '');

      // Sub-code blocks inside prompts are labeled with their language (HTML, CSS, JS, etc.)
      const blockTitle = lang ? lang.toUpperCase() : 'CODE';
      const copyBtnLabel = '📋 Copy Code';

      codeBlocks.push({
        raw: cleanCode,
        lang: lang,
        html: `
          <div class="code-wrap">
            <div class="code-bar">
              <span class="code-lang">${escapeHtml(blockTitle)}</span>
              <button class="code-copy-btn" onclick="window.copyCodeSnippet(${id}, this)">${copyBtnLabel}</button>
            </div>
            <pre class="code-content"><code>${highlightTokens(cleanCode)}</code></pre>
          </div>
        `
      });
      return `@@CODE_${id}@@`;
    });

    window._codeCache = codeBlocks;

    // Blockquotes
    text = text.replace(/^>\s*(.*?)$/gm, '<blockquote>$1</blockquote>');

    // Headers
    text = text.replace(/^####\s+(.*?)$/gm, '<h4>$1</h4>');
    text = text.replace(/^###\s+(.*?)$/gm, '<h3>$1</h3>');
    text = text.replace(/^##\s+(.*?)$/gm, '<h2>$1</h2>');
    text = text.replace(/^#\s+(.*?)$/gm, '<h1>$1</h1>');

    // Horizontal Rule
    text = text.replace(/^---$/gm, '<hr style="border: 0; border-top: 1px dashed var(--border); margin: 10px 0;">');

    // Inline formatting
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--prompt-color);">$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');

    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Lists
    text = text.replace(/^\s*[\*\-]\s+(.*?)$/gm, '<li>$1</li>');
    text = text.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');
    text = text.replace(/^\s*\d+\.\s+(.*?)$/gm, '<li>$1</li>');

    // Tables
    text = text.replace(/((?:\|[^\n]+\|\r?\n)+)/g, function (tableMatch) {
      const rows = tableMatch.trim().split('\n');
      if (rows.length < 2) return tableMatch;
      let html = '<table>';
      let isHeader = true;
      for (const r of rows) {
        if (/^\|?\s*[-:]+[-| :]*\s*\|?$/.test(r)) {
          isHeader = false;
          continue;
        }
        const cols = r.split('|').filter((c, i, a) => i !== 0 && i !== a.length - 1);
        if (cols.length === 0) continue;
        html += '<tr>';
        const tag = isHeader ? 'th' : 'td';
        for (const col of cols) {
          html += `<${tag}>${col.trim()}</${tag}>`;
        }
        html += '</tr>';
        if (isHeader) isHeader = false;
      }
      html += '</table>';
      return html;
    });

    // Paragraphs
    text = text.replace(/\n\n+/g, '</p><p>');
    text = `<p>${text}</p>`.replace(/<p><\/p>/g, '');

    // Restore code blocks
    text = text.replace(/@@CODE_(\d+)@@/g, function (m, id) {
      return codeBlocks[parseInt(id, 10)] ? codeBlocks[parseInt(id, 10)].html : '';
    });

    return text;
  }

  // Master Prompt Card & Chat Entry Renderer
  function renderAIEntryContent(rawContent, entryId, isLiveStream = false) {
    if (!rawContent) {
      return isLiveStream ? '<span class="term-cursor"></span>' : '';
    }

    // 1. Casual Chat handling: simple friendly message without prompt card
    if (isCasualGreeting(rawContent)) {
      return `<div class="chat-reply-bubble">${renderMarkdown(rawContent)}${isLiveStream ? '<span class="term-cursor"></span>' : ''}</div>`;
    }

    // 2. PromptCraft Master Prompt handling: exactly ONE unified Master Prompt Card
    const cleanPrompt = stripOuterFence(rawContent);
    const cardId = 'prompt_card_' + entryId;
    window._masterPrompts[cardId] = cleanPrompt;

    const renderedBody = renderMarkdown(cleanPrompt);
    const cursorHtml = isLiveStream ? '<span class="term-cursor"></span>' : '';

    return `
      <div class="master-prompt-card" id="${cardId}">
        <div class="master-prompt-header">
          <div class="prompt-badge">
            <span class="prompt-icon">🎯</span>
            <span class="prompt-title">MASTER PROMPT</span>
          </div>
          <button class="master-copy-btn" onclick="window.copyMasterPrompt('${cardId}', this)">
            📋 Copy Prompt
          </button>
        </div>
        <div class="master-prompt-body">
          ${renderedBody}${cursorHtml}
        </div>
        ${!isLiveStream ? `
          <div class="master-prompt-footer">
            <span class="prompt-footer-hint">⚡ VR DEVELOPMENTS // Ready to paste into ChatGPT, Claude, Cursor, v0</span>
            <button class="master-copy-btn" onclick="window.copyMasterPrompt('${cardId}', this)">
              📋 Copy Prompt
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Copy Master Prompt with instant "✔ Prompt Copied!" feedback
  window.copyMasterPrompt = function (cardId, btn) {
    const raw = window._masterPrompts[cardId];
    if (!raw) return;

    navigator.clipboard.writeText(raw).then(() => {
      const card = document.getElementById(cardId);
      if (card) {
        card.querySelectorAll('.master-copy-btn').forEach(b => {
          const original = '📋 Copy Prompt';
          b.innerHTML = '✔ Prompt Copied!';
          b.classList.add('copied');
          setTimeout(() => {
            b.innerHTML = original;
            b.classList.remove('copied');
          }, 2200);
        });
      }
    }).catch(() => {
      btn.innerHTML = '✔ Copied!';
    });
  };

  // Copy individual sub-code snippet
  window.copyCodeSnippet = function (id, btn) {
    if (window._codeCache && window._codeCache[id]) {
      const block = window._codeCache[id];
      navigator.clipboard.writeText(block.raw).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '✔ Code Copied!';
        btn.style.color = 'var(--success)';
        btn.style.borderColor = 'var(--success)';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.style.color = '';
          btn.style.borderColor = '';
        }, 2000);
      }).catch(() => {
        btn.innerHTML = '✔ Copied!';
      });
    }
  };

  // ==========================================================================
  // Terminal Rendering
  // ==========================================================================
  function scrollToBottom() {
    terminalScreen.scrollTop = terminalScreen.scrollHeight;
  }

  function getTimeStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function appendUserEntry(text) {
    const entry = document.createElement('div');
    entry.className = 'log-entry entry-user';
    entry.innerHTML = `
      <div class="entry-head">
        <span>user ❯</span>
        <span class="entry-time">[${getTimeStr()}]</span>
      </div>
      <div class="entry-body">${escapeHtml(text)}</div>
    `;
    terminalScreen.appendChild(entry);
    scrollToBottom();
  }

  function appendSystemNotice(title, htmlContent, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry entry-system ${type}`;
    entry.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 2px;">${title}</div>
      <div>${htmlContent}</div>
    `;
    terminalScreen.appendChild(entry);
    scrollToBottom();
  }

  function createAIEntry(modelId) {
    const entry = document.createElement('div');
    entry.className = 'log-entry entry-ai';
    entry.innerHTML = `
      <div class="entry-head">
        <span>PromptCraft ❯</span>
        <span class="entry-time">[${getTimeStr()}]</span>
      </div>
      <div class="entry-body">
        <span class="term-cursor"></span>
      </div>
      <div class="entry-stats" style="display: none;"></div>
    `;
    terminalScreen.appendChild(entry);
    scrollToBottom();

    const bodyEl = entry.querySelector('.entry-body');
    const statsEl = entry.querySelector('.entry-stats');
    return { entry, bodyEl, statsEl };
  }

  // ==========================================================================
  // Dynamic Groq Account Model Discovery
  // ==========================================================================
  async function discoverAccountModels() {
    if (!state.apiKey) return [];
    
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${state.apiKey}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        const chatModels = data.data
          .map(m => m.id)
          .filter(id => !id.includes('whisper') && !id.includes('guard'));
        state.accessibleModels = chatModels;
        return chatModels;
      }
    } catch (e) {}

    try {
      const resp = await fetch('/api/models', {
        headers: { 'Authorization': `Bearer ${state.apiKey}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.data) {
          const chatModels = data.data
            .map(m => m.id)
            .filter(id => !id.includes('whisper') && !id.includes('guard'));
          state.accessibleModels = chatModels;
          return chatModels;
        }
      }
    } catch (e) {}

    return [];
  }

  // ==========================================================================
  // Sessions & History Management
  // ==========================================================================
  function saveSessions() {
    localStorage.setItem('promptcraft_sessions', JSON.stringify(state.sessions));
    renderHistoryDrawer();
  }

  function getCurrentSession() {
    return state.sessions.find(s => s.id === state.currentSessionId);
  }

  function startNewSession() {
    const newSession = {
      id: 'craft_' + Date.now(),
      title: 'New Prompt Craft',
      model: state.activeModel,
      createdAt: new Date().toISOString(),
      messages: []
    };
    state.sessions.unshift(newSession);
    state.currentSessionId = newSession.id;
    saveSessions();

    terminalScreen.innerHTML = '';
    renderWelcome();
    closeDrawer();
    inputEl.focus();
  }

  function loadSession(sessionId) {
    const s = state.sessions.find(x => x.id === sessionId);
    if (!s) return;

    state.currentSessionId = s.id;
    terminalScreen.innerHTML = '';
    renderWelcome();

    s.messages.forEach(m => {
      if (m.role === 'user') {
        appendUserEntry(m.content);
      } else if (m.role === 'assistant') {
        const { bodyEl, statsEl } = createAIEntry(s.model);
        const entryId = 'hist_' + Math.random().toString(36).substring(2, 9);
        bodyEl.innerHTML = renderAIEntryContent(m.content, entryId, false);
        if (m.stats) {
          statsEl.style.display = 'flex';
          statsEl.innerHTML = `
            <span>⚡ <span class="speed-tag">${m.stats.speed}</span></span>
            <span>• ${m.stats.tokens} tokens</span>
            <span>• ${m.stats.time}s</span>
          `;
        }
      }
    });

    closeDrawer();
    saveSessions();
    inputEl.focus();
  }

  function deleteSession(sessionId, e) {
    if (e) e.stopPropagation();
    state.sessions = state.sessions.filter(s => s.id !== sessionId);
    if (state.currentSessionId === sessionId) {
      if (state.sessions.length > 0) {
        loadSession(state.sessions[0].id);
      } else {
        startNewSession();
      }
    } else {
      saveSessions();
    }
  }

  function clearAllSessions() {
    if (confirm('Clear all saved prompt sessions?')) {
      state.sessions = [];
      localStorage.removeItem('promptcraft_sessions');
      startNewSession();
    }
  }

  function renderHistoryDrawer() {
    historyList.innerHTML = '';
    if (state.sessions.length === 0) {
      historyList.innerHTML = `<div class="history-empty">No crafted prompts saved yet.</div>`;
      return;
    }

    state.sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = `history-item ${s.id === state.currentSessionId ? 'active' : ''}`;
      
      const date = new Date(s.createdAt);
      const timeStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

      item.innerHTML = `
        <div class="history-item-info">
          <span class="history-item-title">🎯 ${escapeHtml(s.title || 'Prompt')}</span>
          <span class="history-item-meta">${timeStr} • ${s.messages.length} prompts</span>
        </div>
        <button class="history-item-delete" title="Delete">&times;</button>
      `;

      item.onclick = () => loadSession(s.id);
      item.querySelector('.history-item-delete').onclick = (e) => deleteSession(s.id, e);
      historyList.appendChild(item);
    });
  }

  function openDrawer() {
    renderHistoryDrawer();
    historyDrawer.classList.add('open');
    historyBackdrop.classList.add('open');
  }

  function closeDrawer() {
    historyDrawer.classList.remove('open');
    historyBackdrop.classList.remove('open');
  }

  // ==========================================================================
  // Terminal Commands
  // ==========================================================================
  async function handleCommand(raw) {
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    switch (cmd) {
      case '/help':
        appendSystemNotice(
          '⚡ PROMPTCRAFT COMMANDS',
          `<table>
            <tr><th>Command</th><th>Description</th></tr>
            <tr><td><code>/help</code></td><td>Show this command reference</td></tr>
            <tr><td><code>/craft &lt;idea&gt;</code></td><td>Craft a single unified master prompt</td></tr>
            <tr><td><code>/types</code></td><td>Pick prompt archetype: Coding, Midjourney, Marketing, System Persona</td></tr>
            <tr><td><code>/key &lt;key&gt;</code></td><td>Set your Groq API key (starts with <code>gsk_</code>)</td></tr>
            <tr><td><code>/key</code></td><td>Show current API key status</td></tr>
            <tr><td><code>/key clear</code></td><td>Remove stored API key</td></tr>
            <tr><td><code>/new</code></td><td>Start a fresh prompt crafting session</td></tr>
            <tr><td><code>/history</code></td><td>Open your saved prompt library</td></tr>
            <tr><td><code>/models</code></td><td>Show available Groq models</td></tr>
            <tr><td><code>/model &lt;id&gt;</code></td><td>Switch inference model</td></tr>
            <tr><td><code>/theme &lt;name&gt;</code></td><td>Switch theme: <code>dark</code>, <code>matrix</code>, <code>cyberpunk</code>, <code>amber</code>, <code>dracula</code></td></tr>
            <tr><td><code>/export</code></td><td>Download current prompt transcript as Markdown (.md)</td></tr>
            <tr><td><code>/clear</code></td><td>Clear terminal screen</td></tr>
          </table>`
        );
        break;

      case '/clear':
      case '/cls':
        terminalScreen.innerHTML = '';
        renderWelcome();
        break;

      case '/new':
        startNewSession();
        break;

      case '/types':
        appendSystemNotice(
          '🎯 PROMPT ARCHETYPES',
          `<div>Select or click one of the following prompt styles for your idea:</div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
            <button class="header-btn" onclick="window.typeCommand('Craft an elite coding prompt for ')">💻 Code & Architecture</button>
            <button class="header-btn" onclick="window.typeCommand('Craft a photorealistic Midjourney v6 prompt for ')">🎨 Midjourney Image</button>
            <button class="header-btn" onclick="window.typeCommand('Craft an executive marketing prompt for ')">📈 Marketing & Copy</button>
            <button class="header-btn" onclick="window.typeCommand('Craft an advanced system persona prompt for ')">🧠 System Persona</button>
            <button class="header-btn" onclick="window.typeCommand('Craft an academic research prompt for ')">🔬 Research / Academic</button>
          </div>`
        );
        break;

      case '/craft':
        if (arg) {
          inputEl.value = `Craft a prompt for: ${arg}`;
          sendMessage(false);
        } else {
          appendSystemNotice('PROMPTCRAFT USAGE', 'Usage: <code>/craft &lt;topic or idea&gt;</code><br>Example: <code>/craft website for VR DEVELOPMENTS</code>');
        }
        break;

      case '/history':
        if (arg === 'clear') {
          clearAllSessions();
        } else if (arg) {
          const match = state.sessions.find(s => s.id === arg || s.id.includes(arg));
          if (match) loadSession(match.id);
          else appendSystemNotice('ERROR', `Session not found: ${escapeHtml(arg)}`, 'error');
        } else {
          openDrawer();
          let listHtml = '<ul>';
          state.sessions.slice(0, 5).forEach(s => {
            listHtml += `<li><b>${escapeHtml(s.title)}</b> <small style="color:var(--text-dim);">[${s.id}]</small></li>`;
          });
          listHtml += '</ul><div style="margin-top:6px; font-size:11px; color:var(--text-dim);">Prompt library opened in right drawer. Type <code>/new</code> to start a fresh prompt.</div>';
          appendSystemNotice('📜 SAVED PROMPT SESSIONS', listHtml);
        }
        break;

      case '/key':
        if (arg === 'clear' || arg === 'remove') {
          state.apiKey = '';
          localStorage.removeItem('groq_api_key');
          updateStatus();
          appendSystemNotice('KEY REMOVED', 'Groq API Key cleared from browser storage.');
        } else if (arg) {
          await setApiKey(arg);
        } else {
          if (state.apiKey) {
            const masked = `${state.apiKey.slice(0, 4)}...${state.apiKey.slice(-4)}`;
            appendSystemNotice('🔑 API KEY STATUS', `Active key configured: <code>${masked}</code>.<br>To change, paste your key or type: <code>/key &lt;new_key&gt;</code>.`);
          } else {
            appendSystemNotice('🔑 API KEY CONFIGURATION', `No Groq API Key set yet.<br>Just paste your key starting with <code>gsk_...</code> into the input box below!<br>👉 Free key at <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a>`);
          }
        }
        break;

      case '/theme':
        if (arg) {
          setTheme(arg.toLowerCase());
        } else {
          appendSystemNotice('🎨 THEMES', `Current theme: <b>${state.theme}</b><br>Available: <code>dark</code>, <code>matrix</code>, <code>cyberpunk</code>, <code>amber</code>, <code>dracula</code><br>Usage: <code>/theme matrix</code>`);
        }
        break;

      case '/themes':
        appendSystemNotice('🎨 AVAILABLE THEMES', `
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
            <button class="header-btn" onclick="window.setTheme('dark')">Dark (Default)</button>
            <button class="header-btn" onclick="window.setTheme('matrix')">Matrix Green</button>
            <button class="header-btn" onclick="window.setTheme('cyberpunk')">Cyberpunk</button>
            <button class="header-btn" onclick="window.setTheme('amber')">Amber CRT</button>
            <button class="header-btn" onclick="window.setTheme('dracula')">Dracula</button>
          </div>
        `);
        break;

      case '/models':
        await showModelsList();
        break;

      case '/model':
        if (arg) {
          state.activeModel = arg;
          localStorage.setItem('groq_model', arg);
          headerModel.textContent = arg;
          appendSystemNotice('MODEL SWITCHED', `Switched active inference model to: <code>${escapeHtml(arg)}</code>`, 'success');
        } else {
          appendSystemNotice('MODEL USAGE', `Current Model: <code>${state.activeModel}</code><br>Usage: <code>/model &lt;id&gt;</code> or type <code>/models</code> to see what your key supports.`);
        }
        break;

      case '/demo':
        state.isDemoMode = !state.isDemoMode;
        localStorage.setItem('groq_demo', state.isDemoMode);
        updateStatus();
        appendSystemNotice('DEMO MODE', `Simulated demo mode is now <b>${state.isDemoMode ? 'ENABLED' : 'DISABLED'}</b>.`);
        break;

      case '/export':
        exportSession();
        break;

      default:
        appendSystemNotice('UNKNOWN COMMAND', `Command <code>${escapeHtml(cmd)}</code> not recognized. Type <code>/help</code> for available commands.`, 'error');
        break;
    }
  }

  // ==========================================================================
  // Display Live Model Catalog
  // ==========================================================================
  async function showModelsList() {
    let mHtml = '<table><tr><th>Model ID</th><th>Speed</th><th>Switch</th></tr>';
    
    if (state.apiKey) {
      const liveModels = await discoverAccountModels();
      if (liveModels.length > 0) {
        liveModels.forEach(mId => {
          const isAct = mId === state.activeModel ? ' <b style="color:var(--success);">[ACTIVE]</b>' : '';
          mHtml += `
            <tr>
              <td><code>${escapeHtml(mId)}</code>${isAct}</td>
              <td><span style="color:var(--success);">✔ Active</span></td>
              <td><button class="code-copy-btn" onclick="window.switchModel('${escapeHtml(mId)}')">Select</button></td>
            </tr>
          `;
        });
        mHtml += '</table>';
        appendSystemNotice('🤖 ACCESSIBLE GROQ MODELS', mHtml);
        return;
      }
    }

    GROQ_MODELS.forEach(m => {
      const isAct = m.id === state.activeModel ? ' <b style="color:var(--success);">[ACTIVE]</b>' : '';
      mHtml += `
        <tr>
          <td><code>${m.id}</code>${isAct}</td>
          <td>${m.speed}</td>
          <td><button class="code-copy-btn" onclick="window.switchModel('${m.id}')">Select</button></td>
        </tr>
      `;
    });
    mHtml += '</table>';
    appendSystemNotice('🤖 CURRENT GROQ MODELS', mHtml);
  }

  window.switchModel = function (id) {
    state.activeModel = id;
    localStorage.setItem('groq_model', id);
    headerModel.textContent = id;
    appendSystemNotice('MODEL SWITCHED', `Switched active inference model to: <code>${escapeHtml(id)}</code>`, 'success');
  };

  // ==========================================================================
  // API Key & Model Handlers
  // ==========================================================================
  async function setApiKey(key) {
    key = key.trim();
    appendSystemNotice('AUTHENTICATING', 'Validating Groq API key with remote LPU servers...');
    
    let success = false;

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      if (resp.ok) {
        success = true;
      }
    } catch (e) {}

    if (!success) {
      try {
        const resp = await fetch('/api/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (resp.ok) success = true;
      } catch (e) {}
    }

    if (success || key.startsWith('gsk_')) {
      state.apiKey = key;
      state.isDemoMode = false;
      localStorage.setItem('groq_api_key', key);
      localStorage.setItem('groq_demo', 'false');

      if (RETIRED_MODELS.includes(state.activeModel) || state.activeModel.includes('llama')) {
        state.activeModel = 'openai/gpt-oss-120b';
        localStorage.setItem('groq_model', 'openai/gpt-oss-120b');
      }

      updateStatus();
      appendSystemNotice(
        'AUTHENTICATION SUCCESS',
        `✔ Connected to Groq! Active model: <code>${state.activeModel}</code>.<br>` +
        `PromptCraft is ready! Tell me your topic or idea to generate the prompt.`,
        'success'
      );
    } else {
      appendSystemNotice('AUTH FAILED', 'Invalid API key or network error. Check key at console.groq.com/keys', 'error');
    }
  }

  function setTheme(name) {
    const valid = ['dark', 'matrix', 'cyberpunk', 'amber', 'dracula'];
    if (!valid.includes(name)) return;
    state.theme = name;
    localStorage.setItem('groq_theme', name);
    document.body.setAttribute('data-theme', name);
    appendSystemNotice('THEME CHANGED', `Theme set to <b>${name}</b>.`);
  }
  window.setTheme = setTheme;

  function updateStatus() {
    if (state.apiKey && !state.isDemoMode) {
      statusDot.className = 'status-dot active';
      statusLabel.textContent = 'groq online';
    } else {
      statusDot.className = 'status-dot';
      statusLabel.textContent = 'demo mode';
    }
    headerModel.textContent = state.activeModel;
  }

  function exportSession() {
    const s = getCurrentSession();
    if (!s || s.messages.length === 0) {
      appendSystemNotice('EXPORT', 'Nothing to export in this session.', 'error');
      return;
    }

    let md = `# ${s.title}\n*Crafted with PromptCraft by VR DEVELOPMENTS: ${new Date().toLocaleString()}*\n\n---\n\n`;
    s.messages.forEach(m => {
      md += `### ${m.role === 'user' ? 'User Idea' : '🎯 PromptCraft Master Prompt'}\n\n${m.content}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promptcraft-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    appendSystemNotice('EXPORT COMPLETE', 'Prompt library exported as Markdown (.md).');
  }

  // ==========================================================================
  // Chat Execution & Streaming (Prompt-Only Clean Output)
  // ==========================================================================
  async function sendMessage(isRetry = false) {
    if (state.isStreaming) return;
    const text = isRetry ? (state.lastUserText || '') : inputEl.value.trim();
    if (!text) return;

    // Automatically detect pasted API key
    if (!isRetry && text.includes('gsk_')) {
      const match = text.match(/gsk_[a-zA-Z0-9_-]+/);
      if (match) {
        inputEl.value = '';
        appendSystemNotice('🔑 API KEY DETECTED', `Detected Groq API Key: <code>${match[0].slice(0, 4)}...${match[0].slice(-4)}</code>. Authenticating...`);
        await setApiKey(match[0]);
        return;
      }
    }

    if (RETIRED_MODELS.includes(state.activeModel) || state.activeModel.includes('llama')) {
      state.activeModel = 'openai/gpt-oss-120b';
      localStorage.setItem('groq_model', 'openai/gpt-oss-120b');
      headerModel.textContent = state.activeModel;
    }

    if (!isRetry) {
      state.lastUserText = text;
      state.failedAttempts.clear();
      inputEl.value = '';
      inputEl.style.height = '40px';
      inputEl.style.overflowY = 'hidden';

      state.cmdHistory.push(text);
      if (state.cmdHistory.length > 50) state.cmdHistory.shift();
      localStorage.setItem('promptcraft_history', JSON.stringify(state.cmdHistory));
      state.cmdHistoryIndex = -1;

      if (text.startsWith('/')) {
        await handleCommand(text);
        return;
      }

      let session = getCurrentSession();
      if (!session) {
        startNewSession();
        session = getCurrentSession();
      }

      if (session.messages.length === 0) {
        session.title = text.length > 30 ? text.slice(0, 30) + '...' : text;
        saveSessions();
      }

      appendUserEntry(text);
      session.messages.push({ role: 'user', content: text });
    }

    const session = getCurrentSession();

    if (!state.apiKey && !state.isDemoMode) {
      appendSystemNotice(
        '🔑 NO API KEY CONFIGURED',
        `Paste your Groq API key (starts with <code>gsk_...</code>) directly into the prompt box below, or type:<br>
        <code>/key &lt;your_groq_api_key&gt;</code> (Get one at <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a>)<br>
        <i>Or type <code>/demo</code> to test with simulated responses!</i>`,
        'error'
      );
      return;
    }

    state.isStreaming = true;
    sendBtn.style.display = 'none';
    stopBtn.style.display = 'inline-flex';

    const { entry, bodyEl, statsEl } = createAIEntry(state.activeModel);
    state.abortController = new AbortController();

    const startTime = performance.now();
    let accumulated = '';
    let tokenCount = 0;

    // SIMULATED DEMO RESPONSE (Clean, single master prompt only)
    if (!state.apiKey || state.isDemoMode) {
      let demoPrompt = '';
      if (isCasualGreeting(text) || ['hi', 'hello', 'hey', 'cool tq', 'thanks', 'tq', 'thank you'].includes(text.toLowerCase())) {
        demoPrompt = "You're welcome! Whenever you're ready, drop your next topic or idea to craft another prompt.";
      } else {
        demoPrompt = `You are a Principal Software Architect and Senior Front-End Engineer.

**Objective**
Design and implement a complete, production-ready, high-converting portfolio website for a creative professional.

**Core Requirements**
1. Semantic, accessible HTML5 layout meeting WCAG AA contrast and screen-reader standards.
2. Clean modular CSS3 variables for theme customization, responsive breakpoints (mobile <= 480px, tablet 481-768px, desktop >= 769px), and fluid flex/grid layouts.
3. Vanilla JavaScript for smooth-scroll navigation, responsive hamburger menu, project filtering, and client-side contact form validation with visual feedback.

**Architecture & Deliverables**
- \`index.html\`: Complete semantic layout including Hero, About, Skills, Projects gallery, and Contact form.
- \`styles.css\`: Modern CSS system with cohesive dark palette, smooth transitions, and responsive media queries.
- \`main.js\`: Modular event handlers, clean state management, and interaction logic.
- \`README.md\`: Quick start instructions and project summary.

**Execution Standards**
Deliver the complete, fully functional source code for each file ready for direct deployment. Do not use placeholders, omissions, or pseudo-code.`;
      }

      const words = demoPrompt.split(' ');
      const demoId = 'demo_' + Date.now();

      for (let i = 0; i < words.length; i++) {
        if (!state.isStreaming) break;
        accumulated += (i === 0 ? '' : ' ') + words[i];
        tokenCount++;
        bodyEl.innerHTML = renderAIEntryContent(accumulated, demoId, true);
        scrollToBottom();
        await new Promise(r => setTimeout(r, 16));
      }

      bodyEl.innerHTML = renderAIEntryContent(accumulated, demoId, false);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      const spd = Math.round(tokenCount / Math.max(0.1, elapsed));
      statsEl.style.display = 'flex';
      statsEl.innerHTML = `
        <span>⚡ <span class="speed-tag">${spd} tok/s</span></span>
        <span>• ${tokenCount} tokens</span>
        <span>• ${elapsed}s</span>
        <span>• [PROMPTCRAFT DEMO]</span>
      `;
      session.messages.push({ role: 'assistant', content: accumulated.trim(), stats: { speed: `${spd} tok/s`, tokens: tokenCount, time: elapsed } });
      saveSessions();

      state.isStreaming = false;
      sendBtn.style.display = 'inline-flex';
      stopBtn.style.display = 'none';
      inputEl.focus();
      return;
    }

    // LIVE GROQ API STREAMING CALL
    try {
      const messagesPayload = [
        { role: 'system', content: state.systemPrompt },
        ...session.messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
      ];

      let response = null;

      try {
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: state.activeModel,
            messages: messagesPayload,
            stream: true,
            temperature: 0.5
          }),
          signal: state.abortController.signal
        });
      } catch (directErr) {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: state.activeModel,
            messages: messagesPayload,
            temperature: 0.5
          }),
          signal: state.abortController.signal
        });
      }

      if (!response || !response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const rawErrMsg = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;

        if (rawErrMsg.toLowerCase().includes('does not exist') || rawErrMsg.toLowerCase().includes('do not have access')) {
          entry.remove();
          state.failedAttempts.add(state.activeModel);

          const candidateList = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'minimaxai/minimax-m2.7'];
          const nextModel = candidateList.find(m => !state.failedAttempts.has(m));

          if (nextModel && nextModel !== state.activeModel) {
            const oldModel = state.activeModel;
            state.activeModel = nextModel;
            localStorage.setItem('groq_model', nextModel);
            headerModel.textContent = nextModel;

            appendSystemNotice(
              '⚡ RETIRED MODEL AUTO-MIGRATED',
              `<code>${oldModel}</code> was retired by Groq.<br>` +
              `Auto-switched to official production model: <b><code>${nextModel}</code></b>. Retrying prompt now...`,
              'warning'
            );

            state.isStreaming = false;
            setTimeout(() => sendMessage(true), 400);
            return;
          }
        }

        throw new Error(rawErrMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      const liveId = 'live_' + Date.now();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta;
              const contentChunk = delta?.content || '';
              if (contentChunk) {
                accumulated += contentChunk;
                tokenCount++;
                bodyEl.innerHTML = renderAIEntryContent(accumulated, liveId, true);
                scrollToBottom();
              }
            } catch (e) {}
          }
        }
      }

      bodyEl.innerHTML = renderAIEntryContent(accumulated, liveId, false);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      const spd = Math.round(tokenCount / Math.max(0.05, elapsed));

      statsEl.style.display = 'flex';
      statsEl.innerHTML = `
        <span>⚡ <span class="speed-tag">${spd} tok/s</span></span>
        <span>• ${tokenCount} tokens</span>
        <span>• ${elapsed}s</span>
        <span>• ${state.activeModel}</span>
      `;

      session.messages.push({ role: 'assistant', content: accumulated.trim(), stats: { speed: `${spd} tok/s`, tokens: tokenCount, time: elapsed } });
      saveSessions();

    } catch (err) {
      if (err.name === 'AbortError') {
        bodyEl.innerHTML = renderAIEntryContent(accumulated, 'abort_' + Date.now(), false) + '<span style="color:var(--danger); font-size:12px;"> [Stopped]</span>';
      } else {
        bodyEl.innerHTML = renderAIEntryContent(accumulated, 'err_' + Date.now(), false);
        appendSystemNotice(
          'INFERENCE ERROR',
          `${escapeHtml(err.message)}<br><small style="color:var(--text-dim);">Type <code>/models</code> to see active models, or <code>/model openai/gpt-oss-120b</code>.</small>`,
          'error'
        );
      }
    } finally {
      state.isStreaming = false;
      state.abortController = null;
      sendBtn.style.display = 'inline-flex';
      stopBtn.style.display = 'none';
      inputEl.focus();
    }
  }

  function stopStreaming() {
    if (state.abortController) {
      state.abortController.abort();
    }
  }

  // ==========================================================================
  // Welcome Header
  // ==========================================================================
  function renderWelcome() {
    const welcome = document.createElement('div');
    welcome.className = 'terminal-welcome';
    welcome.innerHTML = `
      <div class="welcome-logo">
        <span>⚡ PROMPTCRAFT // VR DEVELOPMENTS</span>
      </div>
      <div class="welcome-sub">
        Pure Prompt Engineering Terminal powered by Groq LPUs.
      </div>
      <div style="margin-top: 6px; font-size: 12.5px; color: var(--prompt-color); font-weight: 600;">
        💡 Type any topic, idea, or goal — I will output EXACTLY ONE clean Master Prompt.
      </div>
      <div class="welcome-cmd-hint" style="margin-top: 8px;">
        Quick ideas:
        <code onclick="window.quickCraft('Full-stack website for VR DEVELOPMENTS')">VR Developments Website</code>
        <code onclick="window.quickCraft('Python script to scrape real-time stock prices')">Python Scraper</code>
        <code onclick="window.quickCraft('Photorealistic cinematic cyberpunk street portrait in Midjourney v6')">Midjourney v6</code>
        <code onclick="window.quickCraft('SaaS pricing page copy with high conversion rates')">SaaS Pricing Copy</code>
      </div>
    `;
    terminalScreen.appendChild(welcome);
    scrollToBottom();
  }

  window.quickCraft = function (idea) {
    inputEl.value = idea;
    sendMessage(false);
  };

  window.typeCommand = function (cmd) {
    inputEl.value = cmd;
    inputEl.focus();
  };

  window.openHistory = openDrawer;

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  function initEvents() {
    function updateResponsivePlaceholder() {
      const width = window.innerWidth;
      const isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;

      if (width < 380) {
        inputEl.placeholder = "Enter topic/idea (e.g. 'SaaS page')...";
      } else if (width < 540) {
        if (isLandscape) {
          inputEl.placeholder = "Enter topic or goal (e.g. 'SaaS pricing page', 'Python scraper')...";
        } else {
          inputEl.placeholder = "Enter topic or idea (e.g. 'SaaS pricing page')...";
        }
      } else if (width < 820) {
        inputEl.placeholder = "Enter topic, idea, or task (e.g. 'SaaS pricing page', 'Python scraper')...";
      } else {
        inputEl.placeholder = "Enter your topic, idea, or goal (e.g. 'SaaS pricing page', 'Python stock scraper')...";
      }
    }

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
        return;
      }

      if (inputEl.value === '' || state.cmdHistoryIndex !== -1) {
        if (e.key === 'ArrowUp') {
          if (state.cmdHistory.length > 0) {
            e.preventDefault();
            if (state.cmdHistoryIndex === -1) {
              state.cmdHistoryIndex = state.cmdHistory.length - 1;
            } else if (state.cmdHistoryIndex > 0) {
              state.cmdHistoryIndex--;
            }
            inputEl.value = state.cmdHistory[state.cmdHistoryIndex];
          }
        } else if (e.key === 'ArrowDown') {
          if (state.cmdHistoryIndex !== -1) {
            e.preventDefault();
            if (state.cmdHistoryIndex < state.cmdHistory.length - 1) {
              state.cmdHistoryIndex++;
              inputEl.value = state.cmdHistory[state.cmdHistoryIndex];
            } else {
              state.cmdHistoryIndex = -1;
              inputEl.value = '';
            }
          }
        }
      }

      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        handleCommand('/clear');
      }

      if ((e.ctrlKey && e.key === 'c') || e.key === 'Escape') {
        if (state.isStreaming) {
          e.preventDefault();
          stopStreaming();
        }
      }
    });

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      const newHeight = Math.min(120, Math.max(40, inputEl.scrollHeight));
      inputEl.style.height = newHeight + 'px';
      inputEl.style.overflowY = inputEl.scrollHeight > 120 ? 'auto' : 'hidden';
    });

    window.addEventListener('resize', updateResponsivePlaceholder);
    window.addEventListener('orientationchange', updateResponsivePlaceholder);
    updateResponsivePlaceholder();

    sendBtn.addEventListener('click', () => sendMessage(false));
    stopBtn.addEventListener('click', stopStreaming);

    historyToggleBtn.addEventListener('click', openDrawer);
    closeDrawerBtn.addEventListener('click', closeDrawer);
    historyBackdrop.addEventListener('click', closeDrawer);
    newChatBtn.addEventListener('click', startNewSession);
    clearHistoryBtn.addEventListener('click', clearAllSessions);

    terminalScreen.addEventListener('click', (e) => {
      if (!window.getSelection().toString() && !e.target.closest('button, a, pre, code')) {
        inputEl.focus();
      }
    });
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  async function init() {
    document.body.setAttribute('data-theme', state.theme);
    updateStatus();

    if (state.apiKey) {
      discoverAccountModels().catch(() => {});
    }

    if (state.sessions.length > 0) {
      state.currentSessionId = state.sessions[0].id;
      loadSession(state.currentSessionId);
    } else {
      startNewSession();
    }

    initEvents();
    setTimeout(() => inputEl.focus(), 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
