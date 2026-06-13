import { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { fetchQBanks, parseQBankString } from './data/raw-questions';
import { usePersistedRecords } from './store/usePersistedRecords';
import { Menu } from './components/Menu';
import { Quiz } from './components/Quiz';
import { Results } from './components/Results';
import { Sun, Moon, Volume2, VolumeX } from 'lucide-react';
import type { AppScreen, QuizSession, QuizMode, QuizSessionType, QBank, QuizSettings } from './types';

export default function App() {
  const store = usePersistedRecords();
  const [screen, setScreen] = useState<AppScreen>('MENU');
  
  const [qbanks, setQbanks] = useState<QBank[]>([]);
  const [qbanksLoaded, setQbanksLoaded] = useState(false);
  const [selectedQBankId, setSelectedQBankId] = useState<string>('');

  useEffect(() => {
    fetchQBanks().then(banks => {
      if (banks.length > 0) {
        setQbanks(banks);
        
        const params = new URLSearchParams(window.location.search);
        const bankParam = params.get('bank');
        let initialBankId = banks[0].id;

        if (bankParam) {
          const found = banks.find(b => b.id === bankParam || b.id === `${bankParam}.txt` || b.name.includes(bankParam));
          if (found) {
            initialBankId = found.id;
          }
        }
        
        setSelectedQBankId(initialBankId);
      }
      setQbanksLoaded(true);
    });
  }, []);

  const selectedQBank = qbanks.find(q => q.id === selectedQBankId) || qbanks[0];
  const selectedQuestions = selectedQBank?.questions || [];

  const [activeSession, setActiveSession] = useState<QuizSession | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('uqp_active_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        setActiveSession(parsed);
      }
    } catch(e) {}
  }, []);

  useEffect(() => {
    if (store.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [store.theme]);

  if (!store.isLoaded || !qbanksLoaded) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-stone-500 font-medium">Loading banks...</div>
    </div>
  );

  const handleUploadQBank = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const newId = 'qbank-' + Date.now();
      const parsed = parseQBankString(content, newId);
      if (parsed.length > 0) {
        setQbanks(prev => [...prev, { id: newId, name: file.name, questions: parsed }]);
        setSelectedQBankId(newId);
      } else {
        alert("Could not parse any questions from this file.");
      }
    };
    reader.readAsText(file);
  };

  const initSession = (selected: import('./types').Question[], settings: QuizSettings, mode: QuizMode, sessionType: QuizSessionType) => {
    if (!selectedQBank) return;
    let finalized = [...selected];
    if (settings.shuffleQuestions) {
      finalized = finalized.sort(() => 0.5 - Math.random());
    }

    if (settings.shuffleOptions) {
      finalized = finalized.map(q => {
        const optionsWithIndices = q.options.map((opt, i) => ({ text: opt, originalIndex: i }));
        const shuffledOptions = optionsWithIndices.sort(() => 0.5 - Math.random());
        const newCorrectIndex = shuffledOptions.findIndex(o => o.originalIndex === q.correctAnswerIndex);
        return {
          ...q,
          options: shuffledOptions.map(o => o.text),
          correctAnswerIndex: newCorrectIndex
        };
      });
    }

    const sessionData: QuizSession = {
      bankId: selectedQBank.id,
      bankName: selectedQBank.name,
      questions: finalized,
      mode,
      sessionType,
      settings,
      answers: {},
      currentIndex: 0,
      elapsedTime: 0
    };
    
    setActiveSession(sessionData);
    localStorage.setItem('uqp_active_session', JSON.stringify(sessionData));
    setScreen('QUIZ');
  };

  const handleStartNew = (count: number, sessionType: QuizSessionType, settings: QuizSettings) => {
    const selected = [...selectedQuestions].sort(() => 0.5 - Math.random()).slice(0, count);
    initSession(selected, settings, 'NEW', sessionType);
  };

  const handleStartReview = (mode: QuizMode, sessionType: QuizSessionType, settings: QuizSettings) => {
    let selected = [];
    if (mode === 'REVIEW_BOOKMARKS') {
      selected = selectedQuestions.filter(q => store.bookmarkedIds.has(q.id));
    } else if (mode === 'REVIEW_INCORRECT') {
      selected = selectedQuestions.filter(q => store.incorrectIds.has(q.id));
    }

    if (selected.length === 0) return;
    initSession(selected, settings, mode, sessionType);
  };

  const updateSession = (updater: (s: QuizSession) => QuizSession) => {
    setActiveSession(prev => {
      if (!prev) return prev;
      const next = updater(prev);
      localStorage.setItem('uqp_active_session', JSON.stringify(next));
      return next;
    });
  };

  const handleAnswer = (qid: string, optionIndex: number) => {
    updateSession(s => ({
      ...s,
      answers: { ...s.answers, [qid]: optionIndex }
    }));
  };

  const handleTimeTick = () => {
    updateSession(s => ({
      ...s,
      elapsedTime: s.elapsedTime + 1
    }));
  };

  const handleFinish = () => {
    if (!activeSession) return;
    const incorrectsToAdd: string[] = [];
    const correctsToRemove: string[] = [];

    activeSession.questions.forEach(q => {
      const provided = activeSession.answers[q.id];
      const isCorrect = provided === q.correctAnswerIndex;
      
      if (isCorrect) {
        correctsToRemove.push(q.id);
      } else {
        incorrectsToAdd.push(q.id);
      }
    });

    if (incorrectsToAdd.length > 0) store.addIncorrectUrls(incorrectsToAdd);
    correctsToRemove.forEach(id => store.removeIncorrectUrl(id));
    
    localStorage.removeItem('uqp_active_session');
    setScreen('RESULTS');
  };

  const handleClearSession = () => {
    localStorage.removeItem('uqp_active_session');
    setActiveSession(null);
  };

  const handleClearCache = () => {
    if (confirm("Clear all cache? This will remove saved quiz progress, bookmarks, and incorrectly answered lists.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 flex flex-col items-center justify-center">
      <div className="fixed top-4 right-4 flex items-center gap-2 z-50">
        <button
          onClick={store.toggleSound}
          className="p-2 rounded-full hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors"
          title={store.soundEnabled ? "Disable Sound" : "Enable Sound"}
        >
          {store.soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
        <button
          onClick={store.toggleTheme}
          className="p-2 rounded-full hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors"
          title={store.theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
          {store.theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
      </div>
      
      <AnimatePresence mode="wait">
        {screen === 'MENU' && (
          <Menu
            key="menu"
            qbanks={qbanks}
            selectedQBankId={selectedQBankId}
            onSelectQBank={setSelectedQBankId}
            onUploadQBank={handleUploadQBank}
            hasActiveSession={!!activeSession}
            onResumeSession={() => setScreen('QUIZ')}
            onClearSession={handleClearSession}
            onClearCache={handleClearCache}
            bookmarkedCount={selectedQuestions.filter(q => store.bookmarkedIds.has(q.id)).length}
            incorrectCount={selectedQuestions.filter(q => store.incorrectIds.has(q.id)).length}
            onStartNew={handleStartNew}
            onStartReview={handleStartReview}
          />
        )}
        
        {screen === 'QUIZ' && activeSession && (
          <Quiz
            key="quiz"
            questions={activeSession.questions}
            currentIndex={activeSession.currentIndex}
            answers={activeSession.answers}
            bookmarkedIds={store.bookmarkedIds}
            sessionType={activeSession.sessionType}
            settings={activeSession.settings}
            elapsedTime={activeSession.elapsedTime}
            bankName={activeSession.bankName}
            onAnswer={handleAnswer}
            onNext={() => updateSession(s => ({ ...s, currentIndex: s.currentIndex + 1 }))}
            onPrev={() => updateSession(s => ({ ...s, currentIndex: s.currentIndex - 1 }))}
            onJump={(index) => updateSession(s => ({ ...s, currentIndex: index }))}
            onToggleBookmark={store.toggleBookmark}
            onTimeTick={handleTimeTick}
            onQuit={() => setScreen('MENU')}
            onFinish={handleFinish}
          />
        )}

        {screen === 'RESULTS' && activeSession && (
          <Results
            key="results"
            session={activeSession}
            bookmarkedIds={store.bookmarkedIds}
            onToggleBookmark={store.toggleBookmark}
            onHome={() => {
              setActiveSession(null);
              setScreen('MENU');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
