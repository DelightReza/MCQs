const STORAGE_KEYS = {
  theme: 'uqp_theme',
  activeQuiz: 'uqp_active_quiz',
  bookmarks: 'uqp_bookmarks'
};

const MEDIA_EXT = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a'],
  video: ['.mp4', '.webm', '.mov']
};

const CONSTANTS = {
  QUESTION_MEDIA_MAX_HEIGHT: 400,
  TIMER_PERSIST_INTERVAL: 5,
  MAX_STORAGE_MB: 4.5,
  MAX_BANK_SIZE: 5000,
  PALETTE_SCROLL_AMOUNT: 200,
  REVIEW_PAGE_SIZE: 10
};

const state = {
  metadata: [],
  bankCounts: {},
  selectedBank: null,
  parsedBanks: {},
  quiz: null,
  timerPersistCounter: 0,
  bookmarkReviewPage: 0,
  bookmarkReviewMode: false
};

const byId = (id) => document.getElementById(id);
const escapeHtml = (s = '') => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- DOM Helper ---------- */
function createEl(tag, classes = [], text = '', attrs = {}) {
  const el = document.createElement(tag);
  classes.filter(Boolean).forEach((c) => el.classList.add(c));
  if (text) el.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else {
      el.setAttribute(k, v);
    }
  });
  return el;
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

function writeJson(key, value) {
  try {
    const serialized = JSON.stringify(value);
    const sizeMB = new Blob([serialized]).size / (1024 * 1024);
    if (sizeMB > CONSTANTS.MAX_STORAGE_MB) {
      console.warn('Storage item too large, skipping save');
      return;
    }
    localStorage.setItem(key, serialized);
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}
/* ---------- Storage Info & Cache Management ---------- */
function calculateLocalStorageSize() {
  let totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    totalSize += (key.length + value.length) * 2; // UTF-16 = 2 bytes per char
  }
  return totalSize;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getStorageEstimate() {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        available: (estimate.quota || 0) - (estimate.usage || 0)
      };
    }
  } catch (e) {
    console.warn('Storage estimate failed:', e);
  }
  return null;
}

function renderStorageInfo() {
  const container = byId('storageInfo');
  if (!container) return;

  const lsSize = calculateLocalStorageSize();
  const lsHTML = `
    <div class="storage-row">
      <span>localStorage:</span>
      <strong>${formatBytes(lsSize)}</strong>
    </div>
  `;

  getStorageEstimate().then(estimate => {
    let estimateHTML = '';
    if (estimate) {
      const percent = estimate.quota > 0 ? ((estimate.usage / estimate.quota) * 100).toFixed(1) : 0;
      estimateHTML = `
        <div class="storage-row">
          <span>Total Storage Used:</span>
          <strong>${formatBytes(estimate.usage)}</strong>
        </div>
        <div class="storage-row">
          <span>Storage Quota:</span>
          <strong>${formatBytes(estimate.quota)}</strong>
        </div>
        <div class="storage-row">
          <span>Available:</span>
          <strong>${formatBytes(estimate.available)}</strong>
        </div>
        <div class="storage-bar-wrap">
          <div class="storage-bar" style="width: ${percent}%"></div>
          <span class="storage-bar-text">${percent}% used</span>
        </div>
      `;
    }
    container.innerHTML = lsHTML + estimateHTML;
  });
}

async function clearAppCache() {
  if (!confirm('Clear all cached data? This will remove saved quiz progress, bookmarks, theme preference, and offline assets. This action cannot be undone.')) return;

  // Clear localStorage
  const keysToKeep = []; // Add any keys you want to preserve here
  const allKeys = Object.keys(localStorage);
  allKeys.forEach(key => {
    if (!keysToKeep.includes(key)) {
      localStorage.removeItem(key);
    }
  });

  // Clear Cache API
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    } catch (e) {
      console.warn('Cache clearing failed:', e);
    }
  }

  // Clear sessionStorage
  sessionStorage.clear();

  // Reset state
  state.quiz = null;
  state.selectedBank = null;
  state.bookmarkReviewPage = 0;
  state.bookmarkReviewMode = false;

  // Update UI
  updateResumeButtonVisibility();
  renderBankList();
  renderStorageInfo();

  alert('All cached data cleared successfully. The page will now reload.');
  window.location.reload();
}


function normalizePath(path) { return path?.trim().replace(/^\.\//, '') || ''; }

function mediaType(path) {
  const p = path.toLowerCase();
  if (MEDIA_EXT.image.some((ext) => p.endsWith(ext))) return 'image';
  if (MEDIA_EXT.audio.some((ext) => p.endsWith(ext))) return 'audio';
  if (MEDIA_EXT.video.some((ext) => p.endsWith(ext))) return 'video';
  return 'unsupported';
}

function safeMediaPath(path, expectedType = null) {
  if (!path) return null;
  const raw = String(path).trim();
  if (expectedType && mediaType(raw) !== expectedType) return null;
  if (/^(javascript|data|vbscript):/i.test(raw)) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.origin === window.location.origin) return url.href;
    if (url.protocol === 'https:') return url.href;
    return null;
  } catch {
    return null;
  }
}

function safeImagePath(path) { return safeMediaPath(path, 'image'); }

