const STORAGE_KEYS = {
  theme: 'uqp_theme',
  activeQuiz: 'uqp_active_quiz',
  attempts: 'uqp_attempts',
  bookmarks: 'uqp_bookmarks',
  incorrect: 'uqp_incorrect_index'
};

const MEDIA_EXT = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a'],
  video: ['.mp4', '.webm', '.mov']
};

const state = {
  metadata: [],
  bankCounts: {},
  selectedBank: null,
  parsedBanks: {},
  quiz: null,
  deferredPrompt: null
};

const byId = (id) => document.getElementById(id);
const escapeHtml = (s = '') => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function normalizePath(path) { return path?.trim().replace(/^\.\//, '') || ''; }

function mediaType(path) {
  const p = path.toLowerCase();
  if (MEDIA_EXT.image.some((ext) => p.endsWith(ext))) return 'image';
  if (MEDIA_EXT.audio.some((ext) => p.endsWith(ext))) return 'audio';
  if (MEDIA_EXT.video.some((ext) => p.endsWith(ext))) return 'video';
  return 'unsupported';
}

function renderMedia(paths, className = 'question-media') {
  if (!paths?.length) return '';
  const html = paths.map((path) => {
    const safe = escapeHtml(path);
    const type = mediaType(path);
    if (type === 'image') return `<img loading="lazy" src="${safe}" alt="question media" data-lightbox="${safe}" />`;
    if (type === 'audio') return `<audio controls preload="none" src="${safe}"></audio>`;
    if (type === 'video') return `<video controls preload="none" src="${safe}"></video>`;
    return `<div class="muted">Unsupported media: ${safe}</div>`;
  }).join('');
  return `<div class="${className}">${html}</div>`;
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
  return `${bankFile}::${index}::${(text || '').slice(0, 40)}`;
}

function parseLegacyBlock(block, bankFile, index) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const qLine = lines.find((l) => l.startsWith('Q:'));
  if (!qLine) throw new Error(`Malformed question structure near question ${index + 1}`);
  const question = qLine.replace(/^Q:\s*/, '').trim();
  const optionLines = lines.filter((l) => !l.startsWith('Q:'));
  const options = optionLines.map((raw) => {
    const correct = /^[*+]\s+/.test(raw);
    return { text: raw.replace(/^[*+]\s+/, '').trim(), correct, media: [] };
  }).filter((o) => o.text);
  if (!options.length) throw new Error(`No options found near question ${index + 1}`);
  const correctCount = options.filter((o) => o.correct).length;
  if (correctCount !== 1) throw new Error(`Question ${index + 1} must have exactly one correct answer`);
  return {
    id: qid(bankFile, index, question),
    bankFile,
    question,
    metadata: {},
    media: [],
    options
  };
}

function parseStructuredBlock(block, bankFile, index) {
  const lines = block.split('\n').map((l) => l.trim());
  const q = {
    id: '', bankFile, question: '', metadata: {}, media: [], options: []
  };
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
    const metaMatch = line.match(/^(CATEGORY|TOPIC|SUBTOPIC|DIFFICULTY|TAGS|SOURCE|YEAR|EXAM):\s*(.*)$/i);
    if (metaMatch) {
      q.metadata[metaMatch[1].toUpperCase()] = metaMatch[2].trim();
      continue;
    }
    if (!inOptions) q.question += ` ${line}`;
  }

  q.question = q.question.trim();
  if (!q.question) throw new Error(`Missing question text near question ${index + 1}`);
  q.options = q.options.filter((o) => o.text || o.media.length);
  if (!q.options.length) throw new Error(`No options found near question ${index + 1}`);
  const correctCount = q.options.filter((o) => o.correct).length;
  if (correctCount !== 1) throw new Error(`Question ${index + 1} must have exactly one correct answer`);
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
      parsed.push(structured ? parseStructuredBlock(block, bankFile, i) : parseLegacyBlock(block, bankFile, i));
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  return { parsed, errors };
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed loading ${path}`);
  return res.text();
}

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  byId(id).classList.add('active');
}

function paletteClass(idx) {
  const qz = state.quiz;
  if (idx === qz.current) return 'status-current';
  if (!qz.visited[idx]) return 'status-notvisited';
  if (qz.marked[idx]) return 'status-marked';
  if (qz.answers[idx] != null) return 'status-answered';
  return 'status-unanswered';
}

function updatePalette() {
  const qz = state.quiz;
  byId('palette').innerHTML = qz.questions.map((_, i) => `<button class="${paletteClass(i)}" data-go="${i}">${i + 1}</button>`).join('');
  byId('palette').querySelectorAll('button').forEach((btn) => btn.onclick = () => { qz.current = Number(btn.dataset.go); renderQuestion(); persistActiveQuiz(); });
}

function applyOptionOrder(question, shouldShuffle) {
  if (!shouldShuffle) return question.options.map((o, idx) => ({ ...o, _orig: idx }));
  return shuffle(question.options.map((o, idx) => ({ ...o, _orig: idx })));
}

function getBookmarks() { return readJson(STORAGE_KEYS.bookmarks, []); }
function setBookmarks(v) { writeJson(STORAGE_KEYS.bookmarks, v); }

function renderQuestion() {
  const qz = state.quiz;
  const q = qz.questions[qz.current];
  qz.visited[qz.current] = true;
  byId('currentQ').textContent = String(qz.current + 1);
  byId('totalQ').textContent = String(qz.questions.length);
  byId('quizTitle').textContent = qz.bank.title;
  byId('progressBar').style.width = `${((qz.current + 1) / qz.questions.length) * 100}%`;

  const selected = qz.answers[qz.current];
  const html = `
    <h3>${escapeHtml(q.question)}</h3>
    <div class="muted">${Object.entries(q.metadata || {}).map(([k, v]) => `${k}: ${v}`).join(' | ')}</div>
    ${renderMedia(q.media, 'question-media')}
    <div class="options">
      ${q.renderOptions.map((opt, idx) => `
        <button class="option ${selected === idx ? 'selected' : ''}" data-opt="${idx}">
          <div><strong>${idx + 1}.</strong> ${escapeHtml(opt.text || '(Media option)')}</div>
          ${renderMedia(opt.media, 'option-media')}
        </button>
      `).join('')}
    </div>
  `;
  byId('questionContainer').innerHTML = html;
  byId('questionContainer').querySelectorAll('[data-opt]').forEach((btn) => btn.onclick = () => {
    qz.answers[qz.current] = Number(btn.dataset.opt);
    persistActiveQuiz();
    renderQuestion();
  });
  byId('bookmarkBtn').textContent = getBookmarks().includes(q.id) ? 'Bookmarked' : 'Bookmark';
  updatePalette();
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  if (!state.quiz?.timedMode) { byId('timerWrap').classList.add('hidden'); return; }
  byId('timerWrap').classList.remove('hidden');
  clearInterval(state.quiz.timerId);
  state.quiz.timerId = setInterval(() => {
    state.quiz.elapsed += 1;
    byId('timer').textContent = formatTime(state.quiz.elapsed);
    persistActiveQuiz();
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
    answers: qz.answers,
    visited: qz.visited,
    marked: qz.marked,
    current: qz.current,
    elapsed: qz.elapsed,
    startedAt: qz.startedAt,
    timedMode: qz.timedMode
  });
}

function buildReviewList(filter = 'all', search = '') {
  const qz = state.quiz;
  if (!qz) return;
  const term = search.trim().toLowerCase();
  const filtered = qz.questions.map((q, i) => ({ q, i })).filter(({ q, i }) => {
    const user = qz.answers[i];
    const correct = q.renderOptions.findIndex((o) => o.correct);
    const isAnswered = user != null;
    const isCorrect = user === correct;
    if (filter === 'incorrect' && (user == null || isCorrect)) return false;
    if (filter === 'unanswered' && user != null) return false;
    if (filter === 'marked' && !qz.marked[i]) return false;
    if (filter === 'correct' && !isCorrect) return false;
    if (!term) return true;
    return [q.question, q.metadata.CATEGORY, q.metadata.TOPIC, q.metadata.TAGS, q.bankFile].join(' ').toLowerCase().includes(term);
  });

  byId('reviewList').innerHTML = filtered.map(({ q, i }) => {
    const user = qz.answers[i];
    const correct = q.renderOptions.findIndex((o) => o.correct);
    const status = user == null ? 'unanswered' : user === correct ? 'correct' : 'incorrect';
    return `
      <article class="review-card">
        <div class="badge ${status}">${status.toUpperCase()}</div>
        ${qz.marked[i] ? '<div class="badge">MARKED</div>' : ''}
        <h4>Q${i + 1}. ${escapeHtml(q.question)}</h4>
        ${renderMedia(q.media, 'question-media')}
        <div class="options">
          ${q.renderOptions.map((opt, idx) => {
            const cls = idx === correct ? 'correct' : (idx === user && user !== correct ? 'incorrect' : '');
            return `<div class="option ${cls}"><strong>${idx + 1}.</strong> ${escapeHtml(opt.text || '(Media option)')}${renderMedia(opt.media, 'option-media')}</div>`;
          }).join('')}
        </div>
      </article>
    `;
  }).join('') || '<p class="muted">No questions match this filter.</p>';
}

function calculateResult(qz) {
  let correct = 0; let incorrect = 0; let unanswered = 0;
  qz.questions.forEach((q, i) => {
    const user = qz.answers[i];
    const answerIdx = q.renderOptions.findIndex((o) => o.correct);
    if (user == null) unanswered += 1;
    else if (user === answerIdx) correct += 1;
    else incorrect += 1;
  });
  const attempted = correct + incorrect;
  const total = qz.questions.length;
  return {
    correct,
    incorrect,
    unanswered,
    attempted,
    total,
    accuracy: total ? (correct / total) * 100 : 0,
    score: total ? (correct / total) * 100 : 0
  };
}

function saveAttempt(result) {
  const attempts = readJson(STORAGE_KEYS.attempts, []);
  attempts.unshift(result);
  writeJson(STORAGE_KEYS.attempts, attempts.slice(0, 200));
}

function updateIncorrectIndex(qz) {
  const idx = readJson(STORAGE_KEYS.incorrect, {});
  qz.questions.forEach((q, i) => {
    const answerIdx = q.renderOptions.findIndex((o) => o.correct);
    if (qz.answers[i] != null && qz.answers[i] !== answerIdx) idx[q.id] = true;
  });
  writeJson(STORAGE_KEYS.incorrect, idx);
}

function renderAnalytics() {
  const attempts = readJson(STORAGE_KEYS.attempts, []);
  if (!attempts.length) {
    byId('analytics').innerHTML = '<p class="muted">No attempts yet.</p>';
    return;
  }
  const scores = attempts.map((a) => a.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const best = Math.max(...scores);
  const worst = Math.min(...scores);

  const subjectPerf = {};
  const topicPerf = {};
  attempts.forEach((a) => {
    const s = a.subject || 'Unknown';
    subjectPerf[s] = subjectPerf[s] || [];
    subjectPerf[s].push(a.score);
    (a.topicSummary || []).forEach((t) => {
      topicPerf[t.topic] = topicPerf[t.topic] || [];
      topicPerf[t.topic].push(t.accuracy);
    });
  });

  const top = (obj, asc = false) => Object.entries(obj)
    .map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])
    .sort((a, b) => asc ? a[1] - b[1] : b[1] - a[1])
    .slice(0, 5);

  byId('analytics').innerHTML = `
    <div>Total Attempts: <strong>${attempts.length}</strong></div>
    <div>Average Score: <strong>${avg.toFixed(1)}%</strong></div>
    <div>Best Score: <strong>${best.toFixed(1)}%</strong></div>
    <div>Worst Score: <strong>${worst.toFixed(1)}%</strong></div>
    <div class="muted">Recent: ${attempts.slice(0, 5).map((a) => `${a.bankName} (${a.score.toFixed(1)}%)`).join(' | ')}</div>
    <div class="muted">Strong Areas: ${top(topicPerf).map(([k]) => k).join(', ') || 'N/A'}</div>
    <div class="muted">Weak Areas: ${top(topicPerf, true).map(([k]) => k).join(', ') || 'N/A'}</div>
    <div class="muted">Subject-wise: ${Object.entries(subjectPerf).map(([k, v]) => `${k} ${(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1)}%`).join(' | ')}</div>
  `;
}

function buildTopicSummary(qz) {
  const map = {};
  qz.questions.forEach((q, i) => {
    const topic = q.metadata.TOPIC || 'Unknown';
    map[topic] = map[topic] || { total: 0, correct: 0, topic };
    map[topic].total += 1;
    if (qz.answers[i] === q.renderOptions.findIndex((o) => o.correct)) map[topic].correct += 1;
  });
  return Object.values(map).map((x) => ({ ...x, accuracy: x.total ? (x.correct / x.total) * 100 : 0 }));
}

function submitQuiz() {
  const qz = state.quiz;
  const answered = qz.answers.filter((x) => x != null).length;
  const unanswered = qz.questions.length - answered;
  const marked = qz.marked.filter(Boolean).length;
  if (!confirm(`Submit quiz?\nAnswered: ${answered}\nUnanswered: ${unanswered}\nMarked: ${marked}`)) return;

  stopTimer();
  const result = calculateResult(qz);
  updateIncorrectIndex(qz);
  const payload = {
    ...result,
    bankName: qz.bank.title,
    subject: qz.bank.subject,
    date: new Date().toISOString(),
    elapsed: qz.elapsed,
    topicSummary: buildTopicSummary(qz)
  };
  saveAttempt(payload);
  localStorage.removeItem(STORAGE_KEYS.activeQuiz);

  byId('resultSummary').innerHTML = `
    <div>Quiz Name: <strong>${escapeHtml(payload.bankName)}</strong></div>
    <div>Date: ${new Date(payload.date).toLocaleString()}</div>
    <div>Time Taken: ${formatTime(payload.elapsed)}</div>
    <div>Total Questions: ${payload.total}</div>
    <div>Correct: ${payload.correct}</div>
    <div>Incorrect: ${payload.incorrect}</div>
    <div>Unanswered: ${payload.unanswered}</div>
    <div>Attempted: ${payload.attempted}</div>
    <div>Accuracy: ${payload.accuracy.toFixed(2)}%</div>
    <div>Final Score: ${payload.score.toFixed(2)}%</div>
  `;

  qz.lastResult = payload;
  showView('resultsView');
  renderAnalytics();
}

async function prepareQuiz(bank, questions, settings) {
  let selectedQuestions = settings.shuffleQuestions ? shuffle(questions) : [...questions];
  if (settings.bookmarkedOnly) {
    const bookmarks = new Set(getBookmarks());
    selectedQuestions = selectedQuestions.filter((q) => bookmarks.has(q.id));
  }
  if (!selectedQuestions.length) throw new Error('No questions available for selected filters/bookmarks.');

  const count = settings.count === 'all' ? selectedQuestions.length : Math.min(Number(settings.count), selectedQuestions.length);
  selectedQuestions = selectedQuestions.slice(0, count).map((q) => ({ ...q, renderOptions: applyOptionOrder(q, settings.shuffleOptions) }));

  state.quiz = {
    bank,
    questions: selectedQuestions,
    current: 0,
    answers: Array(selectedQuestions.length).fill(null),
    visited: Array(selectedQuestions.length).fill(false),
    marked: Array(selectedQuestions.length).fill(false),
    elapsed: 0,
    startedAt: Date.now(),
    timedMode: settings.timedMode,
    timerId: null,
    lastResult: null
  };

  if (settings.fullscreenMode && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  byId('timer').textContent = '00:00';
  renderQuestion();
  startTimer();
  showView('quizView');
  persistActiveQuiz();
}

function csvFromResult(res) {
  const rows = [['Quiz Name','Date','Time Taken','Total','Correct','Incorrect','Unanswered','Attempted','Accuracy','Score']];
  rows.push([res.bankName, res.date, formatTime(res.elapsed), res.total, res.correct, res.incorrect, res.unanswered, res.attempted, res.accuracy.toFixed(2), res.score.toFixed(2)]);
  return rows.map((r) => r.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(',')).join('\n');
}

function downloadFile(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function bindGlobalEvents() {
  byId('themeToggle').onclick = () => {
    const curr = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', curr);
    localStorage.setItem(STORAGE_KEYS.theme, curr);
  };

  byId('bankSearch').oninput = renderBankList;
  byId('subjectFilter').onchange = renderBankList;
  byId('yearFilter').onchange = renderBankList;
  byId('sortBanks').onchange = renderBankList;

  byId('startQuizBtn').onclick = async () => {
    try {
      if (!state.selectedBank) return;
      const settings = {
        count: byId('questionCount').value,
        shuffleQuestions: byId('shuffleQuestions').checked,
        shuffleOptions: byId('shuffleOptions').checked,
        timedMode: byId('timedMode').checked,
        fullscreenMode: byId('fullscreenMode').checked,
        bookmarkedOnly: byId('bookmarkedOnly').checked
      };
      const questions = state.parsedBanks[state.selectedBank.file] || [];
      await prepareQuiz(state.selectedBank, questions, settings);
    } catch (e) {
      alert(`Unable to start quiz: ${e.message}`);
    }
  };

  byId('resumeBtn').onclick = () => resumeQuiz(true);
  byId('prevBtn').onclick = () => { if (state.quiz.current > 0) { state.quiz.current -= 1; renderQuestion(); persistActiveQuiz(); } };
  byId('nextBtn').onclick = () => { if (state.quiz.current < state.quiz.questions.length - 1) { state.quiz.current += 1; renderQuestion(); persistActiveQuiz(); } };
  byId('markBtn').onclick = () => { state.quiz.marked[state.quiz.current] = !state.quiz.marked[state.quiz.current]; renderQuestion(); persistActiveQuiz(); };
  byId('bookmarkBtn').onclick = () => {
    const q = state.quiz.questions[state.quiz.current];
    const s = new Set(getBookmarks());
    if (s.has(q.id)) s.delete(q.id); else s.add(q.id);
    setBookmarks([...s]);
    renderQuestion();
  };
  byId('submitBtn').onclick = submitQuiz;

  byId('reviewBtn').onclick = () => { buildReviewList('all'); showView('reviewView'); };
  byId('reviewFilter').onchange = () => buildReviewList(byId('reviewFilter').value, byId('reviewSearch').value);
  byId('reviewSearch').oninput = () => buildReviewList(byId('reviewFilter').value, byId('reviewSearch').value);
  byId('reviewBackBtn').onclick = () => showView('resultsView');

  byId('downloadCsvBtn').onclick = () => downloadFile('result.csv', csvFromResult(state.quiz.lastResult), 'text/csv');
  byId('downloadJsonBtn').onclick = () => downloadFile('result.json', JSON.stringify(state.quiz.lastResult, null, 2), 'application/json');
  byId('printBtn').onclick = () => window.print();
  byId('backHomeBtn').onclick = () => { showView('dashboard'); state.quiz = null; renderAnalytics(); };

  byId('manageBookmarksBtn').onclick = () => {
    const bookmarks = new Set(getBookmarks());
    const bankQuestions = Object.values(state.parsedBanks).flat();
    const marked = bankQuestions.filter((q) => bookmarks.has(q.id));
    byId('reviewList').innerHTML = marked.map((q, i) => `<article class="review-card"><h4>${i + 1}. ${escapeHtml(q.question)}</h4>${renderMedia(q.media)}<div class="muted">${q.bankFile}</div></article>`).join('') || '<p class="muted">No bookmarks yet.</p>';
    showView('reviewView');
  };

  byId('exportBookmarksBtn').onclick = () => downloadFile('bookmarks.json', JSON.stringify(getBookmarks(), null, 2), 'application/json');

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target?.matches?.('[data-lightbox]')) {
      byId('lightboxImg').src = target.getAttribute('data-lightbox');
      byId('lightbox').classList.remove('hidden');
    }
  });
  byId('lightboxClose').onclick = () => byId('lightbox').classList.add('hidden');
  byId('lightbox').onclick = (e) => { if (e.target.id === 'lightbox') byId('lightbox').classList.add('hidden'); };

  window.addEventListener('keydown', (e) => {
    if (!state.quiz || byId('quizView').className.indexOf('active') === -1) return;
    if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const q = state.quiz.questions[state.quiz.current];
      if (idx < q.renderOptions.length) {
        state.quiz.answers[state.quiz.current] = idx;
        renderQuestion();
        persistActiveQuiz();
      }
    }
    if (e.key === 'ArrowLeft') byId('prevBtn').click();
    if (e.key === 'ArrowRight') byId('nextBtn').click();
    if (e.key.toLowerCase() === 'm') byId('markBtn').click();
    if (e.key.toLowerCase() === 's') byId('submitBtn').click();
    if (e.key.toLowerCase() === 'f' && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    byId('installBtn').classList.remove('hidden');
  });

  byId('installBtn').onclick = async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    byId('installBtn').classList.add('hidden');
  };
}

function resumeQuiz(confirmedByUser = false) {
  const saved = readJson(STORAGE_KEYS.activeQuiz, null);
  if (!saved || !state.selectedBank) return;
  if (!confirmedByUser && !confirm('Resume previous quiz?')) return;
  const source = state.parsedBanks[saved.bankFile] || [];
  const map = new Map(source.map((q) => [q.id, q]));
  const questions = saved.questionIds.map((id) => map.get(id)).filter(Boolean).map((q) => ({ ...q, renderOptions: applyOptionOrder(q, false) }));
  if (!questions.length) return;
  state.quiz = {
    bank: state.selectedBank,
    questions,
    current: saved.current || 0,
    answers: saved.answers || Array(questions.length).fill(null),
    visited: saved.visited || Array(questions.length).fill(false),
    marked: saved.marked || Array(questions.length).fill(false),
    elapsed: saved.elapsed || 0,
    startedAt: saved.startedAt || Date.now(),
    timedMode: saved.timedMode,
    timerId: null,
    lastResult: null
  };
  byId('timer').textContent = formatTime(state.quiz.elapsed);
  renderQuestion();
  startTimer();
  showView('quizView');
}

function renderBankList() {
  const search = byId('bankSearch').value.trim().toLowerCase();
  const subject = byId('subjectFilter').value;
  const year = byId('yearFilter').value;
  const sort = byId('sortBanks').value;

  let rows = [...state.metadata].filter((b) => {
    if (subject && b.subject !== subject) return false;
    if (year && b.year !== year) return false;
    if (!search) return true;
    return [b.title, b.subject, b.year, b.file].join(' ').toLowerCase().includes(search);
  });

  rows.sort((a, b) => sort === 'za' ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title));

  byId('bankList').innerHTML = rows.map((b) => `
    <article class="bank-card ${state.selectedBank?.file === b.file ? 'selected' : ''}" data-bank="${escapeHtml(b.file)}">
      <div><strong>${escapeHtml(b.title)}</strong></div>
      <div class="muted">Subject: ${escapeHtml(b.subject || '-')} | Year: ${escapeHtml(b.year || '-')}</div>
      <div class="muted">File: ${escapeHtml(b.file)} | Questions: ${state.bankCounts[b.file] ?? '...'}</div>
    </article>
  `).join('') || '<p class="muted">No banks found.</p>';

  byId('bankList').querySelectorAll('[data-bank]').forEach((card) => card.onclick = () => {
    const bankFile = card.dataset.bank;
    state.selectedBank = state.metadata.find((x) => x.file === bankFile);
    byId('selectedBankLabel').textContent = state.selectedBank?.title || 'None';
    byId('startQuizBtn').disabled = !state.selectedBank;
    byId('resumeBtn').classList.toggle('hidden', !readJson(STORAGE_KEYS.activeQuiz, null) || readJson(STORAGE_KEYS.activeQuiz, null).bankFile !== bankFile);
    renderBankList();
  });
}

async function loadBanks() {
  const metadataRes = await fetch('metadata.json');
  if (!metadataRes.ok) throw new Error('Invalid metadata.json');
  const metadataJson = await metadataRes.json();
  const banks = metadataJson.question_banks || [];
  state.metadata = banks.map((b) => ({ ...b, file: normalizePath(`questionbanks/${b.file.replace(/^questionbanks\//, '')}`) }));

  const subjects = [...new Set(state.metadata.map((b) => b.subject).filter(Boolean))].sort();
  const years = [...new Set(state.metadata.map((b) => b.year).filter(Boolean))].sort();
  byId('subjectFilter').innerHTML += subjects.map((s) => `<option>${escapeHtml(s)}</option>`).join('');
  byId('yearFilter').innerHTML += years.map((y) => `<option>${escapeHtml(y)}</option>`).join('');

  const errors = [];
  await Promise.all(state.metadata.map(async (bank) => {
    try {
      const txt = await fetchText(bank.file);
      const { parsed, errors: parseErrors } = parseQuestions(txt, bank.file);
      state.parsedBanks[bank.file] = parsed;
      state.bankCounts[bank.file] = parsed.length;
      if (parseErrors.length) errors.push(`${bank.title}: ${parseErrors.join('; ')}`);
    } catch (e) {
      errors.push(`${bank.title}: ${e.message}`);
      state.parsedBanks[bank.file] = [];
      state.bankCounts[bank.file] = 0;
    }
  }));

  renderBankList();
  renderAnalytics();

  if (errors.length) alert(`Some banks have issues:\n- ${errors.join('\n- ')}`);
}

function registerPwa() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

async function init() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  bindGlobalEvents();
  registerPwa();
  await loadBanks();
}

init().catch((e) => alert(`Initialization failed: ${e.message}`));
