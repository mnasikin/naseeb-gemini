import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Clock, KeyRound, LogOut, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { AccountGate } from './components/AccountGate';
import { ArchiveView } from './components/ArchiveView';
import { CharacterDossier } from './components/CharacterDossier';
import { CharacterSetup } from './components/CharacterSetup';
import { GeminiKeyDialog, type GeminiKeyDialogMode } from './components/GeminiKeyDialog';
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
  AccountData,
  FamilyClass,
  GameData,
  GameUpdate,
  GenderOption,
} from './types/simulation';

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
  return (
    <AccountGate>
      {(account, onLogout, onSessionLost) => (
        <Game key={account.id} account={account} onLogout={onLogout} onSessionLost={onSessionLost} />
      )}
    </AccountGate>
  );
}

function Game({ account, onLogout, onSessionLost }: {
  account: AccountData;
  onLogout: () => Promise<void>;
  onSessionLost: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulation');
  const [game, setGame] = useState(account.game);
  const { revision, activeSession, archives } = game;
  const character = activeSession?.character ?? null;
  const currentChapter = activeSession?.currentChapter ?? null;
  const turn = activeSession?.turn ?? 1;
  const timeline = activeSession?.timeline ?? [];

  const storyCardRef = useRef<HTMLElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttemptedAnswer, setLastAttemptedAnswer] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isCurrentlyFullscreen());
  const fullscreenAvailable = isFullscreenSupported();
  const [keyDialog, setKeyDialog] = useState<GeminiKeyDialogMode | null>(account.geminiConfigured ? null : 'setup');
  const closeKeyDialog = useCallback(() => setKeyDialog(null), []);

  const openKeySettings = () => setKeyDialog('manage');

  async function refreshGame() {
    const response = await fetch('/api/game', { headers: { 'X-Naseeb-Account': account.id } });
    if (response.status === 401) {
      onSessionLost();
      return;
    }
    if (!response.ok) throw new Error('Progres belum bisa dimuat. Coba lagi ya.');
    const latest: GameData = await response.json();
    setGame(latest);
  }

  async function requestGameUpdate(url: string, body: Record<string, unknown>): Promise<GameUpdate> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Naseeb-Account': account.id },
      body: JSON.stringify({ ...body, revision }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) onSessionLost();
      if (response.status === 403) setKeyDialog('manage');
      if (response.status === 428) setKeyDialog('setup');
      if (response.status === 409) {
        setLastAttemptedAnswer(null);
        await refreshGame();
      }
      throw new Error(data?.error || 'Progres belum bisa diperbarui. Coba lagi ya.');
    }
    return data;
  }

  function applyUpdate(update: GameUpdate) {
    setGame((previous) => ({
      revision: update.revision,
      activeSession: update.activeSession,
      archives: update.archivedLife ? [update.archivedLife, ...previous.archives] : previous.archives,
    }));
  }

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
    if (isLoading) return;
    // Trigger browser fullscreen synchronously inside user click/submit gesture
    enterFullscreen();

    setIsLoading(true);
    setError(null);
    setLastAttemptedAnswer(null);

    try {
      applyUpdate(await requestGameUpdate('/api/story/start', { name, gender, familyClass }));
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

    try {
      applyUpdate(await requestGameUpdate('/api/story/next', { selectedAnswer: answer }));
      setLastAttemptedAnswer(null);
      scrollToStoryCard();
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

  const handleReset = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    setLastAttemptedAnswer(null);
    try {
      applyUpdate(await requestGameUpdate('/api/game/reset', {}));
      exitFullscreen();
      setActiveTab('simulation');
      scrollToTop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Belum bisa mulai ulang. Coba lagi ya.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConcludeEarly = async () => {
    if (!character || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      applyUpdate(await requestGameUpdate('/api/story/end', {}));
      setLastAttemptedAnswer(null);
      scrollToStoryCard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal nyimpulin nasib akhir.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteArchive = async (id: string) => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/game/archives/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-Naseeb-Account': account.id },
      });
      if (response.status === 401) {
        onSessionLost();
        return;
      }
      if (!response.ok) throw new Error('Arsip belum bisa dihapus. Coba lagi ya.');
      setGame((previous) => ({ ...previous, archives: previous.archives.filter((item) => item.id !== id) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arsip belum bisa dihapus. Coba lagi ya.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      exitFullscreen();
      await onLogout();
    } catch {
      setError('Belum bisa keluar. Coba lagi ya.');
      setIsLoading(false);
    }
  };

  const isImmersivePlay = activeTab === 'simulation' && Boolean(character && currentChapter);
  const keySettingsButton = (
    <button
      type="button"
      aria-label="Kelola API key Gemini"
      title="Kelola API key Gemini"
      onClick={openKeySettings}
      disabled={isLoading}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50"
    >
      <KeyRound aria-hidden="true" className="h-4 w-4" />
      <span className="hidden lg:inline">API key</span>
    </button>
  );
  const logoutButton = (
    <button
      type="button"
      aria-label="Keluar dari akun"
      title={`Keluar dari akun ${account.username}`}
      onClick={handleLogout}
      disabled={isLoading}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-slate-600 hover:bg-white hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50"
    >
      <LogOut aria-hidden="true" className="h-4 w-4" />
    </button>
  );

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

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                {keySettingsButton}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleReset}
                  disabled={isLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
                >
                  Main Baru
                </motion.button>
                {logoutButton}
              </div>
            </div>
          </header>
        )}

        <main className={`flex-1 ${isImmersivePlay ? 'pb-8' : 'pb-20 md:pb-8'}`}>
          {activeTab !== 'simulation' && error && (
            <p role="alert" className="mx-auto mt-4 max-w-5xl px-4 text-sm text-red-700">{error}</p>
          )}
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
                    <div className="flex items-center justify-between gap-2 mb-4 sm:mb-6">
                      <span className="font-editorial text-lg font-semibold text-slate-900 whitespace-nowrap shrink-0">
                        Naseeb
                      </span>

                      <div className="flex items-center gap-1.5 sm:gap-2">
                        {keySettingsButton}
                        <button
                          type="button"
                          onClick={() => setActiveTab('timeline')}
                          aria-label="Linimasa"
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white/80 rounded-lg transition-colors whitespace-nowrap min-h-[44px]"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Linimasa</span>
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
                          aria-label="Main Baru"
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white/85 border border-slate-200 hover:bg-white rounded-lg transition-colors whitespace-nowrap min-h-[44px]"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden min-[375px]:inline">Main Baru</span>
                        </button>
                        {logoutButton}
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
                  isLoading={isLoading}
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
                <span>Progres dan arsip tersimpan otomatis di akun kamu.</span>
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
      {keyDialog && (
        <GeminiKeyDialog
          key={keyDialog}
          initialMode={keyDialog}
          accountId={account.id}
          onClose={closeKeyDialog}
          onSessionLost={onSessionLost}
        />
      )}
    </MotionConfig>
  );
}
