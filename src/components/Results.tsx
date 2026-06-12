import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Bookmark, RotateCcw, Home, Target, Download, FileJson } from 'lucide-react';
import { cn } from '../lib/utils';
import type { QuizSession } from '../types';
import { useState } from 'react';

interface ResultsProps {
  session: QuizSession;
  bookmarkedIds: Set<string>;
  onHome: () => void;
  onToggleBookmark: (id: string) => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export function Results({ session, bookmarkedIds, onHome, onToggleBookmark }: ResultsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  const gradedQuestions = session.questions.map(q => {
    const userAnswer = session.answers[q.id];
    let status: 'correct' | 'incorrect' | 'unanswered' = 'unanswered';
    
    if (userAnswer === undefined) {
      unansweredCount++;
    } else if (userAnswer === q.correctAnswerIndex) {
      correctCount++;
      status = 'correct';
    } else {
      incorrectCount++;
      status = 'incorrect';
    }
    
    return { ...q, status, userAnswer };
  });

  const total = session.questions.length;
  const attempted = correctCount + incorrectCount;
  const accuracy = total ? ((correctCount / total) * 100).toFixed(2) : '0.00';
  const score = total ? ((correctCount / total) * 100).toFixed(2) : '0.00';

  const downloadFile = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const exportJSON = () => {
    const payload = {
      bankName: session.bankName,
      date: new Date().toISOString(),
      elapsed: session.elapsedTime,
      total,
      correct: correctCount,
      incorrect: incorrectCount,
      unanswered: unansweredCount,
      attempted,
      accuracy: parseFloat(accuracy),
      score: parseFloat(score)
    };
    downloadFile('result.json', JSON.stringify(payload, null, 2), 'application/json');
  };

  const exportCSV = () => {
    const rows = [['Quiz Name','Date','Time Taken','Total','Correct','Incorrect','Unanswered','Attempted','Accuracy','Score']];
    rows.push([
      session.bankName, 
      new Date().toISOString(), 
      formatTime(session.elapsedTime), 
      String(total), 
      String(correctCount), 
      String(incorrectCount), 
      String(unansweredCount), 
      String(attempted), 
      accuracy, 
      score
    ]);
    const csv = rows.map(r => r.map(x => '"' + String(x).replaceAll('"', '""') + '"').join(',')).join('\\n');
    downloadFile('result.csv', csv, 'text/csv');
  };

  const getValidMediaPath = (path: string) => {
    return `/${path}`;
  };

  const renderMedia = (mediaPaths?: string[]) => {
    if (!mediaPaths || mediaPaths.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-4 mt-4 mb-2">
        {mediaPaths.map((path, idx) => (
          <img 
            key={idx} 
            src={getValidMediaPath(path)} 
            alt="Media" 
            className="max-w-full rounded-xl border border-stone-200 shadow-sm max-h-[300px] object-contain cursor-zoom-in"
            onClick={(e) => {
              e.stopPropagation();
              window.open(getValidMediaPath(path), '_blank');
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl w-full mx-auto space-y-8 py-8"
    >
      <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-stone-100 flex flex-col items-center">
        <div className="w-24 h-24 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6">
          <Target className="w-12 h-12" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-heading font-bold text-stone-900 mb-2 text-center">
          Quiz Completed
        </h1>
        <p className="text-lg text-stone-500 mb-8 text-center max-w-lg">
          {session.bankName}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8 w-full max-w-2xl bg-stone-50 p-6 rounded-2xl border border-stone-100">
           <div className="text-center">
             <p className="text-3xl font-heading font-bold text-stone-800">{formatTime(session.elapsedTime)}</p>
             <p className="text-xs font-bold text-stone-500 uppercase mt-1">Time Taken</p>
           </div>
           <div className="text-center">
             <p className="text-3xl font-heading font-bold text-green-600">{correctCount}</p>
             <p className="text-xs font-bold text-stone-500 uppercase mt-1">Correct</p>
           </div>
           <div className="text-center">
             <p className="text-3xl font-heading font-bold text-red-500">{incorrectCount}</p>
             <p className="text-xs font-bold text-stone-500 uppercase mt-1">Incorrect</p>
           </div>
           <div className="text-center">
             <p className="text-3xl font-heading font-bold text-stone-500">{unansweredCount}</p>
             <p className="text-xs font-bold text-stone-500 uppercase mt-1">Unanswered</p>
           </div>
           <div className="text-center col-span-2 sm:col-span-4 mt-2 pt-6 border-t border-stone-200">
             <p className="text-4xl font-heading font-bold text-blue-600">{accuracy}%</p>
             <p className="text-xs font-bold text-stone-500 uppercase mt-1">Overall Score ({attempted}/{total} attempted)</p>
           </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white text-stone-700 border-2 border-stone-200 hover:bg-stone-50 transition shadow-sm"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={exportJSON}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white text-stone-700 border-2 border-stone-200 hover:bg-stone-50 transition shadow-sm"
          >
            <FileJson className="w-4 h-4" /> Export JSON
          </button>
          <button
            onClick={onHome}
            className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-medium bg-stone-900 border-2 border-stone-900 text-white hover:bg-stone-800 transition shadow active:scale-95 ml-2"
          >
            <Home className="w-4 h-4" /> Return Home
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-heading font-bold px-2 text-stone-800">Review Questions</h3>
        {gradedQuestions.map((q, i) => {
          const isExpanded = expandedId === q.id;
          const isBookmarked = bookmarkedIds.has(q.id);
          const isCorrect = q.status === 'correct';
          
          return (
            <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden transition-all">
              <div 
                className="p-5 flex items-start gap-4 cursor-pointer hover:bg-stone-50"
                onClick={() => setExpandedId(isExpanded ? null : q.id)}
              >
                <div className={cn(
                  "mt-1 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                  isCorrect ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                )}>
                  {isCorrect ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                </div>
                
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm font-medium text-stone-500 mb-1">Question {i + 1}</p>
                  <p className="text-stone-900 font-medium leading-relaxed line-clamp-2">{q.text}</p>
                </div>

                <div 
                  className="flex-shrink-0 p-2 text-stone-400 hover:text-amber-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleBookmark(q.id);
                  }}
                >
                  <Bookmark className="w-5 h-5" fill={isBookmarked ? "currentColor" : "none"} />
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-stone-100 bg-stone-50 px-5 sm:px-16 py-6"
                  >
                    <p className="text-stone-900 font-medium leading-relaxed mb-4">{q.text}</p>
                    {renderMedia(q.media)}
                    
                    <div className="space-y-2 mt-6">
                      {q.options.map((opt, optIdx) => {
                        const isSelected = session.answers[q.id] === optIdx;
                        const isCorrectAnswer = q.correctAnswerIndex === optIdx;
                        
                        let optStyle = "border-stone-200 bg-white text-stone-600";
                        if (isCorrectAnswer) optStyle = "border-green-500 bg-green-50 text-green-800 font-medium";
                        else if (isSelected && !isCorrectAnswer) optStyle = "border-red-500 bg-red-50 text-red-800";

                        return (
                          <div key={optIdx} className={cn("p-4 rounded-xl border flex flex-col", optStyle)}>
                            <div className="flex items-start gap-3">
                              {isCorrectAnswer && <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />}
                              {isSelected && !isCorrectAnswer && <X className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />}
                              {(!isCorrectAnswer && (!isSelected || isCorrectAnswer)) && <div className="w-5 h-5 flex-shrink-0" />}
                              <span className="leading-snug">{opt.text || '(Image Option)'}</span>
                            </div>
                            <div className="ml-8">
                              {renderMedia(opt.media)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
