import { AnimatePresence, motion } from 'motion/react';
import type { CharacterState, CharacterStats } from '../types/simulation';
import { AnimatedNumber } from './AnimatedNumber';
import { ChemistryScores } from './ChemistryScores';
import { StageIllustration } from './StageIllustration';

interface CharacterDossierProps {
  character: CharacterState;
  lastDeltas?: CharacterStats | null;
  turn: number;
  isEnding: boolean;
  isLoading: boolean;
  onConcludeEarly?: () => void;
}

const STAT_META: { key: keyof CharacterStats; label: string }[] = [
  { key: 'health', label: 'Kesehatan' },
  { key: 'finance', label: 'Keuangan' },
  { key: 'career', label: 'Karier & Ilmu' },
  { key: 'relationships', label: 'Relasi Sosial' },
  { key: 'happiness', label: 'Kebahagiaan' },
];

function getStatDescriptor(value: number): { text: string; barColor: string; textColor: string } {
  if (value >= 75) {
    return { text: 'Kuat', barColor: 'bg-emerald-600', textColor: 'text-emerald-700' };
  }
  if (value >= 45) {
    return { text: 'Aman', barColor: 'bg-blue-600', textColor: 'text-blue-700' };
  }
  if (value >= 25) {
    return { text: 'Rawan', barColor: 'bg-amber-600', textColor: 'text-amber-700' };
  }
  return { text: 'Kritis', barColor: 'bg-red-600', textColor: 'text-red-700' };
}

function getStageImage(turn: number, isEnding: boolean): { src: string; alt: string } {
  if (isEnding || turn >= 10) {
    return {
      src: '/src/assets/images/stage_legacy_reflection_1794653458723.jpg',
      alt: 'Suasana santai untuk refleksi perjalanan hidup',
    };
  }
  if (turn >= 4) {
    return {
      src: '/src/assets/images/stage_career_crossroads_1794653458203.jpg',
      alt: 'Persimpangan karier dan perjalanan hidup',
    };
  }
  return {
    src: '/src/assets/images/stage_youth_beginnings_1794653458075.jpg',
    alt: 'Meja belajar menghadap pagi hari saat baru merintis',
  };
}

export function CharacterDossier({
  character,
  lastDeltas,
  turn,
  isEnding,
  isLoading,
  onConcludeEarly,
}: CharacterDossierProps) {
  const stageImg = getStageImage(turn, isEnding);

  return (
    <motion.aside
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white/92 backdrop-blur-md border border-slate-200/90 rounded-2xl sm:rounded-xl overflow-hidden shadow-sm"
    >
      <StageIllustration
        src={stageImg.src}
        alt={stageImg.alt}
        className="w-full h-44 border-b border-slate-200"
      />

      <div className="p-6 space-y-6">
        <div className="pb-5 border-b border-slate-100">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-editorial text-2xl font-semibold text-slate-900 truncate">
              {character.name}
            </h2>
            <span className="font-mono tabular-nums text-sm font-semibold text-slate-800 shrink-0">
              Bab <AnimatedNumber value={turn} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1.5">
            <span>{character.gender}</span>
            {character.familyClass && (
              <>
                <span aria-hidden="true">·</span>
                <span>Kelas {character.familyClass}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{character.phase}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500">
              Kondisi Hidup
            </h3>
            <span className="text-xs text-slate-400 font-mono">0–100</span>
          </div>

          <div className="space-y-3.5">
            {STAT_META.map(({ key, label }) => {
              const value = character.stats[key];
              const delta = lastDeltas ? lastDeltas[key] : 0;
              const descriptor = getStatDescriptor(value);

              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between text-sm mb-1.5">
                    <span className="font-medium text-slate-800">{label}</span>
                    <div className="flex items-baseline gap-2 font-mono tabular-nums text-xs">
                      <AnimatePresence mode="popLayout">
                        {delta !== 0 && (
                          <motion.span
                            key={`${turn}-${key}-${delta}`}
                            initial={{ opacity: 0, y: 6, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.25 }}
                            className={delta > 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      <span className={`font-sans font-medium ${descriptor.textColor}`}>
                        {value === 0 && key === 'health' ? 'Tamat' : descriptor.text}
                      </span>
                      <span className="font-semibold text-slate-900 w-7 text-right">
                        <AnimatedNumber value={value} />
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full w-full origin-left rounded-full ${descriptor.barColor}`}
                      initial={false}
                      animate={{ scaleX: value / 100 }}
                      transition={{ type: 'spring', stiffness: 180, damping: 24 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <section className="pt-5 border-t border-slate-100">
          <ChemistryScores scores={character.chemistry} />
        </section>

        <div className="pt-5 border-t border-slate-100">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 mb-2">
            Hubungan & Pasangan
          </h3>
          {character.relationship &&
          character.relationship.status !== 'Lajang' &&
          character.relationship.partnerName ? (
            <div className="text-sm text-slate-800 leading-relaxed">
              <span className="font-semibold text-slate-900">
                {character.relationship.status} sama {character.relationship.partnerName}
              </span>
              {character.relationship.partnerNote && (
                <p className="text-xs text-slate-500 mt-1">
                  {character.relationship.partnerNote}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {character.relationship?.status === 'Berpisah'
                ? 'Baru berpisah, lagi nata hati lagi.'
                : 'Masih lajang, belum kenalan sama pasangan.'}
            </p>
          )}
        </div>

        <div className="pt-5 border-t border-slate-100">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 mb-2">
            Sifat yang Kebentuk
          </h3>
          {character.traits.length > 0 ? (
            <motion.p
              key={character.traits.join(',')}
              initial={{ opacity: 0.5, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="text-sm text-slate-800 font-medium leading-relaxed"
            >
              {character.traits.join(' · ')}
            </motion.p>
          ) : (
            <p className="text-sm text-slate-500">
              Belum kelihatan, pilihanmu nanti yang ngebentuk sifatmu.
            </p>
          )}
        </div>

        {!isEnding && turn >= 3 && onConcludeEarly && (
          <div className="pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={isLoading}
              onClick={onConcludeEarly}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 underline underline-offset-4 transition-colors disabled:opacity-50 min-h-[36px]"
            >
              Udahan & lihat nasib akhir sekarang
            </button>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