/* ---------- Media Rendering (DOM API) ---------- */
function renderMedia(paths, className = 'question-media') {
  if (!paths?.length) return null;
  const wrapper = createEl('div', [className]);
  paths.forEach((path) => {
    const type = mediaType(path);
    if (type === 'unsupported') {
      wrapper.appendChild(createEl('div', ['muted'], 'Unsupported media'));
      return;
    }
    const safe = safeMediaPath(path, type);
    if (!safe) {
      wrapper.appendChild(createEl('div', ['muted'], 'Blocked media'));
      return;
    }
    if (type === 'image') {
      const img = createEl('img', ['cursor-zoom'], '', { src: safe, alt: 'question media', loading: 'lazy' });
      img.addEventListener('click', () => window.open(safe, '_blank'));
      wrapper.appendChild(img);
    } else if (type === 'audio') {
      wrapper.appendChild(createEl('audio', [], '', { controls: '', preload: 'none', src: safe }));
    } else if (type === 'video') {
      wrapper.appendChild(createEl('video', [], '', { controls: '', preload: 'none', src: safe }));
    } else {
      wrapper.appendChild(createEl('div', ['muted'], 'Unsupported media'));
    }
  });
  return wrapper;
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function qid(bankFile, index, text) {
  return bankFile + '::' + index + '::' + (text || '').slice(0, 40);
}

function extractMediaAndClean(text) {
  const media = [];
  if (!text) return { text: '', media };
  const regex = /MEDIA:\s*([^\s]+)/gi;
  let cleaned = text.replace(regex, (match, path) => {
    media.push(normalizePath(path));
    return '';
  });
  cleaned = cleaned.replace(/:\s*$/, '').trim();
  return { text: cleaned, media };
}

function parseLegacyBlock(block, bankFile, index) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const qLineIndex = lines.findIndex((l) => l.startsWith('Q:'));
  let questionTextParts = [];
  let optionLines = [];

  if (qLineIndex !== -1) {
    questionTextParts.push(lines[qLineIndex].replace(/^Q:\s*/, '').trim());
    optionLines = lines.filter((_, idx) => idx !== qLineIndex);
  } else {
    let readingQuestion = true;
    for (const line of lines) {
      const isOption = /^[*+]\s+/.test(line);
      if (readingQuestion && !isOption) {
        questionTextParts.push(line);
      } else {
        readingQuestion = false;
        optionLines.push(line);
      }
    }
  }

  const rawQuestion = questionTextParts.join(' ');
  const { text: question, media: questionMedia } = extractMediaAndClean(rawQuestion);

  const options = optionLines.map((raw) => {
    const correct = /^[*+]\s+/.test(raw);
    const cleanedRaw = raw.replace(/^[*+]\s+/, '').trim();
    const { text, media: optMedia } = extractMediaAndClean(cleanedRaw);
    return { text, correct, media: optMedia };
  }).filter((o) => o.text);

  if (!options.length) throw new Error('No options found near question ' + (index + 1));
  const correctCount = options.filter((o) => o.correct).length;
  if (correctCount !== 1) throw new Error('Question ' + (index + 1) + ' must have exactly one correct answer');

  return {
    id: qid(bankFile, index, question),
    bankFile,
    question,
    media: questionMedia,
    options
  };
}

function parseStructuredBlock(block, bankFile, index) {
  const lines = block.split('\n').map((l) => l.trim());
  const q = { id: '', bankFile, question: '', media: [], options: [] };
  let currentOption = null;
  let inOptions = false;

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('Q:')) { q.question = line.replace(/^Q:\s*/, '').trim(); continue; }
    if (line === 'OPTION:') {
      inOptions = true;
      currentOption = { text: '', correct: false, media: [] };
      q.options.push(currentOption);
      continue;
    }
    if (line.startsWith('MEDIA:')) {
      const mediaPath = normalizePath(line.replace(/^MEDIA:\s*/, ''));
      if (currentOption && inOptions) currentOption.media.push(mediaPath);
      else q.media.push(mediaPath);
      continue;
    }
    if (line.startsWith('CORRECT:') && currentOption) {
      currentOption.correct = line.replace(/^CORRECT:\s*/, '').trim().toLowerCase() === 'true';
      continue;
    }
    if (line.startsWith('TEXT:') && currentOption) {
      currentOption.text = line.replace(/^TEXT:\s*/, '').trim();
      continue;
    }
    if (!inOptions) q.question += ' ' + line;
  }

  q.question = q.question.trim();
  if (!q.question) throw new Error('Missing question text near question ' + (index + 1));
  q.options = q.options.filter((o) => o.text || o.media.length);
  if (!q.options.length) throw new Error('No options found near question ' + (index + 1));
  const correctCount = q.options.filter((o) => o.correct).length;
  if (correctCount !== 1) throw new Error('Question ' + (index + 1) + ' must have exactly one correct answer');

  const { text: cleanedQuestion, media: extractedMedia } = extractMediaAndClean(q.question);
  q.question = cleanedQuestion;
  q.media = [...q.media, ...extractedMedia];
  q.id = qid(bankFile, index, q.question);
  return q;
}

