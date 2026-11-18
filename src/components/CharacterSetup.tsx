import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { FamilyClassChoice, GenderOption } from '../types/simulation';
import { StageIllustration } from './StageIllustration';

interface CharacterSetupProps {
  onStart: (name: string, gender: GenderOption, familyClass: FamilyClassChoice) => void;
  isLoading: boolean;
  error: string | null;
}

const GENDER_OPTIONS: { value: GenderOption; description: string }[] = [
  { value: 'Laki-laki', description: 'Sudut pandang cowok' },
  { value: 'Perempuan', description: 'Sudut pandang cewek' },
  { value: 'Non-biner', description: 'Sudut pandang netral' },
];

const FAMILY_CLASS_OPTIONS: { value: FamilyClassChoice; label: string; description: string }[] = [
  { value: 'Lower', label: 'Lower', description: 'Pas-pasan, berjuang dari nol' },
  { value: 'Middle', label: 'Middle', description: 'Cukup aja, tuntutan banyak' },
  { value: 'Upper', label: 'Upper', description: 'Serba ada, ekspektasi tinggi' },
  { value: 'Random', label: 'Random', description: 'Undi Lower, Middle, atau Upper' },
];

export function CharacterSetup({ onStart, isLoading, error }: CharacterSetupProps) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<GenderOption>('Laki-laki');
  const [familyClass, setFamilyClass] = useState<FamilyClassChoice>('Middle');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setValidationError('Isi minimal 2 huruf buat nama karaktermu ya.');
      return;
    }
    setValidationError(null);
    onStart(trimmed, gender, familyClass);
  };

  const displayError = validationError || error;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 lg:py-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 lg:gap-12 items-stretch">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-6 flex flex-col justify-between bg-white/92 backdrop-blur-md border border-slate-200/90 rounded-2xl sm:rounded-xl p-5 sm:p-8 lg:p-10 shadow-sm"
        >
          <div>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="text-xs font-medium text-slate-500 tracking-wide mb-2.5 sm:mb-3"
            >
              Naseeb · Simulasi Hidup Tanpa Batas
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="font-editorial text-[1.85rem] sm:text-4xl lg:text-[2.75rem] leading-[1.15] font-semibold text-slate-900 mb-3 sm:mb-4"
            >
              Pilihan kecil hari ini bisa ngubah seluruh jalan hidupmu.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.15 }}
              className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-[54ch] mb-6 sm:mb-8"
            >
              Mulai langkah pertamamu tanpa batasan bab. Hadapi dilema nyata, obrolan sehari-hari,
              dan konsekuensi yang terus jalan sampai kesehatan habis atau kamu mutusin nutup cerita.
            </motion.p>

            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
              <div>
                <label
                  htmlFor="character-name"
                  className="block text-sm font-semibold text-slate-800 mb-2"
                >
                  Namamu siapa?
                </label>
                <input
                  id="character-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="Misal: Raka atau Nadira"
                  maxLength={50}
                  disabled={isLoading}
                  className="w-full px-4 py-3 text-base bg-slate-50/90 border border-slate-300 rounded-xl sm:rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 transition-colors disabled:opacity-60 min-h-[48px]"
                />
              </div>

              <div>
                <span className="block text-sm font-semibold text-slate-800 mb-2">
                  Gender
                </span>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {GENDER_OPTIONS.map((option) => {
                    const isSelected = gender === option.value;
                    return (
                      <motion.button
                        key={option.value}
                        type="button"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => setGender(option.value)}
                        disabled={isLoading}
                        className={`text-left px-3 sm:px-4 py-3 rounded-xl sm:rounded-lg border transition-colors min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                          isSelected
                            ? 'bg-blue-50/85 border-blue-600 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs sm:text-sm font-semibold whitespace-nowrap">{option.value}</div>
                        <div className="hidden sm:block text-xs text-slate-500 mt-0.5 leading-snug">
                          {option.description}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block text-sm font-semibold text-slate-800 mb-2">
                  Latar Ekonomi Keluarga
                </span>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  {FAMILY_CLASS_OPTIONS.map((option) => {
                    const isSelected = familyClass === option.value;
                    return (
                      <motion.button
                        key={option.value}
                        type="button"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => setFamilyClass(option.value)}
                        aria-pressed={isSelected}
                        disabled={isLoading}
                        className={`text-left px-3 sm:px-4 py-3 rounded-xl sm:rounded-lg border transition-colors min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                          isSelected
                            ? 'bg-blue-50/85 border-blue-600 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs sm:text-sm font-semibold whitespace-nowrap">{option.label}</div>
                        <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-snug">
                          {option.description}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {displayError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
                >
                  {displayError}
                </motion.div>
              )}

              <div className="pt-2">
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 h-12 text-sm font-semibold text-white bg-blue-600 rounded-xl sm:rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Lagi nyiapin bab pembuka...</span>
                    </>
                  ) : (
                    <>
                      <span>Mulai Main</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </motion.button>
              </div>
            </form>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-3 gap-4 text-xs text-slate-500">
            <div>
              <div className="font-semibold text-slate-800">5 Aspek Hidup</div>
              <div className="mt-0.5">Sehat, dompet, karier, relasi, dan mood</div>
            </div>
            <div>
              <div className="font-semibold text-slate-800">Bebas Milih</div>
              <div className="mt-0.5">Pilih opsi atau ketik maumu sendiri</div>
            </div>
            <div>
              <div className="font-semibold text-slate-800">Ending Unik</div>
              <div className="mt-0.5">Nasib akhirmu kebentuk dari aksimu</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-6 flex flex-col bg-white/92 backdrop-blur-md border border-slate-200/90 rounded-2xl sm:rounded-xl overflow-hidden shadow-sm"
        >
          <StageIllustration
            src="/src/assets/images/life_hero_journey_1794653457306.jpg"
            alt="Ilustrasi perjalanan hidup dari masa muda menuju kota masa depan"
            caption="Jalur kehidupan yang bercabang di setiap persimpangan"
            className="w-full h-64 sm:h-96 lg:h-full min-h-[260px]"
          />
          <div className="p-5 sm:p-6 border-t border-slate-200 bg-white/95">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2">
              <span>Gimana Cara Mainnya</span>
              <span aria-hidden="true">·</span>
              <span>Efek Berantai Nyata</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              Tiap jawaban bakal langsung ngubah isi dompet, kesehatan, karier, dan hubunganmu, lalu
              nentuin peluang sama masalah yang muncul di bab-bab berikutnya.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
