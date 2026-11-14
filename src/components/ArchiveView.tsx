import { useState } from 'react';
import { motion } from 'motion/react';
import { Share2, Trash2 } from 'lucide-react';
import type { ArchivedLife } from '../types/simulation';
import { FateCardModal } from './FateCardModal';

interface ArchiveViewProps {
  archives: ArchivedLife[];
  onDeleteArchive: (id: string) => void;
  onStartNew: () => void;
}

export function ArchiveView({
  archives,
  onDeleteArchive,
  onStartNew,
}: ArchiveViewProps) {
  const [selectedArchive, setSelectedArchive] = useState<ArchivedLife | null>(null);

  if (archives.length === 0) {
    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/92 backdrop-blur-md border border-slate-200/90 rounded-2xl sm:rounded-xl p-8 text-center shadow-sm"
        >
          <h2 className="font-editorial text-2xl font-semibold text-slate-900 mb-2">
            Belum Ada Arsip Nasib
          </h2>
          <p className="text-sm text-slate-600 mb-6 max-w-md mx-auto">
            Selesaikan satu perjalanan hidup sampai tamat. Semua cerita yang udah selesai bakal otomatis kesimpan di browser ini biar bisa kamu bandingin.
          </p>
          <button
            type="button"
            onClick={onStartNew}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl sm:rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap min-h-[44px]"
          >
            Mulai Main Baru
          </button>
        </motion.div>
      </section>
    );
  }

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 sm:pb-6 border-b border-slate-200 mb-6 sm:mb-8">
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">
            Tersimpan · {archives.length} Cerita Tamat
          </div>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-slate-900">
            Arsip Nasib & Cerita
          </h1>
        </div>
        <button
          type="button"
          onClick={onStartNew}
          className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl sm:rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto min-h-[44px]"
        >
          Main Baru
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {archives.map((item, idx) => {
          const dateLabel = new Date(item.completedAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });

          return (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(idx * 0.05, 0.3) }}
              whileHover={{ y: -2 }}
              className="bg-white/92 backdrop-blur-md border border-slate-200/90 rounded-2xl sm:rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">
                      <span>{item.character.name}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{item.character.gender}</span>
                      {item.character.familyClass && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>Kelas {item.character.familyClass}</span>
                        </>
                      )}
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono tabular-nums">{item.timeline.length} Bab</span>
                      <span aria-hidden="true"> · </span>
                      <span>{dateLabel}</span>
                    </div>
                    <h2 className="font-editorial text-xl font-semibold text-slate-900">
                      {item.endingSummary.archetypeTitle}
                    </h2>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedArchive(item)}
                      aria-label={`Bagikan kartu nasib ${item.character.name}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap min-h-[44px]"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Kartu</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteArchive(item.id)}
                      aria-label={`Hapus arsip ${item.character.name}`}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-sm font-medium text-slate-700 mt-2">
                  {item.endingSummary.fateHeadline}
                </p>

                <p className="text-sm text-slate-600 mt-3 leading-relaxed line-clamp-4">
                  {item.endingSummary.epilogue}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                {item.character.traits.length > 0 && (
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">Sifat: </span>
                    {item.character.traits.join(' · ')}
                  </div>
                )}
                <div className="grid grid-cols-5 gap-2 text-xs font-mono tabular-nums pt-1">
                  <div>
                    <div className="text-slate-400 font-sans">Sehat</div>
                    <div className="font-semibold text-slate-800">{item.character.stats.health}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans">Uang</div>
                    <div className="font-semibold text-slate-800">{item.character.stats.finance}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans">Karier</div>
                    <div className="font-semibold text-slate-800">{item.character.stats.career}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans">Relasi</div>
                    <div className="font-semibold text-slate-800">{item.character.stats.relationships}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans">Bahagia</div>
                    <div className="font-semibold text-slate-800">{item.character.stats.happiness}</div>
                  </div>
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>

      {selectedArchive && (
        <FateCardModal
          isOpen={Boolean(selectedArchive)}
          onClose={() => setSelectedArchive(null)}
          character={selectedArchive.character}
          endingSummary={selectedArchive.endingSummary}
          totalChapters={selectedArchive.timeline.length + 1}
        />
      )}
    </section>
  );
}