function parseQuestions(txt, bankFile) {
  const parts = txt.split(/\n\s*---\s*\n/g).map((p) => p.trim()).filter(Boolean);
  const parsed = [];
  const errors = [];
  for (let i = 0; i < parts.length; i++) {
    try {
      const block = parts[i];
      const structured = /(^|\n)\s*OPTION:/m.test(block) || /(^|\n)\s*CORRECT:/m.test(block);
      const parsedItem = structured ? parseStructuredBlock(block, bankFile, i) : parseLegacyBlock(block, bankFile, i);
      if (parsedItem) parsed.push(parsedItem);
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  return { parsed, errors };
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('Failed loading file');
  return res.text();
}

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const target = byId(id);
  if (target) {
    target.classList.add('active');
    writeJson('uqp_current_view', id);
    // Save review mode context so refresh restores correctly
    writeJson('uqp_review_mode', {
      bookmarkMode: state.bookmarkReviewMode,
      origin: state.reviewOrigin || 'dashboard',
      filter: byId('reviewFilter')?.value || 'all',
      search: byId('reviewSearch')?.value || ''
    });
    if (history.state?.view !== id) {
      history.pushState({ view: id }, '', window.location.pathname + window.location.search);
    }
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return m + ':' + s;
}

function formatShortTime(sec) {
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? m + 'm' + s + 's' : m + 'm';
}

function paletteClass(idx) {
  const qz = state.quiz;
  if (idx === qz.current) return 'status-current';
  if (!qz.visited[idx]) return 'status-notvisited';
  if (qz.answers[idx] != null) return 'status-answered';
  return 'status-unanswered';
}

function getQuestionTime(qz, idx) {
  if (!qz.questionTimes || !qz.questionTimes[idx]) return 0;
  return qz.questionTimes[idx];
}

function scrollToQuestion() {
  const questionContainer = byId('questionContainer');
  if (!questionContainer) return;
  const headerOffset = 20;
  const elementPosition = questionContainer.getBoundingClientRect().top;
  const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
  window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
}

/* ---------- Palette (DOM API) ---------- */
function updatePalette() {
  const qz = state.quiz;
  const palette = byId('palette');
  palette.innerHTML = '';

  qz.questions.forEach((_, i) => {
    const timeSpent = getQuestionTime(qz, i);
    const timeDisplay = qz.visited[i] ? formatShortTime(timeSpent) : '--';

    const item = createEl('div', ['palette-item', paletteClass(i)]);
    item.dataset.go = i;

    item.appendChild(createEl('span', ['palette-number'], String(i + 1)));
    item.appendChild(createEl('span', ['palette-time'], timeDisplay));
    item.appendChild(createEl('span', ['palette-dot']));

    item.addEventListener('click', () => {
      qz.current = i;
      renderQuestion();
      persistActiveQuiz();
    });

    palette.appendChild(item);
  });

  setTimeout(() => {
    const current = palette.querySelector('.status-current');
    if (current) {
      current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, 50);
}

function scrollPalette(direction) {
  const container = byId('palette').parentElement;
  container.scrollBy({ left: direction * CONSTANTS.PALETTE_SCROLL_AMOUNT, behavior: 'smooth' });
}

function applyOptionOrder(question, shouldShuffle) {
  if (!shouldShuffle) return question.options.map((o, idx) => ({ ...o, _orig: idx }));
  return shuffle(question.options.map((o, idx) => ({ ...o, _orig: idx })));
}

function getBookmarks() { return readJson(STORAGE_KEYS.bookmarks, []); }
function setBookmarks(v) { writeJson(STORAGE_KEYS.bookmarks, v); }

/* ---------- Question Rendering (DOM API) ---------- */
function renderQuestion() {
  const qz = state.quiz;
  const q = qz.questions[qz.current];

  const now = Date.now();
  if (qz.lastQuestionStartTime) {
    const timeSpent = Math.floor((now - qz.lastQuestionStartTime) / 1000);
    if (qz.questionTimes) {
      qz.questionTimes[qz.current] = (qz.questionTimes[qz.current] || 0) + timeSpent;
    }
  }
  qz.lastQuestionStartTime = now;
  qz.visited[qz.current] = true;

  byId('currentQ').textContent = String(qz.current + 1);
  byId('totalQ').textContent = String(qz.questions.length);
  byId('quizTitle').textContent = qz.bank.title;
  byId('progressBar').value = ((qz.current + 1) / qz.questions.length) * 100;

  byId('prevBtn').disabled = (qz.current === 0);
  byId('nextBtn').disabled = (qz.current === qz.questions.length - 1);

  const selected = qz.answers[qz.current];
  const correct = q.renderOptions?.findIndex((o) => o.correct) ?? -1;
  const showFeedback = qz.practiceMode && selected != null;

  const container = byId('questionContainer');
  container.innerHTML = '';

  // Question text
  container.appendChild(createEl('h3', [], q.question));

  // Question media
  const qMedia = renderMedia(q.media, 'question-media');
  if (qMedia) container.appendChild(qMedia);

  // Options
  const optionsDiv = createEl('div', ['options']);
  q.renderOptions.forEach((opt, idx) => {
    const btnClasses = ['option'];
    if (selected === idx) btnClasses.push('selected');
    
    // In practice mode, lock and color options if already selected
    if (showFeedback) {
      btnClasses.push('locked');
      if (idx === correct) {
        btnClasses.push('correct');
      } else if (selected === idx) {
        btnClasses.push('incorrect');
      }
    }

    const btn = createEl('button', btnClasses);

    const textDiv = createEl('div', [], '');
    const strong = createEl('strong', [], (idx + 1) + '. ');
    textDiv.appendChild(strong);
    textDiv.appendChild(document.createTextNode(opt.text || '(Media option)'));
    btn.appendChild(textDiv);

    const optMedia = renderMedia(opt.media, 'option-media');
    if (optMedia) btn.appendChild(optMedia);

    btn.addEventListener('click', () => {
      // Prevent changing answers in Practice Mode once clicked
      if (qz.practiceMode && qz.answers[qz.current] != null) return;
      
      qz.answers[qz.current] = idx;
      persistActiveQuiz();
      renderQuestion();
    });

    optionsDiv.appendChild(btn);
  });
  container.appendChild(optionsDiv);

  // Feedback
  if (showFeedback) {
    const badgeClass = selected === correct ? 'correct' : 'incorrect';
    const badgeText = selected === correct ? 'CORRECT' : 'INCORRECT (Answer: ' + (correct + 1) + ')';
    container.appendChild(createEl('div', ['badge', badgeClass], badgeText));
  }

  // Accessibility announcement
  byId('ariaStatus').textContent = `Question ${qz.current + 1} of ${qz.questions.length}. ${q.question}`;

  // In exam mode: hide bookmark during quiz, but mark is still useful for review
  byId('bookmarkBtn').disabled = false;
  if (qz.examMode) {
    byId('bookmarkBtn').classList.add('hidden');
  } else {
    byId('bookmarkBtn').classList.remove('hidden');
  }
  byId('bookmarkBtn').textContent = getBookmarks().includes(q.id) ? 'Bookmarked' : 'Bookmark';
  updatePalette();

  requestAnimationFrame(() => scrollToQuestion());
}

/* ---------- Timer (Date.now() delta) ---------- */
function startTimer() {
  if (!state.quiz?.timedMode) { byId('timerWrap').classList.add('hidden'); return; }
  byId('timerWrap').classList.remove('hidden');
  clearInterval(state.quiz.timerId);

  let lastTick = Date.now();
  state.quiz.timerId = setInterval(() => {
    const now = Date.now();
    const delta = Math.floor((now - lastTick) / 1000);
    if (delta > 0) {
      state.quiz.elapsed += delta;
      lastTick = now;
      state.timerPersistCounter += delta;
      byId('timer').textContent = formatTime(state.quiz.elapsed);
      if (state.timerPersistCounter >= CONSTANTS.TIMER_PERSIST_INTERVAL) {
        state.timerPersistCounter = 0;
        persistActiveQuiz();
      }
    }
  }, 1000);
}

function stopTimer() { if (state.quiz?.timerId) clearInterval(state.quiz.timerId); }

function persistActiveQuiz() {
  const qz = state.quiz;
  if (!qz) return;
  writeJson(STORAGE_KEYS.activeQuiz, {
    bankFile: qz.bank.file,
    bankTitle: qz.bank.title,
    questionIds: qz.questions.map((q) => q.id),
    optionOrders: qz.questions.map((q) => (q.renderOptions || []).map((opt) => opt._orig)),
    answers: qz.answers,
    visited: qz.visited,
    current: qz.current,
    elapsed: qz.elapsed,
    startedAt: qz.startedAt,
    timedMode: qz.timedMode,
    examMode: qz.examMode,
    practiceMode: qz.practiceMode,
    questionTimes: qz.questionTimes || []
  });
}

/* ---------- Review List (DOM API) ---------- */
function buildReviewList(filter = 'all', search = '') {
  const qz = state.quiz;
  if (!qz) return;
  const term = search.trim().toLowerCase();
  const filtered = qz.questions.map((q, i) => ({ q, i })).filter(({ q, i }) => {
    const user = qz.answers[i];
    const correct = q.renderOptions?.findIndex((o) => o.correct) ?? -1;
    const isAnswered = user != null;
    const isCorrect = user === correct;
    if (filter === 'incorrect' && (user == null || isCorrect)) return false;
    if (filter === 'unanswered' && user != null) return false;

    if (filter === 'correct' && !isCorrect) return false;
    if (!term) return true;
    return (q.question + ' ' + q.bankFile).toLowerCase().includes(term);
  });

  const list = byId('reviewList');
  list.innerHTML = '';

  if (!filtered.length) {
    list.appendChild(createEl('p', ['muted'], 'No questions match this filter.'));
    return;
  }

  filtered.forEach(({ q, i }) => {
    const user = qz.answers[i];
    const correct = q.renderOptions?.findIndex((o) => o.correct) ?? -1;
    const status = user == null ? 'unanswered' : user === correct ? 'correct' : 'incorrect';
    const timeSpent = getQuestionTime(qz, i);

    const card = createEl('article', ['review-card']);

    card.appendChild(createEl('div', ['badge', status], status.toUpperCase()));

    // Bookmark toggle in review mode
    const isBookmarked = getBookmarks().includes(q.id);
    const bmBtn = createEl('button', ['secondary', isBookmarked ? 'danger-text' : ''], isBookmarked ? '✕ Unbookmark' : '🔖 Bookmark', {
      onclick: () => {
        const s = new Set(getBookmarks());
        if (s.has(q.id)) s.delete(q.id); else s.add(q.id);
        setBookmarks([...s]);
        buildReviewList(byId('reviewFilter').value, byId('reviewSearch').value);
      }
    });
    bmBtn.style.marginLeft = '0.5rem';
    bmBtn.style.fontSize = '0.75rem';
    bmBtn.style.padding = '0.25rem 0.5rem';
    card.appendChild(bmBtn);
    if (timeSpent > 0) {
      card.appendChild(createEl('span', ['pill', 'count-pill'], '⏱ ' + formatShortTime(timeSpent)));
    }

    card.appendChild(createEl('h4', [], 'Q' + (i + 1) + '. ' + q.question));

    const qMedia = renderMedia(q.media, 'question-media');
    if (qMedia) card.appendChild(qMedia);

    const optionsDiv = createEl('div', ['options']);
    q.renderOptions.forEach((opt, idx) => {
      const cls = idx === correct ? 'correct' : (idx === user && user !== correct ? 'incorrect' : '');
      const optDiv = createEl('div', ['option', cls].filter(Boolean));
      optDiv.appendChild(createEl('strong', [], (idx + 1) + '. '));
      optDiv.appendChild(document.createTextNode(opt.text || '(Media option)'));
      const optMedia = renderMedia(opt.media, 'option-media');
      if (optMedia) optDiv.appendChild(optMedia);
      optionsDiv.appendChild(optDiv);
    });
    card.appendChild(optionsDiv);

    list.appendChild(card);
  });
}

function calculateResult(qz) {
  let correct = 0; let incorrect = 0; let unanswered = 0;
  qz.questions.forEach((q, i) => {
    const user = qz.answers[i];
    const answerIdx = q.renderOptions?.findIndex((o) => o.correct) ?? -1;
    if (user == null) unanswered += 1;
    else if (user === answerIdx) correct += 1;
    else incorrect += 1;
  });
  const attempted = correct + incorrect;
  const total = qz.questions.length;
  return {
    correct, incorrect, unanswered, attempted, total,
    accuracy: total ? (correct / total) * 100 : 0,
    score: total ? (correct / total) * 100 : 0
  };
}

/* ---------- Submit Quiz (DOM API) ---------- */
function submitQuiz() {
  const qz = state.quiz;
  const answered = qz.answers.filter((x) => x != null).length;
  const unanswered = qz.questions.length - answered;
  if (!confirm('Submit quiz?\nAnswered: ' + answered + '\nUnanswered: ' + unanswered)) return;

  stopTimer();
  const result = calculateResult(qz);
  const payload = { ...result, bankName: qz.bank.title, date: new Date().toISOString(), elapsed: qz.elapsed };
  localStorage.removeItem(STORAGE_KEYS.activeQuiz);

  const summary = byId('resultSummary');
  summary.innerHTML = '';
  const details = createEl('div', ['result-details']);

  const addDetail = (label, value) => {
    const div = createEl('div', [], '');
    div.appendChild(document.createTextNode(label + ' '));
    div.appendChild(createEl('strong', [], value));
    details.appendChild(div);
  };

  addDetail('Quiz Source:', payload.bankName);
  addDetail('Completion Date:', new Date(payload.date).toLocaleString());
  addDetail('Total Duration:', formatTime(payload.elapsed));
  addDetail('Total Items:', String(payload.total));
  addDetail('Correct:', String(payload.correct));
  addDetail('Incorrect:', String(payload.incorrect));
  addDetail('Skipped:', String(payload.unanswered));
  addDetail('Completion Rate:', payload.attempted + ' of ' + payload.total);
  addDetail('Overall Accuracy:', payload.accuracy.toFixed(2) + '%');
  addDetail('Final Score:', payload.score.toFixed(2) + '%');

  summary.appendChild(details);

  qz.lastResult = payload;
  showView('resultsView');
}

async function cacheActiveQuizAssets(qz) {
  if (!('caches' in window) || !qz) return;
  try {
    const cache = await caches.open('uqp-v8');
    if (qz.bank?.file) {
      const bankMatch = await cache.match(qz.bank.file);
      if (!bankMatch) await cache.add(qz.bank.file).catch(() => {});
    }
    const mediaUrls = [];
    qz.questions.forEach((q) => {
      if (q.media) q.media.forEach((path) => { if (path) mediaUrls.push(path); });
      if (q.renderOptions) {
        q.renderOptions.forEach((opt) => {
          if (opt.media) opt.media.forEach((path) => { if (path) mediaUrls.push(path); });
        });
      }
    });
    const safeUrls = mediaUrls.map((path) => safeMediaPath(path)).filter(Boolean);
    await Promise.all(safeUrls.map(async (url) => {
      const match = await cache.match(url);
      if (!match) await cache.add(url).catch(() => null);
    }));
  } catch (e) {
    console.warn('On-demand caching skipped:', e);
  }
}

function prepareQuiz(bank, questions, settings) {
  let examMode = settings.examMode;
  let practiceMode = settings.practiceMode;
  if (examMode && practiceMode) practiceMode = false;
  if (!examMode && !practiceMode) examMode = true;

  let selectedQuestions = settings.shuffleQuestions ? shuffle(questions) : [...questions];
  if (settings.bookmarkedOnly) {
    const bookmarks = new Set(getBookmarks());
    selectedQuestions = selectedQuestions.filter((q) => bookmarks.has(q.id));
  }
  if (!selectedQuestions.length) throw new Error('No questions available for selected filters/bookmarks.');

  let count;
  if (settings.count === 'all') {
    count = selectedQuestions.length;
  } else {
    const numCount = Number(settings.count);
    count = (isNaN(numCount) || numCount < 1) ? selectedQuestions.length : Math.min(numCount, selectedQuestions.length);
  }

  selectedQuestions = selectedQuestions.slice(0, count).map((q) => ({ ...q, renderOptions: applyOptionOrder(q, settings.shuffleOptions) }));

  state.quiz = {
    bank,
    questions: selectedQuestions,
    current: 0,
    answers: Array(selectedQuestions.length).fill(null),
    visited: Array(selectedQuestions.length).fill(false),

    elapsed: 0,
    startedAt: Date.now(),
    timedMode: practiceMode ? false : settings.timedMode,
    examMode,
    practiceMode,
    timerId: null,
    lastResult: null,
    questionTimes: Array(selectedQuestions.length).fill(0),
    lastQuestionStartTime: Date.now()
  };

  if (settings.fullscreenMode && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch((err) => console.warn('Fullscreen request failed:', err));
  }

  byId('timer').textContent = '00:00';
  renderQuestion();
  startTimer();
  showView('quizView');
  persistActiveQuiz();
  cacheActiveQuizAssets(state.quiz);
}

function csvFromResult(res) {
  const rows = [['Quiz Name','Date','Time Taken','Total','Correct','Incorrect','Unanswered','Attempted','Accuracy','Score']];
  rows.push([res.bankName, res.date, formatTime(res.elapsed), res.total, res.correct, res.incorrect, res.unanswered, res.attempted, res.accuracy.toFixed(2), res.score.toFixed(2)]);
  return rows.map((r) => r.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(',')).join('\n');
}

function downloadFile(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.classList.add('hidden');
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

function updateResumeButtonVisibility() {
  const activeQuiz = readJson(STORAGE_KEYS.activeQuiz, null);
  byId('resumeBtn').classList.toggle('hidden', !activeQuiz);
  byId('clearResumeBtn').classList.toggle('hidden', !activeQuiz);
}

/* ---------- Bookmarks Manager with Pagination & Options ---------- */
function renderBookmarkPage() {
  const bookmarks = new Set(getBookmarks());
  const bankQuestions = Object.values(state.parsedBanks).flat();
  const marked = bankQuestions.filter((q) => bookmarks.has(q.id));

  const pageSize = CONSTANTS.REVIEW_PAGE_SIZE;
  const totalPages = Math.ceil(marked.length / pageSize) || 1;
  const page = Math.min(state.bookmarkReviewPage, totalPages - 1);
  state.bookmarkReviewPage = page;

  const start = page * pageSize;
  const end = start + pageSize;
  const pageItems = marked.slice(start, end);

  const list = byId('reviewList');
  list.innerHTML = '';

  if (!marked.length) {
    list.appendChild(createEl('p', ['muted'], 'No bookmarks yet.'));
    return;
  }

  // Page info
  const pageInfo = createEl('div', ['muted'], `Showing ${start + 1}-${Math.min(end, marked.length)} of ${marked.length} bookmarked questions (Page ${page + 1} of ${totalPages})`);
  pageInfo.style.marginBottom = '1rem';
  list.appendChild(pageInfo);

  // Start quiz from bookmarks button
  const quizBtn = createEl('button', [], 'Start Quiz from Bookmarks', {
    onclick: () => startBookmarkQuiz()
  });
  quizBtn.style.marginBottom = '1rem';
  list.appendChild(quizBtn);

  pageItems.forEach((q, i) => {
    const globalIdx = start + i;
    const bankTitle = state.metadata.find((b) => b.file === q.bankFile)?.title || 'Question Bank';
    const card = createEl('article', ['review-card']);

    // Question title (full width)
    const title = createEl('h4', [], (globalIdx + 1) + '. ' + q.question);
    title.style.margin = '0 0 0.75rem 0';
    card.appendChild(title);

    const qMedia = renderMedia(q.media);
    if (qMedia) card.appendChild(qMedia);

    // Show options
    const optionsDiv = createEl('div', ['options']);
    q.options.forEach((opt, idx) => {
      const cls = opt.correct ? 'correct' : '';
      const optDiv = createEl('div', ['option', cls].filter(Boolean));
      optDiv.appendChild(createEl('strong', [], (idx + 1) + '. '));
      optDiv.appendChild(document.createTextNode(opt.text || '(Media option)'));
      const optMedia = renderMedia(opt.media, 'option-media');
      if (optMedia) optDiv.appendChild(optMedia);
      optionsDiv.appendChild(optDiv);
    });
    card.appendChild(optionsDiv);

    // Bank badge and remove button row
    const footer = createEl('div', [], '');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.alignItems = 'center';
    footer.style.marginTop = '0.75rem';
    footer.style.flexWrap = 'wrap';
    footer.style.gap = '0.5rem';

    const badges = createEl('div', ['bank-card-badges']);
    badges.appendChild(createEl('span', ['pill', 'subject-pill'], bankTitle));
    footer.appendChild(badges);

    const removeBtn = createEl('button', ['secondary', 'danger-text'], '✕ Remove Bookmark', {
      onclick: () => {
        const s = new Set(getBookmarks());
        s.delete(q.id);
        setBookmarks([...s]);
        renderBookmarkPage();
      }
    });
    removeBtn.style.fontSize = '0.8rem';
    removeBtn.style.padding = '0.4rem 0.75rem';
    footer.appendChild(removeBtn);

    card.appendChild(footer);



    list.appendChild(card);
  });

  // Pagination controls
  if (totalPages > 1) {
    const pagDiv = createEl('div', ['actions-row']);
    pagDiv.style.justifyContent = 'center';
    pagDiv.style.marginTop = '1.5rem';

    const prevBtn = createEl('button', ['secondary'], '← Previous', {
      onclick: () => { state.bookmarkReviewPage = Math.max(0, page - 1); renderBookmarkPage(); }
    });
    prevBtn.disabled = page === 0;

    const pageLabel = createEl('span', [], `Page ${page + 1} / ${totalPages}`);
    pageLabel.style.padding = '0.65rem 1rem';
    pageLabel.style.fontWeight = '600';

    const nextBtn = createEl('button', ['secondary'], 'Next →', {
      onclick: () => { state.bookmarkReviewPage = Math.min(totalPages - 1, page + 1); renderBookmarkPage(); }
    });
    nextBtn.disabled = page >= totalPages - 1;

    pagDiv.appendChild(prevBtn);
    pagDiv.appendChild(pageLabel);
    pagDiv.appendChild(nextBtn);
    list.appendChild(pagDiv);
  }
}

function startBookmarkQuiz() {
  const bookmarks = new Set(getBookmarks());
  const bankQuestions = Object.values(state.parsedBanks).flat();
  const marked = bankQuestions.filter((q) => bookmarks.has(q.id));

  if (!marked.length) {
    alert('No bookmarked questions available.');
    return;
  }

  // Use first bank as default, or try to find matching bank
  const firstBank = state.metadata.find((b) => b.file === marked[0].bankFile) || state.metadata[0];
  if (!firstBank) {
    alert('No valid bank found for bookmarked questions.');
    return;
  }

  const settings = {
    count: 'all',
    shuffleQuestions: byId('shuffleQuestions')?.checked ?? true,
    shuffleOptions: byId('shuffleOptions')?.checked ?? true,
    timedMode: byId('timedMode')?.checked ?? true,
    examMode: byId('examMode')?.checked ?? true,
    practiceMode: byId('practiceMode')?.checked ?? false,
    fullscreenMode: byId('fullscreenMode')?.checked ?? false,
    bookmarkedOnly: true
  };

  prepareQuiz(firstBank, marked, settings);
}

function bindGlobalEvents() {
  byId('themeToggle').onclick = () => {
    const curr = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', curr);
    localStorage.setItem(STORAGE_KEYS.theme, curr);
    byId('themeToggle').textContent = curr === 'dark' ? '☀️' : '🌙';
  };

  byId('bankSearch').oninput = renderBankList;

  byId('startQuizBtn').onclick = async () => {
    try {
      if (!state.selectedBank) return;
      const settings = {
        count: byId('questionCount').value,
        shuffleQuestions: byId('shuffleQuestions').checked,
        shuffleOptions: byId('shuffleOptions').checked,
        timedMode: byId('timedMode').checked,
        examMode: byId('examMode').checked,
        practiceMode: byId('practiceMode').checked,
        fullscreenMode: byId('fullscreenMode').checked,
        bookmarkedOnly: byId('bookmarkedOnly').checked
      };
      const questions = state.parsedBanks[state.selectedBank.file] || [];
      await prepareQuiz(state.selectedBank, questions, settings);
    } catch (e) {
      alert('Unable to start quiz: ' + e.message);
    }
  };

  byId('resumeBtn').onclick = () => resumeQuiz(true);
  byId('prevBtn').onclick = () => { if (state.quiz.current > 0) { state.quiz.current -= 1; renderQuestion(); persistActiveQuiz(); } };
  byId('nextBtn').onclick = () => { if (state.quiz.current < state.quiz.questions.length - 1) { state.quiz.current += 1; renderQuestion(); persistActiveQuiz(); } };

  byId('bookmarkBtn').onclick = () => {
    const q = state.quiz.questions[state.quiz.current];
    const s = new Set(getBookmarks());
    if (s.has(q.id)) s.delete(q.id); else s.add(q.id);
    setBookmarks([...s]);
    renderQuestion();
  };
  byId('submitBtn').onclick = submitQuiz;

  byId('quitBtn').onclick = () => {
    if (confirm('Exit to home dashboard? Your active session will be saved.')) {
      stopTimer();
      showView('dashboard');
      state.quiz = null;
      renderBankList();
    }
  };

  byId('reviewBtn').onclick = () => { 
    state.reviewOrigin = 'resultsView'; 
    state.bookmarkReviewMode = false;
    // Show filter controls in results review mode
    byId('reviewFilter').classList.remove('hidden');
    byId('reviewSearch').classList.remove('hidden');
    byId('reviewBackBtn').textContent = 'Back';
    buildReviewList('all'); 
    showView('reviewView'); 
  };
  byId('reviewFilter').onchange = () => buildReviewList(byId('reviewFilter').value, byId('reviewSearch').value);
  byId('reviewSearch').oninput = () => buildReviewList(byId('reviewFilter').value, byId('reviewSearch').value);
  byId('reviewBackBtn').onclick = () => {
    state.bookmarkReviewMode = false;
    byId('reviewFilter').classList.remove('hidden');
    byId('reviewSearch').classList.remove('hidden');
    showView(state.reviewOrigin || 'resultsView');
  };

  byId('downloadCsvBtn').onclick = () => downloadFile('result.csv', csvFromResult(state.quiz.lastResult), 'text/csv');
  byId('downloadJsonBtn').onclick = () => downloadFile('result.json', JSON.stringify(state.quiz.lastResult, null, 2), 'application/json');
  byId('printBtn').onclick = () => window.print();
  byId('backHomeBtn').onclick = () => { showView('dashboard'); state.quiz = null; };

  /* ---------- Bookmarks Manager (DOM API) ---------- */
  byId('manageBookmarksBtn').onclick = () => {
    state.reviewOrigin = 'dashboard';
    state.bookmarkReviewPage = 0;
    state.bookmarkReviewMode = true;
    // Hide filter controls in bookmark review mode
    byId('reviewFilter').classList.add('hidden');
    byId('reviewSearch').classList.add('hidden');
    byId('reviewBackBtn').textContent = 'Back to Dashboard';
    renderBookmarkPage();
    showView('reviewView');
  };

  byId('exportBookmarksBtn').onclick = () => downloadFile('bookmarks.json', JSON.stringify(getBookmarks(), null, 2), 'application/json');

  byId('clearResumeBtn').onclick = () => {
    if (confirm('Delete your saved quiz session? You will lose your current progress.')) {
      stopTimer();
      localStorage.removeItem(STORAGE_KEYS.activeQuiz);
      state.quiz = null;
      updateResumeButtonVisibility();
      alert('Saved quiz session deleted.');
    }
  };

  byId('clearCacheBtn').onclick = clearAppCache;

  byId('paletteScrollLeft').onclick = () => scrollPalette(-1);
  byId('paletteScrollRight').onclick = () => scrollPalette(1);

  let touchStartX = 0;
  const paletteContainer = byId('palette').parentElement;
  paletteContainer.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  paletteContainer.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 30) scrollPalette(diff > 0 ? 1 : -1);
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (!state.quiz || !byId('quizView').classList.contains('active')) return;
    const targetTag = e.target.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || e.target.isContentEditable) return;

    if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const q = state.quiz.questions[state.quiz.current];
      if (idx < q.renderOptions.length) {
        // Prevent changing answers in Practice Mode once clicked
        if (state.quiz.practiceMode && state.quiz.answers[state.quiz.current] != null) return;
        
        state.quiz.answers[state.quiz.current] = idx;
        renderQuestion();
        persistActiveQuiz();
      }
    }
    if (e.key === 'ArrowLeft') byId('prevBtn').click();
    if (e.key === 'ArrowRight') byId('nextBtn').click();

    if (e.key.toLowerCase() === 's') byId('submitBtn').click();
    if (e.key.toLowerCase() === 'f' && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  });
}

function resumeQuiz(confirmedByUser = false) {
  const saved = readJson(STORAGE_KEYS.activeQuiz, null);
  if (!saved) return;
  const targetBank = state.metadata.find((x) => x.file === saved.bankFile);
  if (!targetBank) return;
  if (!confirmedByUser && !confirm('Resume previous quiz for "' + targetBank.title + '"?')) return;

  state.selectedBank = targetBank;
  byId('selectedBankLabel').textContent = targetBank.title;
  byId('startQuizBtn').disabled = false;

  const source = state.parsedBanks[saved.bankFile] || [];
  const map = new Map(source.map((q) => [q.id, q]));
  const questions = saved.questionIds.map((id, i) => {
    const q = map.get(id);
    if (!q) return null;
    const savedOrder = saved.optionOrders?.[i];
    const hasValidSavedOrder = Array.isArray(savedOrder)
      && savedOrder.length === q.options.length
      && new Set(savedOrder).size === savedOrder.length
      && savedOrder.every((origIdx) => Number.isInteger(origIdx) && origIdx >= 0 && origIdx < q.options.length);
    const renderOptions = hasValidSavedOrder
      ? savedOrder.map((origIdx) => ({ ...q.options[origIdx], _orig: origIdx }))
      : applyOptionOrder(q, false);
    return { ...q, renderOptions };
  }).filter(Boolean);

  if (!questions.length) return;

  state.quiz = {
    bank: targetBank,
    questions,
    current: saved.current || 0,
    answers: saved.answers || Array(questions.length).fill(null),
    visited: saved.visited || Array(questions.length).fill(false),

    elapsed: saved.elapsed || 0,
    startedAt: saved.startedAt || Date.now(),
    timedMode: saved.timedMode,
    examMode: saved.examMode || false,
    practiceMode: saved.practiceMode || false,
    timerId: null,
    lastResult: null,
    questionTimes: saved.questionTimes || Array(questions.length).fill(0),
    lastQuestionStartTime: Date.now()
  };

  byId('timer').textContent = formatTime(state.quiz.elapsed);
  renderQuestion();
  startTimer();
  showView('quizView');
  cacheActiveQuizAssets(state.quiz);
}

/* ---------- Bank List (DOM API) ---------- */
function renderBankList() {
  const search = byId('bankSearch').value.trim().toLowerCase();
  let rows = [...state.metadata].filter((b) => {
    if (!search) return true;
    return (b.title + ' ' + b.file).toLowerCase().includes(search);
  });
  rows.sort((a, b) => a.title.localeCompare(b.title));

  const bankList = byId('bankList');
  bankList.innerHTML = '';

  if (!rows.length) {
    bankList.appendChild(createEl('p', ['muted'], 'No banks found.'));
    return;
  }

  rows.forEach((b) => {
    const totalCount = state.bankCounts[b.file];
    const isSelected = state.selectedBank?.file === b.file;

    const card = createEl('article', ['bank-card', isSelected ? 'selected' : null].filter(Boolean));
    card.dataset.bank = b.file;

    const title = createEl('div', ['bank-card-title'], b.title);
    const badges = createEl('div', ['bank-card-badges']);
    const pill = createEl('span', ['pill', 'count-pill'], totalCount !== undefined ? totalCount + ' MCQs' : '0 MCQs');
    badges.appendChild(pill);

    card.appendChild(title);
    card.appendChild(badges);

    card.addEventListener('click', () => {
      state.selectedBank = state.metadata.find((x) => x.file === b.file);
      byId('selectedBankLabel').textContent = state.selectedBank?.title || 'None Selected';
      byId('startQuizBtn').disabled = !state.selectedBank;
      renderBankList();
    });

    bankList.appendChild(card);
  });

  updateResumeButtonVisibility();
}

async function loadBanks() {
  const bankList = byId('bankList');
  bankList.innerHTML = '';
  bankList.appendChild(createEl('p', ['muted'], 'Loading question banks...'));

  const metadataRes = await fetch('metadata.json');
  if (!metadataRes.ok) throw new Error('Invalid metadata.json');
  const metadataJson = await metadataRes.json();
  const banks = metadataJson.question_banks || [];
  state.metadata = banks.map((b) => ({ ...b, file: normalizePath('questionbanks/' + b.file.replace(/^questionbanks\//, '')) }));

  const errors = [];
  await Promise.all(state.metadata.map(async (bank) => {
    try {
      const txt = await fetchText(bank.file);
      const { parsed, errors: parseErrors } = parseQuestions(txt, bank.file);
      if (parsed.length > CONSTANTS.MAX_BANK_SIZE) {
        console.warn('Bank ' + bank.title + ' exceeds max size, truncating to ' + CONSTANTS.MAX_BANK_SIZE);
        parsed.length = CONSTANTS.MAX_BANK_SIZE;
      }
      state.parsedBanks[bank.file] = parsed;
      state.bankCounts[bank.file] = parsed.length;
      if (parseErrors.length) errors.push(bank.title + ' (' + parseErrors.length + ' errors)');
    } catch (e) {
      errors.push(bank.title);
      state.parsedBanks[bank.file] = [];
      state.bankCounts[bank.file] = 0;
    }
  }));

  renderBankList();
  if (errors.length) console.warn('Some files had issues:\n- ' + errors.join('\n- '));
}

function registerPwa() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

async function init() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  let theme = savedTheme;
  if (!theme) theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  byId('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';

  bindGlobalEvents();
  registerPwa();

  window.addEventListener('popstate', (e) => {
    if (e.state?.view) showView(e.state.view);
    else showView('dashboard');
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.quiz && byId('quizView').classList.contains('active')) {
      e.preventDefault();
      e.returnValue = 'You have an active quiz in progress. Are you sure you want to leave?';
      return e.returnValue;
    }
  });

  await loadBanks();

  const lastView = readJson('uqp_current_view', 'dashboard');
  const savedQuiz = readJson(STORAGE_KEYS.activeQuiz, null);

  const urlParams = new URLSearchParams(window.location.search);
  let bankParam = urlParams.get('bank');
  if (!bankParam && window.location.hash) bankParam = window.location.hash.substring(1);

  if (bankParam) {
    const cleanParam = bankParam.toLowerCase().replace('.txt', '').trim();
    const matchedBank = state.metadata.find((b) =>
      b.file.toLowerCase().includes(cleanParam) || b.title.toLowerCase().includes(cleanParam)
    );
    if (matchedBank) {
      state.selectedBank = matchedBank;
      byId('selectedBankLabel').textContent = matchedBank.title;
      byId('startQuizBtn').disabled = false;
      renderBankList();
    }
  }

  if (savedQuiz && lastView === 'quizView') {
    resumeQuiz(true);
  } else if (lastView === 'reviewView') {
    // Restore review mode context from saved state
    const reviewMode = readJson('uqp_review_mode', null);
    if (reviewMode?.bookmarkMode) {
      // Was in bookmark review mode
      state.reviewOrigin = reviewMode.origin || 'dashboard';
      state.bookmarkReviewMode = true;
      state.bookmarkReviewPage = 0;
      byId('reviewFilter').classList.add('hidden');
      byId('reviewSearch').classList.add('hidden');
      byId('reviewBackBtn').textContent = 'Back to Dashboard';
      renderBookmarkPage();
      showView('reviewView');
    } else if (state.quiz?.lastResult) {
      // Was in results review mode
      state.reviewOrigin = reviewMode?.origin || 'resultsView';
      state.bookmarkReviewMode = false;
      byId('reviewFilter').classList.remove('hidden');
      byId('reviewSearch').classList.remove('hidden');
      byId('reviewBackBtn').textContent = 'Back';
      buildReviewList(reviewMode?.filter || 'all', reviewMode?.search || '');
      showView('reviewView');
    } else {
      // No quiz result available, go dashboard
      showView('dashboard');
    }
  } else {
    showView(lastView === 'quizView' ? 'dashboard' : lastView);
  }

  // Render storage info on homepage
  renderStorageInfo();
}

init().catch((e) => alert('Initialization failed: ' + e.message));
