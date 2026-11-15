import { useEffect, useState, type FormEvent, type RefObject } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Loader2, RotateCcw, Send, Share2 } from 'lucide-react';
import type { ChapterResponse, CharacterState, StoryOption } from '../types/simulation';
import { FateCardModal } from './FateCardModal';
import { StoryMarkdown } from './StoryMarkdown';

interface StoryStageProps {
  cardRef?: RefObject<HTMLElement | null>;
  character: CharacterState;
  chapter: ChapterResponse;
  turn: number;
  isLoading: boolean;
  error: string | null;
  onSelectOption: (answer: string) => void;
  onRetry: () => void;
  onRestart: () => void;
  onOpenTimeline: () => void;
}

export function StoryStage({
  cardRef,
  character,
  chapter,
  turn,
  isLoading,
  error,
  onSelectOption,
  onRetry,
  onRestart,
  onOpenTimeline,
}: StoryStageProps) {
  const [customAnswer, setCustomAnswer] = useState('');
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);

  useEffect(() => {
    setCustomAnswer('');
    setPendingChoice(null);
  }, [turn, chapter.chapterTitle, chapter.isEnding]);

  const handleOptionClick = (option: StoryOption) => {
    if (isLoading) return;
    setPendingChoice(option.label);
    setCustomAnswer('');
    onSelectOption(option.label);
  };

  const handleCustomSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = customAnswer.trim();
    if (!trimmed || isLoading) return;
    setPendingChoice(trimmed);
    onSelectOption(trimmed);
  };

  const deltaTags =
    turn > 1
      ? [
          { label: 'Kesehatan', val: chapter.statDeltas.health },
          { label: 'Keuangan', val: chapter.statDeltas.finance },
          { label: 'Karier', val: chapter.statDeltas.career },
          { label: 'Relasi', val: chapter.statDeltas.relationships },
          { label: 'Bahagia', val: chapter.statDeltas.happiness },
          ...(chapter.statDeltas.chemistry ?? []).map(({ name, delta }) => ({
            label: `Chemistry · ${name}`, val: delta,
          })),
        ].filter((d) => d.val !== 0)
      : [];

  return (
    <motion.article
      ref={cardRef}
      key={`${turn}-${chapter.chapterTitle}-${chapter.isEnding ? 'end' : 'play'}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="scroll-mt-4 sm:scroll-mt-6 bg-white/92 backdrop-blur-md border border-slate-200/90 rounded-2xl sm:rounded-xl p-5 sm:p-8 lg:p-10 shadow-sm"
    >
      <header className="pb-6 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 mb-2.5">
          <span className="font-mono tabular-nums">Bab {turn}</span>
          <span aria-hidden="true">·</span>
          <span>{chapter.lifePhase}</span>
        </div>

        <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-slate-900 leading-tight">
          {chapter.chapterTitle}
        </h1>

        {chapter.consequenceNote && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08, duration: 0.25 }}
            className="mt-3 text-sm text-slate-600 leading-relaxed"
          >
            <span className="font-semibold text-slate-800">Efek pilihanmu: </span>
            {chapter.consequenceNote}
          </motion.p>
        )}

        {deltaTags.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.25 }}
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums"
          >
            {deltaTags.map((d) => (
              <span
                key={d.label}
                className={d.val > 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}
              >
                {d.label} {d.val > 0 ? `+${d.val}` : d.val}
              </span>
            ))}
          </motion.div>
        )}
      </header>

      <StoryMarkdown text={chapter.narrative} className="py-7 space-y-4 max-w-[65ch] text-[16px] leading-[1.75] text-slate-800" />

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <p className="text-sm text-red-800">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 text-xs font-semibold text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap shrink-0"
          >
            Coba Lagi
          </button>
        </motion.div>
      )}

      {!chapter.isEnding ? (
        <section className="pt-7 border-t border-slate-200 space-y-5">
          <div>
            <p className="text-xs font-semibold tracking-wide text-blue-700 mb-1.5">
              Waktunya Milih
            </p>
            <h2 className="font-editorial text-xl sm:text-2xl font-semibold text-slate-900 leading-snug">
              {chapter.dilemmaQuestion}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {chapter.options.map((option, idx) => {
              const isSelectedPending = isLoading && pendingChoice === option.label;
              return (
                <motion.button
                  key={option.id || idx}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleOptionClick(option)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.24,
                    delay: 0.22 + idx * 0.045,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  whileHover={!isLoading ? { y: -2, scale: 1.004 } : undefined}
                  whileTap={!isLoading ? { scale: 0.99 } : undefined}
                  className={`group w-full text-left p-4 sm:p-5 rounded-lg border transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    isSelectedPending
                      ? 'bg-blue-50 border-blue-600'
                      : 'bg-slate-50/70 border-slate-200 hover:bg-white hover:border-blue-500 hover:shadow-xs disabled:opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <span className="font-mono tabular-nums text-xs font-semibold text-slate-500 mt-1 shrink-0">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <div>
                        <div className="text-[15px] font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                          {option.label}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {option.hint}
                        </div>
                      </div>
                    </div>
                    <span className="mt-0.5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0">
                      {isSelectedPending ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      ) : (
                        <ArrowRight className="w-4 h-4" />
                      )}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>

          <form onSubmit={handleCustomSubmit} className="pt-3 border-t border-slate-100">
            <label
              htmlFor="custom-decision"
              className="block text-xs font-medium text-slate-500 mb-2"
            >
              Atau ketik sendiri maumu gimana buat {character.name}
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="custom-decision"
                type="text"
                value={customAnswer}
                onChange={(e) => setCustomAnswer(e.target.value)}
                placeholder="Misal: Tolak tawaran itu terus buka kedai kopi kecil..."
                maxLength={140}
                disabled={isLoading}
                className="flex-1 px-4 py-3 sm:py-2.5 text-base sm:text-sm bg-slate-50/90 border border-slate-300 rounded-xl sm:rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 disabled:opacity-60 min-h-[44px]"
              />
              <motion.button
                type="submit"
                disabled={isLoading || !customAnswer.trim()}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl sm:rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 min-h-[44px]"
              >
                {isLoading && pendingChoice === customAnswer.trim() ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Lagi diproses...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Jalanin Pilihan</span>
                  </>
                )}
              </motion.button>
            </div>
          </form>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2.5 text-xs text-slate-500 pt-1"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span>Lagi nyusun kelanjutan ceritamu...</span>
            </motion.div>
          )}
        </section>
      ) : (
        chapter.endingSummary && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="pt-8 border-t border-slate-200 space-y-7"
          >
            <div>
              <p className="text-xs font-semibold tracking-wide text-blue-700 mb-1.5">
                Nasib Akhir · {character.name}
              </p>
              <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-slate-900">
                {chapter.endingSummary.archetypeTitle}
              </h2>
              <p className="text-base font-medium text-slate-700 mt-2">
                {chapter.endingSummary.fateHeadline}
              </p>
            </div>

            <StoryMarkdown text={chapter.endingSummary.epilogue} className="space-y-4 max-w-[65ch] text-[15px] leading-[1.75] text-slate-700" />

            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-xs font-semibold tracking-wide text-slate-500 mb-3">
                3 Momen yang Paling Ngubah Hidupmu
              </h3>
              <ol className="space-y-2.5">
                {chapter.endingSummary.keyTurningPoints.map((point, idx) => (
                  <li key={idx} className="flex items-baseline gap-3 text-sm text-slate-800">
                    <span className="font-mono tabular-nums text-xs font-semibold text-slate-400 shrink-0">
                      0{idx + 1}.
                    </span>
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ol>
            </div>

            <blockquote className="pt-5 border-t border-slate-100 font-editorial italic text-lg text-slate-700">
              “{chapter.endingSummary.lifeQuote}”
            </blockquote>

            <div className="pt-4 flex flex-wrap items-center gap-3">
              <motion.button
                type="button"
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsCardModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
              >
                <Share2 className="w-4 h-4" />
                <span>Bikin & Share Kartu Nasib</span>
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
                onClick={onRestart}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Main Lagi dari Awal</span>
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
                onClick={onOpenTimeline}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
              >
                <span>Cek Linimasa</span>
              </motion.button>
            </div>

            <FateCardModal
              isOpen={isCardModalOpen}
              onClose={() => setIsCardModalOpen(false)}
              character={character}
              endingSummary={chapter.endingSummary}
              totalChapters={turn}
            />
          </motion.section>
        )
      )}
    </motion.article>
  );
}
