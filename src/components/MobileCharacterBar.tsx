import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp, User, X } from 'lucide-react';
import type { CharacterState, CharacterStats } from '../types/simulation';
import { AnimatedNumber } from './AnimatedNumber';
import { CharacterDossier } from './CharacterDossier';

interface MobileCharacterBarProps {
  character: CharacterState;
  lastDeltas?: CharacterStats | null;
  turn: number;
  isEnding: boolean;
  isLoading: boolean;
  onConcludeEarly?: () => void;
}

export function MobileCharacterBar({
  character,
  lastDeltas,
  turn,
  isEnding,
  isLoading,
  onConcludeEarly,
}: MobileCharacterBarProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { health, finance, happiness } = character.stats;

  return (
    <>
      <div className="lg:hidden mb-4">
        <button
          type="button"
          onClick={() => setIsSheetOpen(true)}
          className="w-full text-left bg-white/92 backdrop-blur-md border border-slate-200/90 rounded-xl px-4 py-3 shadow-xs min-h-[56px] active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-editorial text-base font-semibold text-slate-900 truncate">
                  {character.name}
                </span>
                <span className="font-mono tabular-nums text-xs text-slate-500 shrink-0">
                  Bab <AnimatedNumber value={turn} /> · {character.phase}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-600 mt-1">
                <span className={health <= 25 ? 'text-red-700 font-semibold' : ''}>
                  Sehat <AnimatedNumber value={health} />
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span>
                  Uang <AnimatedNumber value={finance} />
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span>
                  Bahagia <AnimatedNumber value={happiness} />
                </span>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 shrink-0 whitespace-nowrap">
              <span>Profil</span>
              <ChevronUp className="w-4 h-4 rotate-180" />
            </span>
          </div>
        </button>
      </div>

      <AnimatePresence>
        {isSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="lg:hidden fixed inset-0 z-50 flex items-end bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setIsSheetOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-h-[86vh] bg-[#F8FAFC] rounded-t-3xl overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="bg-white border-b border-slate-200 px-5 pt-3 pb-3.5 shrink-0">
                <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <span className="font-editorial text-lg font-semibold text-slate-900">
                    Profil & Kondisimu
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSheetOpen(false)}
                    aria-label="Tutup profil karakter"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-4 overflow-y-auto pb-8">
                <CharacterDossier
                  character={character}
                  lastDeltas={lastDeltas}
                  turn={turn}
                  isEnding={isEnding}
                  isLoading={isLoading}
                  onConcludeEarly={() => {
                    setIsSheetOpen(false);
                    onConcludeEarly?.();
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
