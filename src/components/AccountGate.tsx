import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AccountData, ActiveSession, ArchivedLife } from '../types/simulation';
import { PIN_LENGTH, PinInput } from './PinInput';

const SESSION_STORAGE_KEY = 'naseeb_active_session_v1';
const ARCHIVE_STORAGE_KEYS = ['naseeb_archives_v1', 'jejak_hidup_archives_v1'];
const LEGACY_KEY_STORAGE = 'naseeb_gemini_api_key';
const EMPTY_PIN = Array<string>(PIN_LENGTH).fill('');

function readLocal<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function readLegacyProgress() {
  const saved = readLocal<ActiveSession>(SESSION_STORAGE_KEY);
  const activeSession = saved?.character && saved.currentChapter && Number.isSafeInteger(saved.turn)
    ? { ...saved, timeline: Array.isArray(saved.timeline) ? saved.timeline : [], savedAt: saved.savedAt || new Date().toISOString() }
    : null;
  const archived = ARCHIVE_STORAGE_KEYS.flatMap((key) => {
    const items = readLocal<ArchivedLife[]>(key);
    return Array.isArray(items) ? items : [];
  });
  return { activeSession, archives: archived };
}

function clearLocal(keys: string[]) {
  try {
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Browser storage can be unavailable.
  }
}

async function fetchAccount(): Promise<AccountData | null> {
  const response = await fetch('/api/account');
  if (response.status === 401) return null;
  if (response.status === 404 || !response.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error('Server akun Naseeb belum tersedia.');
  }
  if (!response.ok) throw new Error('Akun belum bisa dimuat. Coba lagi ya.');
  return response.json();
}

export function AccountGate({ children }: {
  children: (account: AccountData, onLogout: () => Promise<void>, onSessionLost: () => void) => ReactNode;
}) {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkFailed, setCheckFailed] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [pinDigits, setPinDigits] = useState(EMPTY_PIN);
  const [legacy, setLegacy] = useState(readLegacyProgress);
  const [importProgress, setImportProgress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasLegacy = Boolean(legacy.activeSession || legacy.archives.length);

  async function loadAccount() {
    setChecking(true);
    setCheckFailed(false);
    setError('');
    try {
      setAccount(await fetchAccount());
    } catch (err) {
      setCheckFailed(true);
      setError(err instanceof Error ? err.message : 'Akun belum bisa dimuat. Coba lagi ya.');
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    clearLocal([LEGACY_KEY_STORAGE]);
    void loadAccount();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pin = pinDigits.join('');
    if (busy || pin.length !== PIN_LENGTH) return;
    setBusy(true);
    setError('');
    const importing = mode === 'register' && hasLegacy && importProgress;
    try {
      const response = await fetch(`/api/account/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin, ...(importing && { legacy }) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Akun belum bisa dibuka. Coba lagi ya.');
      }
      if (importing) {
        clearLocal([SESSION_STORAGE_KEY, ...ARCHIVE_STORAGE_KEYS]);
        setLegacy({ activeSession: null, archives: [] });
      }
      setPinDigits(EMPTY_PIN);
      const result = await fetchAccount();
      if (!result) throw new Error('Sesi akun belum bisa dibuka. Coba masuk lagi ya.');
      setAccount(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ada gangguan saat menghubungi server.');
    } finally {
      setBusy(false);
    }
  }

  function sessionLost() {
    setAccount(null);
    setMode('login');
    setPinDigits(EMPTY_PIN);
    setError('Sesi akun berubah atau sudah berakhir. Masuk lagi untuk melanjutkan.');
  }

  async function logout() {
    const response = await fetch('/api/account/logout', {
      method: 'POST',
      headers: account ? { 'X-Naseeb-Account': account.id } : undefined,
    });
    if (!response.ok && response.status !== 401) throw new Error('Belum bisa keluar. Coba lagi ya.');
    sessionLost();
    setError('');
    setUsername('');
  }

  if (account) return children(account, logout, sessionLost);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f6f8fb] p-4">
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="mb-5 text-3xl font-semibold">Naseeb</h1>
        {checking ? (
          <p role="status" className="text-sm text-slate-600">Memuat akun…</p>
        ) : checkFailed ? (
          <>
            <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>
            <button type="button" onClick={() => void loadAccount()} className="min-h-11 text-sm font-semibold text-blue-700">
              Coba lagi
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-xl font-semibold">{mode === 'login' ? 'Masuk' : 'Buat akun'}</h2>
            <label className="block text-sm font-medium">
              Username
              <input
                autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={40}
                value={username} onChange={(event) => setUsername(event.target.value)} disabled={busy}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
              />
            </label>
            <PinInput digits={pinDigits} onChange={setPinDigits} disabled={busy} />
            {mode === 'register' && (
              <>
                <p className="text-sm text-slate-600">Simpan PIN kamu. PIN tidak bisa direset.</p>
                {hasLegacy && (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={importProgress} onChange={(event) => setImportProgress(event.target.checked)} disabled={busy} className="mt-0.5 size-4" />
                    Pindahkan progres dan arsip lama dari browser ini ke akun baru.
                  </label>
                )}
              </>
            )}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {busy ? 'Memproses…' : mode === 'login' ? 'Masuk' : 'Buat akun'}
            </button>
            <button type="button" disabled={busy} onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setPinDigits(EMPTY_PIN);
              setError('');
            }} className="min-h-11 w-full text-sm font-semibold text-blue-700 hover:underline disabled:opacity-50">
              {mode === 'login' ? 'Buat akun baru' : 'Sudah punya akun? Masuk'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
