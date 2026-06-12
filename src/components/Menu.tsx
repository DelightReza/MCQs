import { motion } from 'motion/react';
import { Play, Bookmark, XCircle, Settings, Target, UploadCloud, PlayCircle, Trash2 } from 'lucide-react';
import { useState, useRef } from 'react';
import { cn } from '../lib/utils';
import type { QuizMode, QuizSessionType, QBank, QuizSettings } from '../types';

interface MenuProps {
  qbanks: QBank[];
  selectedQBankId: string;
  onSelectQBank: (id: string) => void;
  onUploadQBank: (file: File) => void;
  hasActiveSession: boolean;
  onResumeSession: () => void;
  onClearSession: () => void;
  onClearCache: () => void;
  bookmarkedCount: number;
  incorrectCount: number;
  onStartNew: (count: number, type: QuizSessionType, settings: QuizSettings) => void;
  onStartReview: (mode: QuizMode, type: QuizSessionType, settings: QuizSettings) => void;
}

export function Menu({
  qbanks,
  selectedQBankId,
  onSelectQBank,
  onUploadQBank,
  hasActiveSession,
  onResumeSession,
  onClearSession,
  onClearCache,
  bookmarkedCount,
  incorrectCount,
  onStartNew,
  onStartReview,
}: MenuProps) {
  const selectedQBank = qbanks.find(q => q.id === selectedQBankId) || qbanks[0];
  const totalAvailable = selectedQBank ? selectedQBank.questions.length : 0;
  const newOptions = [10, 20, 25, 40, 50, 75, 100, 200, 500].filter(n => n <= totalAvailable);
  const [questionCount, setQuestionCount] = useState<number | 'all'>(10);
  const [sessionType, setSessionType] = useState<QuizSessionType>('PRACTICE');
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [timedMode, setTimedMode] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadQBank(file);
    }
  };

  const getSettings = (): QuizSettings => ({
    shuffleQuestions,
    shuffleOptions,
    timedMode,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-3xl w-full mx-auto space-y-8"
    >
      <div className="text-center space-y-3">
        <h1 className="text-4xl sm:text-5xl font-heading font-bold tracking-tight text-stone-900">
          QuizDroid
        </h1>
        <p className="text-lg text-stone-500 max-w-lg mx-auto">
          Master your knowledge with focused MCQ sessions.
        </p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        {/* Settings Header */}
        <div className="p-6 border-b border-stone-100 bg-stone-50/50 flex items-center gap-3 relative">
          <Settings className="w-5 h-5 text-stone-400" />
          <h2 className="text-lg font-heading font-bold text-stone-900">Session Setup</h2>
        </div>
        
        <div className="p-6 sm:p-8 space-y-8">
          {/* QBank Selection */}
          <div className="space-y-3">
             <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">1. Select QBank</label>
             <div className="flex flex-col sm:flex-row gap-3">
               {qbanks.length > 0 ? (
                 <select 
                   value={selectedQBankId}
                   onChange={(e) => onSelectQBank(e.target.value)}
                   className="flex-1 text-base py-3.5 px-4 rounded-xl border-2 border-stone-100 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-stone-200 outline-none transition font-medium text-stone-800 cursor-pointer appearance-none truncate"
                   style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\\\'12\\\' height=\\\'12\\\' viewBox=\\\'0 0 12 12\\\' fill=\\\'none\\\' xmlns=\\\'http://www.w3.org/2000/svg\\\'%3E%3Cpath d=\\\'M2.5 4.5L6 8L9.5 4.5\\\' stroke=\\\'%23a8a29e\\\' stroke-width=\\\'2\\\' stroke-linecap=\\\'round\\\' stroke-linejoin=\\\'round\\\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' }}
                 >
                   {qbanks.map(q => (
                     <option key={q.id} value={q.id}>{q.name} ({q.questions.length} questions)</option>
                   ))}
                 </select>
               ) : (
                 <div className="flex-1 text-base py-3.5 px-4 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 text-stone-500 font-medium text-center">
                   No Question Banks Found
                 </div>
               )}
               <input 
                 type="file" 
                 accept=".txt" 
                 ref={fileInputRef} 
                 onChange={handleFileChange} 
                 className="hidden" 
               />
               <button
                 onClick={() => fileInputRef.current?.click()}
                 className="px-4 py-3 border-2 border-stone-200 bg-stone-50 text-stone-600 rounded-xl hover:bg-stone-100 hover:text-stone-900 transition flex items-center justify-center shrink-0 gap-2 font-medium w-full sm:w-auto"
                 title="Upload custom QBank (.txt)"
               >
                 <UploadCloud className="w-5 h-5 flex-shrink-0" />
                 <span>Upload QBank</span>
               </button>
             </div>
             <div className="text-xs text-stone-500 pt-1 leading-relaxed">
               Create your own question bank in a simple <code className="bg-stone-100 px-1 py-0.5 rounded font-mono text-stone-700">.txt</code> format. Separate questions with <code className="bg-stone-100 px-1 py-0.5 rounded font-mono text-stone-700">---</code> and mark the correct answer with a <code className="bg-stone-100 px-1 py-0.5 rounded font-mono text-stone-700">*</code>.{' '}
               <a href="./QBank_Template.txt" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline font-medium inline-flex items-center">
                 View Example Template
               </a>
             </div>
          </div>

          {!selectedQBank ? (
            <div className="p-8 text-center bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200">
              <UploadCloud className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-stone-800 mb-1">Please Upload a Question Bank</h3>
              <p className="text-stone-500 text-sm mb-4">You need to upload a .txt file containing your questions before you can start a quiz.</p>
              <a href="./QBank_Template.txt" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 underline font-medium">
                Check out the QBank format template
              </a>
            </div>
          ) : (
            <>
              {/* Mode Selection */}
              <div className="space-y-3">
                 <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">2. Select Mode</label>
                 <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => setSessionType('PRACTICE')}
                  className={cn(
                    "flex-1 p-5 rounded-xl border-2 text-left transition-all flex flex-col gap-1.5 focus:outline-none",
                    sessionType === 'PRACTICE' ? "border-blue-500 bg-blue-50/30" : "border-stone-100 hover:border-stone-200 bg-white"
                  )}
                >
                   <span className={cn("font-bold text-lg", sessionType === 'PRACTICE' ? "text-blue-900" : "text-stone-900")}>Practice Mode</span>
                   <span className={cn("text-sm leading-relaxed", sessionType === 'PRACTICE' ? "text-blue-700/80" : "text-stone-500")}>Immediate feedback upon answering. Best for learning and review.</span>
                </button>
                <button 
                  onClick={() => setSessionType('EXAM')}
                  className={cn(
                    "flex-1 p-5 rounded-xl border-2 text-left transition-all flex flex-col gap-1.5 focus:outline-none",
                    sessionType === 'EXAM' ? "border-amber-500 bg-amber-50/30" : "border-stone-100 hover:border-stone-200 bg-white"
                  )}
                >
                   <span className={cn("font-bold text-lg", sessionType === 'EXAM' ? "text-amber-900" : "text-stone-900")}>Exam Mode</span>
                   <span className={cn("text-sm leading-relaxed", sessionType === 'EXAM' ? "text-amber-700/80" : "text-stone-500")}>No feedback until final results. Simulate real test conditions.</span>
                </button>
             </div>
          </div>

          {/* Action Area */}
          <div className="pt-6 border-t border-stone-100 space-y-6">
            
            {hasActiveSession && (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-blue-900">Active Session Found</h3>
                  <p className="text-sm text-blue-700 font-medium">You have a quiz in progress.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={onClearSession} className="flex-1 sm:flex-none px-4 py-2 bg-white text-stone-600 rounded-lg font-medium border border-stone-200 hover:bg-stone-50 hover:text-red-600 transition">
                    Discard
                  </button>
                  <button onClick={onResumeSession} className="flex-1 sm:flex-none px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition shadow-sm">
                    Resume
                  </button>
                </div>
              </div>
            )}

            {/* Checkbox Options */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 bg-stone-50 p-3 rounded-lg border border-stone-100 cursor-pointer hover:bg-stone-100 transition">
                <input type="checkbox" className="w-4 h-4 text-blue-600 rounded border-stone-300 focus:ring-blue-500" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} />
                Shuffle Questions
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 bg-stone-50 p-3 rounded-lg border border-stone-100 cursor-pointer hover:bg-stone-100 transition">
                <input type="checkbox" className="w-4 h-4 text-blue-600 rounded border-stone-300 focus:ring-blue-500" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} />
                Shuffle Options
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 bg-stone-50 p-3 rounded-lg border border-stone-100 cursor-pointer hover:bg-stone-100 transition">
                <input type="checkbox" className="w-4 h-4 text-blue-600 rounded border-stone-300 focus:ring-blue-500" checked={timedMode} onChange={(e) => setTimedMode(e.target.checked)} />
                Timed Mode
              </label>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">3. Start Standard Quiz</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="w-full sm:w-48 text-base py-3.5 px-4 rounded-xl border-2 border-stone-100 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-stone-200 outline-none transition font-medium text-stone-800 cursor-pointer appearance-none truncate"
                  style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\\\'12\\\' height=\\\'12\\\' viewBox=\\\'0 0 12 12\\\' fill=\\\'none\\\' xmlns=\\\'http://www.w3.org/2000/svg\\\'%3E%3Cpath d=\\\'M2.5 4.5L6 8L9.5 4.5\\\' stroke=\\\'%23a8a29e\\\' stroke-width=\\\'2\\\' stroke-linecap=\\\'round\\\' stroke-linejoin=\\\'round\\\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' }}
                >
                  <option value={10}>10 Questions</option>
                  <option value={20}>20 Questions</option>
                  <option value={25}>25 Questions</option>
                  <option value={50}>50 Questions</option>
                  <option value={100}>100 Questions</option>
                  <option value="all">All Questions ({totalAvailable})</option>
                </select>
                <button
                  onClick={() => onStartNew(questionCount === 'all' ? totalAvailable : questionCount, sessionType, getSettings())}
                  className="flex-1 px-6 py-3.5 rounded-xl font-medium bg-stone-900 text-white hover:bg-stone-800 transition shadow hover:shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" /> Start Quiz
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Or Targeted Review</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => onStartReview('REVIEW_BOOKMARKS', sessionType, getSettings())}
                  disabled={bookmarkedCount === 0}
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-stone-100 bg-white hover:border-stone-200 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-left group"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Bookmark className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-900 leading-tight">Review Bookmarks</h3>
                    <p className="text-sm font-medium text-stone-500 mt-0.5">{bookmarkedCount} {bookmarkedCount === 1 ? 'question' : 'questions'}</p>
                  </div>
                </button>

                <button
                  onClick={() => onStartReview('REVIEW_INCORRECT', sessionType, getSettings())}
                  disabled={incorrectCount === 0}
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-stone-100 bg-white hover:border-stone-200 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-left group"
                >
                  <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-900 leading-tight">Needs Review</h3>
                    <p className="text-sm font-medium text-stone-500 mt-0.5">{incorrectCount} {incorrectCount === 1 ? 'question' : 'questions'}</p>
                  </div>
                </button>
              </div>
            </div>

          </div>
          </>
          )}

        </div>

        <div className="p-4 border-t border-stone-100 bg-stone-50 text-center">
          <button 
            onClick={onClearCache}
            className="text-stone-500 hover:text-red-500 text-sm font-medium transition flex items-center justify-center gap-2 mx-auto"
          >
            <Trash2 className="w-4 h-4" /> Clear All Cache
          </button>
        </div>
      </div>
    </motion.div>
  );
}
