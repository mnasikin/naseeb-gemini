import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Clock, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { ArchiveView } from './components/ArchiveView';
import { CharacterDossier } from './components/CharacterDossier';
import { CharacterSetup } from './components/CharacterSetup';
import { LivingBackground } from './components/LivingBackground';
import { MobileBottomNav, type ActiveTab } from './components/MobileBottomNav';
import { MobileCharacterBar } from './components/MobileCharacterBar';
import { StoryStage } from './components/StoryStage';
import { TimelineView } from './components/TimelineView';
import {
  enterFullscreen,
  exitFullscreen,
  isCurrentlyFullscreen,
  isFullscreenSupported,
} from './utils/fullscreen';
import type {
  ActiveSession,
  ArchivedLife,
  ChapterResponse,
  CharacterState,
  FamilyClass,
  GenderOption,
  TimelineEntry,
} from './types/simulation';

const ARCHIVE_STORAGE_KEY = 'naseeb_archives_v1';
const SESSION_STORAGE_KEY = 'naseeb_active_session_v1';

function loadArchives(): ArchivedLife[] {
  try {
    const raw =
      localStorage.getItem(ARCHIVE_STORAGE_KEY) ||
      localStorage.getItem('jejak_hidup_archives_v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveArchives(items: ArchivedLife[]) {
  try {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota issues gracefully
  }
}

function loadActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveSession>;
    if (!parsed.character || !parsed.currentChapter || typeof parsed.turn !== 'number') {
      return null;
    }
    return {
      character: parsed.character,
      currentChapter: parsed.currentChapter,
      turn: parsed.turn,
      timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
      savedAt: parsed.savedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function saveActiveSession(session: ActiveSession | null) {
  try {
    if (!session) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota issues gracefully
  }
}

function scrollToTop() {
  if (typeof window === 'undefined') return;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = prefersReduced ? 'auto' : 'smooth';
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior });
    if (document.documentElement.scrollTop > 0) {
      document.documentElement.scrollTo({ top: 0, behavior });
    }
  });
}

