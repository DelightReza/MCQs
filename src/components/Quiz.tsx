import { motion } from 'motion/react';
import { Bookmark, ChevronLeft, ChevronRight, Check, X, Clock, LogOut } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { playCorrectSound, playIncorrectSound } from '../lib/utils';
import type { Question, QuizSessionType, QuizSettings } from '../types';

interface QuizProps {
  questions: Question[];
  currentIndex: number;
  answers: Record<string, number>;
  bookmarkedIds: Set<string>;
  sessionType: QuizSessionType;
  settings: QuizSettings;
  elapsedTime: number;
  bankName: string;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onJump: (index: number) => void;
  onToggleBookmark: (questionId: string) => void;
  onTimeTick: () => void;
  onQuit: () => void;
  onFinish: () => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export function Quiz({
  questions,
  currentIndex,
  answers,
  bookmarkedIds,
  sessionType,
  settings,
  elapsedTime,
  bankName,
  onAnswer,
  onNext,
  onPrev,
  onJump,
  onToggleBookmark,
  onTimeTick,
  onQuit,
  onFinish,
}: QuizProps) {
  const currentQ = questions[currentIndex];
  
  useEffect(() => {
    if (settings.timedMode) {
      const interval = setInterval(() => {
        onTimeTick();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [settings.timedMode, onTimeTick]);

  const paletteRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (paletteRef.current) {
      const currentElement = paletteRef.current.children[currentIndex] as HTMLElement;
      if (currentElement) {
        currentElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentIndex]);

  if (!currentQ) return null;

  const selectedAnswer = answers[currentQ.id];
  const isBookmarked = bookmarkedIds.has(currentQ.id);
  const isLast = currentIndex === questions.length - 1;
  const isPractice = sessionType === 'PRACTICE';
  const hasAnswered = selectedAnswer !== undefined;

  const handleAnswerClick = (idx: number) => {
    if (isPractice && !hasAnswered) {
      if (idx === currentQ.correctAnswerIndex) {
        playCorrectSound();
      } else {
        playIncorrectSound();
      }
    }
    onAnswer(currentQ.id, idx);
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
            className="max-w-full rounded-xl border border-stone-200 shadow-sm max-h-[400px] object-contain cursor-zoom-in"
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
      key="quiz"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="max-w-3xl w-full mx-auto space-y-4 py-8"
    >
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden flex flex-col">
        {/* Progress Header */}
        <div className="bg-stone-50 border-b border-stone-100 px-6 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-stone-800 text-lg truncate max-w-sm">{bankName}</h3>
            
            {settings.timedMode && (
              <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 font-mono font-medium shadow-sm">
                <Clock className="w-4 h-4 text-stone-400" />
                {formatTime(elapsedTime)}
              </div>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-stone-500">
              Question <span className="text-stone-900 font-bold">{currentIndex + 1}</span> of {questions.length}
            </div>
            <div className="flex items-center gap-4">
              <span className={cn(
                "text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider",
                isPractice ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
              )}>
                {isPractice ? 'Practice' : 'Exam'}
              </span>
              <button
                onClick={() => onToggleBookmark(currentQ.id)}
                className={cn(
                  "p-2 rounded-full transition-colors relative",
                  isBookmarked ? "text-amber-500 bg-amber-50 shadow-sm" : "text-stone-400 hover:bg-stone-200"
                )}
                title="Bookmark this question"
              >
                <Bookmark className="w-5 h-5" fill={isBookmarked ? "currentColor" : "none"} />
              </button>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-stone-100 shrink-0">
          <div 
            className={cn("h-full transition-all duration-300 ease-out", isPractice ? "bg-blue-500" : "bg-amber-500")}
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Question Area */}
        <div className="p-6 sm:p-10 flex-1 overflow-y-auto">
          <h2 className="text-xl sm:text-2xl font-heading font-medium text-stone-900 mb-6 leading-relaxed select-text">
            {currentQ.text}
          </h2>

          {renderMedia(currentQ.media)}

          <div className="space-y-3 mt-8">
            {currentQ.options.map((option, idx) => {
              const isSelected = selectedAnswer === idx;
              const isCorrectAnswer = currentQ.correctAnswerIndex === idx;

              let optStyle = "border-stone-100 hover:border-stone-300 hover:bg-stone-50";
              let iconBg = "border-stone-200 bg-white";
              let textStyle = "text-stone-700";

              if (isPractice && hasAnswered) {
                if (isCorrectAnswer) {
                  optStyle = "border-green-500 bg-green-50/50";
                  iconBg = "border-green-500 bg-green-500 text-white";
                  textStyle = "text-green-900 font-semibold";
                } else if (isSelected) {
                  optStyle = "border-red-500 bg-red-50/50";
                  iconBg = "border-red-500 bg-red-500 text-white";
                  textStyle = "text-red-900 line-through opacity-80";
                } else {
                  optStyle = "border-stone-100 opacity-50";
                  iconBg = "border-stone-200 bg-stone-50";
                  textStyle = "text-stone-500";
                }
              } else {
                if (isSelected) {
                  optStyle = "border-blue-500 bg-blue-50/50 outline-2 outline-blue-200 outline";
                  iconBg = "border-blue-500 bg-blue-500 text-white";
                  textStyle = "text-blue-900 font-semibold";
                }
              }

              return (
                <button
                  key={idx}
                  disabled={isPractice && hasAnswered}
                  onClick={() => handleAnswerClick(idx)}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border-2 transition-all flex flex-col focus:outline-none select-none",
                    !(isPractice && hasAnswered) && "active:scale-[0.99]",
                    optStyle
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors",
                      iconBg
                    )}>
                      {(isPractice && hasAnswered) ? (
                        isCorrectAnswer ? <Check className="w-4 h-4 text-white" strokeWidth={3} /> :
                        (isSelected ? <X className="w-4 h-4 text-white" strokeWidth={3} /> : null)
                      ) : (
                        isSelected && <Check className="w-4 h-4 text-white" strokeWidth={3} />
                      )}
                    </div>
                    <span className={cn(
                      "pt-0.5 leading-snug text-base sm:text-lg w-full transition-colors",
                      textStyle
                    )}>
                      {option.text || '(Image Option)'}
                    </span>
                  </div>
                  <div className="ml-10">
                    {renderMedia(option.media)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="bg-stone-50 border-t border-stone-100 p-4 sm:px-10 sm:py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            onClick={onQuit}
            className="flex sm:w-auto w-full items-center justify-center gap-2 px-4 py-2 border-2 border-stone-200 bg-white text-stone-600 rounded-xl hover:bg-stone-100 hover:text-red-500 font-medium transition"
          >
            <LogOut className="w-4 h-4" /> Save & Exit
          </button>
          
          <div className="flex items-center w-full sm:w-auto gap-3">
            <button
              onClick={onPrev}
              disabled={currentIndex === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-stone-600 hover:bg-stone-200 border-2 border-stone-200 transition disabled:opacity-50 disabled:cursor-not-allowed bg-white"
            >
              <ChevronLeft className="w-5 h-5" />
              Prev
            </button>

            {isLast ? (
              <button
                onClick={onFinish}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold bg-stone-900 text-white hover:bg-stone-800 transition shadow active:scale-95 border-2 border-stone-900"
              >
                Finish Quiz
              </button>
            ) : (
              <button
                onClick={onNext}
                className={cn(
                  "flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold transition shadow active:scale-95 text-white border-2",
                  isPractice ? "bg-blue-600 hover:bg-blue-700 border-blue-600 hover:border-blue-700" : "bg-amber-600 hover:bg-amber-700 border-amber-600 hover:border-amber-700"
                )}
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Palette Timeline Component */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 shrink-0 overflow-hidden">
        <div 
          ref={paletteRef}
          className="flex overflow-x-auto gap-2 pb-2 scrollbar-none items-center" 
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {questions.map((q, idx) => {
            const isQAnswered = answers[q.id] !== undefined;
            const isQBookmarked = bookmarkedIds.has(q.id);
            const isCurrent = currentIndex === idx;
            
            return (
              <button
                key={q.id}
                onClick={() => onJump(idx)}
                className={cn(
                  "relative flex-shrink-0 w-12 h-12 rounded-xl border-2 font-bold text-sm transition-all focus:outline-none shrink-0 flex items-center justify-center overscroll-contain",
                  isCurrent 
                    ? (isPractice ? "border-blue-600 bg-blue-50 text-blue-800" : "border-amber-600 bg-amber-50 text-amber-800")
                    : (isQAnswered 
                        ? "border-stone-300 bg-stone-100 text-stone-600 hover:border-stone-400" 
                        : "border-stone-100 bg-white text-stone-400 hover:border-stone-300 hover:text-stone-600 hover:bg-stone-50")
                )}
              >
                {isQAnswered && !isCurrent ? <Check className="w-5 h-5" strokeWidth={3} /> : idx + 1}
                {isQBookmarked && (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center shadow-sm">
                    <Bookmark className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
