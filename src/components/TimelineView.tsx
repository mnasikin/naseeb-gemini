import { motion } from 'motion/react';
import type { CharacterState, TimelineEntry } from '../types/simulation';

interface TimelineViewProps {
  character: CharacterState | null;
  timeline: TimelineEntry[];
  onBackToSimulation: () => void;
}

export function TimelineView({
  character,
  timeline,
  onBackToSimulation,
}: TimelineViewProps) {
  if (!character || timeline.length === 0) {
    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/92 backdrop-blur-md border border-slate-200/90 rounded-2xl sm:rounded-xl p-8 text-center shadow-sm"
        >
          <h2 className="font-editorial text-2xl font-semibold text-slate-900 mb-2">
            Linimasa Masih Kosong
          </h2>
          <p className="text-sm text-slate-600 mb-6 max-w-md mx-auto">
            Mulai main dulu dan ambil pilihan pertamamu biar semua jejak ceritamu kecatat di sini.
          </p>
          <button
            type="button"
            onClick={onBackToSimulation}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl sm:rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap min-h-[44px]"
          >
            Balik ke Cerita
          </button>
        </motion.div>
      </section>
    );
  }

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 sm:pb-6 border-b border-slate-200 mb-6 sm:mb-8">
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">
            Jejak Langkah · {character.name} ({character.gender}
            {character.familyClass ? ` · Kelas ${character.familyClass}` : ''})
          </div>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-slate-900">
            Linimasa Pilihan Hidup
          </h1>
        </div>
        <button
          type="button"
          onClick={onBackToSimulation}
          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto min-h-[44px]"
        >
          Balik ke Cerita
        </button>
      </div>

      <div className="space-y-6">
        {timeline.map((entry, idx) => {
          const deltaItems = [
            { label: 'Kesehatan', val: entry.statDeltas.health },
            { label: 'Keuangan', val: entry.statDeltas.finance },
            { label: 'Karier', val: entry.statDeltas.career },
            { label: 'Relasi', val: entry.statDeltas.relationships },
            { label: 'Bahagia', val: entry.statDeltas.happiness },
            ...(entry.statDeltas.chemistry ?? []).map(({ name, delta }) => ({
              label: `Chemistry · ${name}`, val: delta,
            })),
          ].filter((d) => d.val !== 0);

          return (
            <motion.div
              key={entry.turn}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(idx * 0.05, 0.3) }}
              className="bg-white/92 backdrop-blur-md border border-slate-200/90 rounded-2xl sm:rounded-xl p-5 sm:p-6 space-y-4 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <div className="text-xs text-slate-500 font-medium">
                    <span className="font-mono tabular-nums">Bab {entry.turn}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{entry.phase}</span>
                  </div>
                  <h2 className="font-editorial text-xl font-semibold text-slate-900 mt-1">
                    {entry.chapterTitle}
                  </h2>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="text-slate-600">
                  <span className="font-semibold text-slate-800">Tanya: </span>
                  {entry.question}
                </div>
                <div className="text-slate-900 font-medium">
                  <span className="font-semibold text-blue-700">Pilihanmu: </span>
                  {entry.chosenAnswer}
                </div>
                {entry.consequenceNote && (
                  <div className="text-slate-600">
                    <span className="font-semibold text-slate-800">Efeknya: </span>
                    {entry.consequenceNote}
                  </div>
                )}
              </div>

              {deltaItems.length > 0 && (
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums">
                  {deltaItems.map((d) => (
                    <span
                      key={d.label}
                      className={d.val > 0 ? 'text-emerald-700' : 'text-red-700'}
                    >
                      {d.label} {d.val > 0 ? `+${d.val}` : d.val}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