export default function App() {
  const [initialSession] = useState<ActiveSession | null>(() => loadActiveSession());

  const [activeTab, setActiveTab] = useState<ActiveTab>('simulation');
  const [character, setCharacter] = useState<CharacterState | null>(
    initialSession?.character ?? null,
  );
  const [currentChapter, setCurrentChapter] = useState<ChapterResponse | null>(
    initialSession?.currentChapter ?? null,
  );
  const [turn, setTurn] = useState<number>(initialSession?.turn ?? 1);
  const [timeline, setTimeline] = useState<TimelineEntry[]>(initialSession?.timeline ?? []);
  const [archives, setArchives] = useState<ArchivedLife[]>(() => loadArchives());

  const storyCardRef = useRef<HTMLElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttemptedAnswer, setLastAttemptedAnswer] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isCurrentlyFullscreen());
  const fullscreenAvailable = isFullscreenSupported();

  const scrollToStoryCard = () => {
    if (typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReduced ? 'auto' : 'smooth';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        storyCardRef.current?.scrollIntoView({ behavior, block: 'start' });
      });
    });
  };

  useEffect(() => {
    saveArchives(archives);
  }, [archives]);

  useEffect(() => {
    if (character && currentChapter) {
      saveActiveSession({
        character,
        currentChapter,
        turn,
        timeline,
        savedAt: new Date().toISOString(),
      });
    } else {
      saveActiveSession(null);
    }
  }, [character, currentChapter, turn, timeline]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(isCurrentlyFullscreen());
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = () => {
    if (isCurrentlyFullscreen()) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  };

  const handleStartSimulation = async (
    name: string,
    gender: GenderOption,
    familyClass: FamilyClass,
  ) => {
    // Trigger browser fullscreen synchronously inside user click/submit gesture
    enterFullscreen();

    setIsLoading(true);
    setError(null);
    setLastAttemptedAnswer(null);

    try {
      const response = await fetch('/api/story/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, gender, familyClass }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Gagal mulai cerita nih.');
      }

      setCharacter(data.character);
      setCurrentChapter(data.chapter);
      setTurn(1);
      setTimeline([]);
      setActiveTab('simulation');
      scrollToStoryCard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lagi ada gangguan pas hubungin server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectOption = async (answer: string) => {
    if (!character || !currentChapter || isLoading) return;

    setIsLoading(true);
    setError(null);
    setLastAttemptedAnswer(answer);

    const nextTurn = turn + 1;
    const newEntry: TimelineEntry = {
      turn,
      phase: currentChapter.lifePhase,
      chapterTitle: currentChapter.chapterTitle,
      narrative: currentChapter.narrative,
      question: currentChapter.dilemmaQuestion,
      chosenAnswer: answer,
      consequenceNote: '',
      statDeltas: { health: 0, finance: 0, career: 0, relationships: 0, happiness: 0 },
      statsAfter: character.stats,
    };

    try {
      const response = await fetch('/api/story/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character,
          turn: nextTurn,
          history: [...timeline, newEntry],
          selectedAnswer: answer,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Gagal lanjutin cerita nih.');
      }

      const updatedCharacter: CharacterState = data.character;
      const nextChapter: ChapterResponse = data.chapter;

      const completedEntry: TimelineEntry = {
        ...newEntry,
        consequenceNote: nextChapter.consequenceNote,
        statDeltas: nextChapter.statDeltas,
        statsAfter: updatedCharacter.stats,
      };

      const nextTimeline = [...timeline, completedEntry];
      setCharacter(updatedCharacter);
      setCurrentChapter(nextChapter);
      setTurn(nextTurn);
      setTimeline(nextTimeline);
      setLastAttemptedAnswer(null);
      scrollToStoryCard();

      if (nextChapter.isEnding && nextChapter.endingSummary) {
        const archived: ArchivedLife = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          completedAt: new Date().toISOString(),
          character: updatedCharacter,
          endingSummary: nextChapter.endingSummary,
          timeline: nextTimeline,
        };
        setArchives((prev) => [archived, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal lanjutin cerita nih.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastAttemptedAnswer) {
      handleSelectOption(lastAttemptedAnswer);
    }
  };

  const handleReset = () => {
    exitFullscreen();
    setCharacter(null);
    setCurrentChapter(null);
    setTurn(1);
    setTimeline([]);
    setError(null);
    setLastAttemptedAnswer(null);
    setActiveTab('simulation');
    saveActiveSession(null);
    scrollToTop();
  };

  const handleConcludeEarly = async () => {
    if (!character || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/story/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character,
          turn,
          history: timeline,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Gagal nyimpulin nasib akhir.');
      }

      const nextChapter: ChapterResponse = data.chapter;
      setCurrentChapter(nextChapter);
      scrollToStoryCard();

      if (nextChapter.isEnding && nextChapter.endingSummary) {
        const archived: ArchivedLife = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          completedAt: new Date().toISOString(),
          character,
          endingSummary: nextChapter.endingSummary,
          timeline,
        };
        setArchives((prev) => [archived, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal nyimpulin nasib akhir.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteArchive = (id: string) => {
    setArchives((prev) => prev.filter((item) => item.id !== id));
  };

  const isImmersivePlay = activeTab === 'simulation' && Boolean(character && currentChapter);

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen flex flex-col text-[#0F172A]">
        <LivingBackground
          character={character}
          turn={turn}
          isEnding={Boolean(currentChapter?.isEnding)}
        />

        {!isImmersivePlay && (
          <header className="bg-white/88 backdrop-blur-md border-b border-slate-200/90 relative md:sticky md:top-0 z-20">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-8">
              <button
                type="button"
                onClick={() => setActiveTab('simulation')}
                className="font-editorial text-xl font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded min-h-[44px] flex items-center"
              >
                Naseeb
              </button>

              <nav aria-label="Navigasi utama" className="hidden md:flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => setActiveTab('simulation')}
                  className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'simulation'
                      ? 'border-blue-600 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Simulasi
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('timeline')}
                  className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'timeline'
                      ? 'border-blue-600 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Linimasa
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('archive')}
                  className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'archive'
                      ? 'border-blue-600 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Arsip Nasib
                </button>
              </nav>

              <div className="shrink-0">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleReset}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
                >
                  Main Baru
                </motion.button>
              </div>
            </div>
          </header>
        )}

        <main className={`flex-1 ${isImmersivePlay ? 'pb-8' : 'pb-20 md:pb-8'}`}>
          <AnimatePresence mode="wait">
            {activeTab === 'simulation' && (
              <motion.div
                key={character && currentChapter ? 'playing' : 'setup'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {!character || !currentChapter ? (
                  <CharacterSetup
                    onStart={handleStartSimulation}
                    isLoading={isLoading}
                    error={error}
                  />
                ) : (
                  <section className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 lg:py-8">
                    {/* Minimal distraction-free immersive play controls */}
                    <div className="flex items-center justify-between gap-4 mb-4 sm:mb-6">
                      <span className="font-editorial text-lg font-semibold text-slate-900 whitespace-nowrap shrink-0">
                        Naseeb
                      </span>

                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('timeline')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white/80 rounded-lg transition-colors whitespace-nowrap min-h-[44px]"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Linimasa</span>
                        </button>

                        {fullscreenAvailable && (
                          <button
                            type="button"
                            onClick={handleToggleFullscreen}
                            aria-label={isFullscreen ? 'Keluar layar penuh' : 'Masuk layar penuh'}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white/80 rounded-lg transition-colors whitespace-nowrap min-h-[44px]"
                          >
                            {isFullscreen ? (
                              <>
                                <Minimize2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Keluar Penuh</span>
                              </>
                            ) : (
                              <>
                                <Maximize2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Layar Penuh</span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleReset}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white/85 border border-slate-200 hover:bg-white rounded-lg transition-colors whitespace-nowrap min-h-[44px]"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Main Baru</span>
                        </button>
                      </div>
                    </div>

                    <MobileCharacterBar
                      character={character}
                      lastDeltas={turn > 1 ? currentChapter.statDeltas : null}
                      turn={turn}
                      isEnding={currentChapter.isEnding}
                      isLoading={isLoading}
                      onConcludeEarly={handleConcludeEarly}
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                      <div className="lg:col-span-8">
                        <StoryStage
                          cardRef={storyCardRef}
                          character={character}
                          chapter={currentChapter}
                          turn={turn}
                          isLoading={isLoading}
                          error={error}
                          onSelectOption={handleSelectOption}
                          onRetry={handleRetry}
                          onRestart={handleReset}
                          onOpenTimeline={() => setActiveTab('timeline')}
                        />
                      </div>
                      <div className="hidden lg:block lg:col-span-4 lg:sticky lg:top-6">
                        <CharacterDossier
                          character={character}
                          lastDeltas={turn > 1 ? currentChapter.statDeltas : null}
                          turn={turn}
                          isEnding={currentChapter.isEnding}
                          isLoading={isLoading}
                          onConcludeEarly={handleConcludeEarly}
                        />
                      </div>
                    </div>
                  </section>
                )}
              </motion.div>
            )}

            {activeTab === 'timeline' && (
              <motion.div
                key="timeline"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <TimelineView
                  character={character}
                  timeline={timeline}
                  onBackToSimulation={() => setActiveTab('simulation')}
                />
              </motion.div>
            )}

            {activeTab === 'archive' && (
              <motion.div
                key="archive"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ArchiveView
                  archives={archives}
                  onDeleteArchive={handleDeleteArchive}
                  onStartNew={handleReset}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {!isImmersivePlay && (
          <>
            <footer className="hidden md:block border-t border-slate-200/90 bg-white/85 backdrop-blur-md mt-12">
              <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                <span>Naseeb · Simulasi Hidup Interaktif</span>
                <span>Progres dan arsip kesimpan otomatis di browser kamu.</span>
              </div>
            </footer>

            <MobileBottomNav
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              timelineCount={timeline.length}
              archiveCount={archives.length}
            />
          </>
        )}
      </div>
    </MotionConfig>
  );
}
