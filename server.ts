import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { openAccountStore, SESSION_DURATION } from './account-store.ts';
import { readLegacyGame } from './legacy-game.ts';
import type {
  ActiveSession,
  ChapterResponse,
  CharacterState,
  CharacterStats,
  EndingSummary,
  FamilyClass,
  GenderOption,
  RelationshipProfile,
  RelationshipStatus,
  TimelineEntry,
} from './src/types/simulation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-3.1-flash-lite';
const SESSION_COOKIE = 'naseeb_account';
const LEGACY_COOKIE = 'naseeb_gemini_session';
const accounts = openAccountStore(
  process.env.BYOK_DATA_DIR || path.join(__dirname, '.byok'),
);

function createAiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    enterprise: false,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function readCookie(req: Request, cookieName: string): string | undefined {
  for (const cookie of req.headers.cookie?.split(';') ?? []) {
    const [name, value] = cookie.trim().split('=');
    if (name === cookieName && value) return value;
  }
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: req.secure || process.env.NODE_ENV === 'production',
    path: '/',
  };
}

function getAiClient(userId: string): GoogleGenAI {
  const apiKey = accounts.getGeminiKey(userId);
  if (!apiKey) throw new Error('Gemini API key required');
  return createAiClient(apiKey);
}

function clampStat(val: number): number {
  return Math.max(0, Math.min(100, Math.round(val)));
}

function stripEmDash(text: string): string {
  return text.replace(/\s*—\s*/g, ', ');
}

function sanitizeEndingSummary(raw: Partial<EndingSummary>): EndingSummary {
  return {
    archetypeTitle: stripEmDash(raw.archetypeTitle || 'Jejak Hidup Unik'),
    fateHeadline: stripEmDash(raw.fateHeadline || 'Perjalanan hidupmu akhirnya sampai di titik tenang.'),
    epilogue: stripEmDash(raw.epilogue || 'Semua pilihan yang pernah kamu ambil kini tinggal jadi cerita yang membekas.'),
    keyTurningPoints: Array.isArray(raw.keyTurningPoints)
      ? raw.keyTurningPoints.slice(0, 3).map((item) => stripEmDash(String(item)))
      : [],
    lifeQuote: stripEmDash(raw.lifeQuote || 'Setiap langkah kecil selalu ninggalin arti.'),
  };
}

function clampDelta(val: unknown): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : 0;
  return Math.max(-35, Math.min(25, Math.round(n)));
}

function normalizeStats(raw: Partial<CharacterStats> | undefined): CharacterStats {
  return {
    health: clampStat(raw?.health ?? 82),
    finance: clampStat(raw?.finance ?? 45),
    career: clampStat(raw?.career ?? 50),
    relationships: clampStat(raw?.relationships ?? 74),
    happiness: clampStat(raw?.happiness ?? 70),
  };
}

function applyDeltas(current: CharacterStats, deltas: CharacterStats): CharacterStats {
  return {
    health: clampStat(current.health + deltas.health),
    finance: clampStat(current.finance + deltas.finance),
    career: clampStat(current.career + deltas.career),
    relationships: clampStat(current.relationships + deltas.relationships),
    happiness: clampStat(current.happiness + deltas.happiness),
  };
}

const VALID_REL_STATUSES: RelationshipStatus[] = [
  'Lajang',
  'PDKT',
  'Pacaran',
  'Menikah',
  'Berpisah',
];

function normalizeRelationship(
  current: RelationshipProfile | undefined,
  incoming: Partial<RelationshipProfile> | undefined,
  selectedAnswer: string,
): RelationshipProfile {
  const prev: RelationshipProfile = current?.status
    ? current
    : { status: 'Lajang' };

  if (!incoming || !incoming.status) {
    return prev;
  }

  const rawStatus = VALID_REL_STATUSES.includes(incoming.status as RelationshipStatus)
    ? (incoming.status as RelationshipStatus)
    : prev.status;

  let nextStatus = rawStatus;
  let partnerName = stripEmDash((incoming.partnerName || '').trim()) || prev.partnerName || '';
  let partnerNote = stripEmDash((incoming.partnerNote || '').trim()) || prev.partnerNote || '';

  // Guardrail: never allow skipping straight from Lajang to Menikah/Pacaran without an introduction
  if (prev.status === 'Lajang') {
    if (nextStatus === 'Menikah' || nextStatus === 'Pacaran') {
      nextStatus = partnerName ? 'PDKT' : 'Lajang';
    }
    if (nextStatus === 'Berpisah') {
      nextStatus = 'Lajang';
    }
  } else if (prev.status === 'PDKT') {
    const explicitlyMarrying = /\b(nikah|menikah|lamar|melamar|akad|ijab)\b/i.test(selectedAnswer);
    if (nextStatus === 'Menikah' && !explicitlyMarrying) {
      nextStatus = 'Pacaran';
    }
  }

  // Never allow an unnamed partner for non-Lajang active relationships
  if (
    (nextStatus === 'PDKT' || nextStatus === 'Pacaran' || nextStatus === 'Menikah') &&
    !partnerName
  ) {
    return prev;
  }

  if (nextStatus === 'Lajang') {
    partnerName = '';
    partnerNote = '';
  }

  return {
    status: nextStatus,
    ...(partnerName ? { partnerName } : {}),
    ...(partnerNote ? { partnerNote } : {}),
  };
}

const statDeltasSchema = {
  type: Type.OBJECT,
  properties: {
    health: {
      type: Type.INTEGER,
      description: 'Perubahan Kesehatan (-35 sampai 20). Jika kesehatan sudah kritis atau terjadi insiden fatal/kelelahan ekstrem, bisa turun drastis hingga membuat health mencapai 0.',
    },
    finance: { type: Type.INTEGER, description: 'Perubahan Keuangan (-25 sampai 25).' },
    career: { type: Type.INTEGER, description: 'Perubahan Karier & Ilmu (-25 sampai 25).' },
    relationships: { type: Type.INTEGER, description: 'Perubahan Relasi Sosial/Keluarga (-25 sampai 25).' },
    happiness: { type: Type.INTEGER, description: 'Perubahan Kebahagiaan (-25 sampai 25).' },
  },
  required: ['health', 'finance', 'career', 'relationships', 'happiness'],
};

const chapterSchema = {
  type: Type.OBJECT,
  properties: {
    chapterTitle: {
      type: Type.STRING,
      description: 'Judul bab singkat (2-5 kata) dalam Bahasa Indonesia.',
    },
    lifePhase: {
      type: Type.STRING,
      description: 'Fase cerita saat ini (misal: Baru Lulus, Merintis, PDKT, Bangun Karier, Titik Balik, Masa Tenang).',
    },
    narrative: {
      type: Type.STRING,
      description:
        'Adegan singkat (sekitar 60–120 kata) dalam paragraf pendek. Selipkan ucapan langsung dalam tanda kutip di antara tindakan dan reaksi tokoh. Isi dengan prosa cerita saja. Statistik, pertanyaan dilema, dan opsi punya field masing-masing.',
    },
    dilemmaQuestion: {
      type: Type.STRING,
      description: 'Satu pertanyaan dilema yang tajam, ringkas, dan menuntut pilihan.',
    },
    consequenceNote: {
      type: Type.STRING,
      description: 'Satu kalimat pendek (maks 15 kata) tentang dampak langsung pilihan sebelumnya.',
    },
    statDeltas: statDeltasSchema,
    newTrait: {
      type: Type.STRING,
      description:
        'Satu sifat baru karakter (1-2 kata) jika terbentuk dari keputusan terakhir, atau string kosong.',
    },
    relationshipUpdate: {
      type: Type.OBJECT,
      properties: {
        status: {
          type: Type.STRING,
          description:
            'Status hubungan saat ini: Lajang, PDKT, Pacaran, Menikah, atau Berpisah. Jangan loncat status tanpa alur pengenalan.',
        },
        partnerName: {
          type: Type.STRING,
          description:
            'Nama panggilan gebetan/pacar/pasangan jika status PDKT, Pacaran, atau Menikah. Kosongkan jika Lajang.',
        },
        partnerNote: {
          type: Type.STRING,
          description:
            'Siapa dia dan gimana kalian pertama ketemu (maks 12 kata), atau string kosong jika Lajang.',
        },
      },
      required: ['status', 'partnerName', 'partnerNote'],
    },
    options: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'ID singkat seperti opt_1.' },
          label: { type: Type.STRING, description: 'Teks pilihan singkat dan konkret (maks 12 kata).' },
          hint: {
            type: Type.STRING,
            description: 'Petunjuk singkat konsekuensi (maks 8 kata).',
          },
        },
        required: ['id', 'label', 'hint'],
      },
      description: 'Tepat 4 opsi keputusan yang bervariasi arahnya (bukan cuma kerja/karier semua).',
    },
  },
  required: [
    'chapterTitle',
    'lifePhase',
    'narrative',
    'dilemmaQuestion',
    'consequenceNote',
    'statDeltas',
    'relationshipUpdate',
    'options',
  ],
};

const endingSchema = {
  type: Type.OBJECT,
  properties: {
    archetypeTitle: {
      type: Type.STRING,
      description: 'Gelar takdir hidup karakter (3-5 kata).',
    },
    fateHeadline: {
      type: Type.STRING,
      description: 'Satu kalimat pendek yang merangkum bagaimana hidup karakter berakhir.',
    },
    epilogue: {
      type: Type.STRING,
      description:
        'Epilog singkat namun membekas (2-3 paragraf pendek, total ~110 kata), boleh menyertakan satu kalimat terakhir/kenangan dialog yang paling melekat.',
    },
    keyTurningPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 momen paling menentukan sepanjang hidup karakter.',
    },
    lifeQuote: {
      type: Type.STRING,
      description: 'Satu kalimat reflektif yang merangkum jejak hidupnya.',
    },
  },
  required: ['archetypeTitle', 'fateHeadline', 'epilogue', 'keyTurningPoints', 'lifeQuote'],
};

const SYSTEM_INSTRUCTION = `Kamu adalah penulis skenario simulasi kehidupan nyata (Naseeb) dalam Bahasa Indonesia kasual yang santai, natural, dan membekas.

Gaya penulisan WAJIB:
1. BAHASA KASUAL SEHARI-HARI: Pakai Bahasa Indonesia santai dan akrab seperti obrolan nyata. Narasi menyapa pemain dengan "kamu". Sesuaikan pilihan kata, sapaan, dan tingkat formalitas dialog dengan lingkungan, generasi, dan kedekatan antar tokoh. Pakai slang atau campuran bahasa secukupnya kalau memang wajar untuk tokohnya.
2. SINGKAT, PADAT, MEMBEKAS: Untuk satu bab, tulis sekitar 60–120 kata dalam paragraf pendek. Langsung masuk ke momen yang sedang terjadi dan sisakan ruang untuk tanggapan atau reaksi.
3. PERCAKAPAN DUA ARAH: Saat tokoh berinteraksi, biarkan mereka saling menjawab, menyela, atau bereaksi sewajarnya. Karakter pemain juga boleh bicara langsung sesuai pilihan terakhir dan sifatnya. Sisipkan ucapan dalam tanda kutip biasa di tengah prosa, diselingi gerak atau reaksi yang bikin pembicaranya jelas. Contoh gaya: Kamu geser kursi. "Mau duduk dulu?" Rani naruh tasnya. "Boleh. Tapi gue belum siap cerita." Kamu angguk dan tuangin air. Hindari format skrip Nama: dialog dan blockquote Markdown.
4. KONSEKUENSI NYATA: Sesuaikan dinamika cerita dengan nama, gender, kelas keluarga awal, fase cerita, dan statistik saat ini. JANGAN sebut atau hitung umur angka secara kaku, fokus ke alur kejadian dan momen hidupnya.
5. ALUR TANPA BATAS BAB: Cerita terus jalan tanpa batas bab sampai kesehatan (health) menyentuh 0. Kalau health sudah tipis (< 25) atau ambil risiko ekstrem/burnout parah, kasih konsekuensi nyata yang bisa bikin health turun sampai 0.
6. KONTINUITAS HUBUNGAN & PLOT PENGENALAN (WAJIB!): DILARANG KERAS tiba-tiba memunculkan istri, suami, atau pacar yang belum pernah ada adegan kenalannya! Kalau status masih "Lajang", karakter BELUM punya pasangan. Hubungan romantis harus mulai dari adegan kenalan dulu (sebut nama panggilan dan di mana ketemu), lanjut ke PDKT, lalu Pacaran, baru Menikah jika pemain memilih ke arah itu.
7. SEIMBANGKAN HIDUP (BUKAN KERJA MELULU): Jangan bikin semua bab dan opsi soal kerja/bisnis/duit doang. Selipkan momen sosial, nongkrong, kenalan sama orang baru yang punya nama & karakter, romansa/PDKT, keluarga, hobi, dan kesehatan. Pastikan 4 opsi tiap bab punya variasi arah (misalnya campuran karier/uang, sosial/kenalan/romansa, dan urusan pribadi).
8. FORMAT ADEGAN: Pakai baris baru ganda (\\n\\n) antarparagraf. Kalau pembicara berganti, mulai paragraf baru bila perlu agar percakapan jelas. Akhiri narasi pada momen yang membuka dilema. Taruh pertanyaan di dilemmaQuestion, pilihan di options, dan perubahan angka di statDeltas. Narasi cukup menunjukkan dampaknya lewat kejadian. Jangan tempel daftar stats, quest, pencapaian, atau pilihan A–D ke dalam narasi.
9. DILARANG PAKAI EM DASH: Jangan pernah pakai tanda pisah panjang / em dash (—) di narasi, dialog, judul, maupun opsi. Pakai koma, titik, atau kata sambung biasa.
10. KEHIDUPAN INDONESIA MASA KINI: Pakai teknologi, kebiasaan, dan tekanan hidup yang masuk akal untuk tempat, fase hidup, kelas keluarga, dan kemampuan ekonomi karakter. Misalnya grup chat keluarga, pembayaran QR, jualan lewat marketplace, kerja hybrid, alat AI, atau kabar dari video pendek. Pilih detail yang memengaruhi adegan atau keputusan dan variasikan konteksnya. Sisakan ruang untuk interaksi tatap muka dan kebiasaan setempat.
11. TREN DAN KONTINUITAS: Rujukan masa kini berlaku untuk latar awal dan suasana umum. Hormati periode, tempat, teknologi, dan kebiasaan yang sudah muncul di cerita. Kalau waktu berlalu, tunjukkan perubahan secara wajar seiring fase hidup karakter. Gunakan tren yang masuk akal bagi lingkungannya. Kalau ragu tentang meme, kabar, harga, atau fitur terbaru, pakai rujukan umum tanpa mengklaimnya sedang viral atau menyebut fakta yang belum pasti. Untuk epilog, ambil detail dari perjalanan yang sudah diceritakan.`;

const STORY_PERIOD_FORMAT = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

function getStoryInstructions(): string {
  return `${SYSTEM_INSTRUCTION}

Acuan dunia nyata saat ini adalah ${STORY_PERIOD_FORMAT.format(new Date())}. Pakai periode ini sebagai acuan latar saat memulai cerita. Ikuti waktu yang sudah terbentuk untuk bab lanjutan dan epilog. Sebut bulan atau tahun di naskah hanya kalau penting bagi adegan.`;
}

async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (formatGeminiError(error).status === 403) throw error;
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function formatGeminiError(error: unknown): { status: number; message: string } {
  if (error instanceof Error && error.message === 'Gemini API key required') {
    return {
      status: 428,
      message: 'Masukkan API key Gemini dulu untuk main.',
    };
  }
  if (error instanceof ApiError) {
    let reasons: unknown[] = [];
    try {
      const details = JSON.parse(error.message)?.error?.details;
      if (Array.isArray(details)) reasons = details.map((detail) => detail?.reason);
    } catch {
      // The upstream HTTP status is still available without a JSON error body.
    }

    if (reasons.includes('API_KEY_INVALID') || reasons.includes('API_KEY_EXPIRED')) {
      return { status: 403, message: `Gemini menolak API key (HTTP ${error.status}).` };
    }
    if (reasons.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
      return { status: 403, message: 'Gemini menolak jenis kredensial ini (ACCESS_TOKEN_TYPE_UNSUPPORTED).' };
    }
    if (error.status === 401 || error.status === 403) {
      return { status: 403, message: `Gemini menolak akses ke model ${MODEL_NAME} (HTTP ${error.status}).` };
    }
    if (error.status === 429) {
      return {
        status: 429,
        message: 'Kuota Gemini API lagi penuh nih. Tunggu bentar terus coba lagi ya.',
      };
    }
  }
  return {
    status: 500,
    message: 'Lagi gagal nyusun kelanjutan cerita dari Gemini. Coba lagi sebentar ya.',
  };
}

function summarizeHistory(history: TimelineEntry[]): string {
  if (history.length === 0) return 'Baru memulai.';
  const recent = history.slice(-8);
  const older = history.slice(0, -8);

  const olderSummary =
    older.length > 0
      ? `Ringkasan ${older.length} bab awal: ` +
        older.map((h) => `[Bab ${h.turn}: ${h.chosenAnswer}]`).join(' ')
      : '';

  const recentText = recent
    .map(
      (h) =>
        `Bab ${h.turn} (${h.phase} · ${h.chapterTitle}): Ditanya "${h.question}" -> Memilih "${h.chosenAnswer}". Dampak: ${h.consequenceNote}`,
    )
    .join('\n');

  return olderSummary ? `${olderSummary}\n\nBab-bab terbaru:\n${recentText}` : recentText;
}

const app = express();
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const fetchSite = req.get('Sec-Fetch-Site');
  if (req.method !== 'GET' && req.method !== 'HEAD' && (fetchSite === 'cross-site' || fetchSite === 'same-site')) {
    res.status(403).json({ error: 'Permintaan harus berasal dari Naseeb.' });
    return;
  }
  next();
});
app.use('/api/account/register', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '1mb' }));

app.post(['/api/account/register', '/api/account/login'], async (req, res, next) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const pin = req.body?.pin;
  if (username.length < 3 || username.length > 40 || /[\p{C}]/u.test(username) ||
    typeof pin !== 'string' || !/^[0-9]{6}$/.test(pin)) {
    res.status(400).json({ error: 'Masukkan username 3–40 karakter dan PIN 6 angka.' });
    return;
  }

  try {
    const previousToken = readCookie(req, SESSION_COOKIE);
    const ip = req.ip ?? 'unknown';
    const registering = req.path === '/api/account/register';
    const legacy = registering ? readLegacyGame(req.body?.legacy) : null;
    if (registering && !legacy) {
      res.status(400).json({ error: 'Progres lama tidak bisa dibaca. Coba lagi tanpa mengimpor progres.' });
      return;
    }
    const result = legacy
      ? await accounts.register(username, pin, ip, readCookie(req, LEGACY_COOKIE), legacy, previousToken)
      : await accounts.login(username, pin, ip, previousToken);
    if (result.status === 'limited') {
      res.set('Retry-After', '900').status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
      return;
    }
    if (result.status === 'duplicate') {
      res.status(409).json({ error: 'Username sudah dipakai.' });
      return;
    }
    if (result.status === 'invalid') {
      res.status(401).json({ error: 'Username atau PIN salah.' });
      return;
    }
    res.cookie(SESSION_COOKIE, result.token, { ...cookieOptions(req), maxAge: SESSION_DURATION });
    if (registering) res.clearCookie(LEGACY_COOKIE, cookieOptions(req));
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.post('/api/account/logout', (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  const expectedAccount = req.get('X-Naseeb-Account');
  if (expectedAccount && expectedAccount !== accounts.userId(token)) {
    res.sendStatus(401);
    return;
  }
  accounts.logout(token);
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
  res.sendStatus(204);
});

app.use(['/api/account', '/api/gemini-key', '/api/story', '/api/game'], (req, res, next) => {
  const userId = accounts.userId(readCookie(req, SESSION_COOKIE));
  const expectedAccount = req.get('X-Naseeb-Account');
  if (!userId || (expectedAccount && expectedAccount !== userId)) {
    res.status(401).json({ error: 'Masuk ke akun Naseeb dulu.' });
    return;
  }
  res.locals.userId = userId;
  next();
});

app.get('/api/account', (_req, res) => {
  res.json(accounts.account(res.locals.userId));
});

app.get('/api/game', (_req, res) => {
  res.json(accounts.game.get(res.locals.userId));
});

function requireCurrentRevision(req: Request, res: Response): number | null {
  const expected = req.body?.revision;
  if (!Number.isSafeInteger(expected) || expected !== accounts.game.revision(res.locals.userId)) {
    res.status(409).json({ error: 'Progres sudah berubah. Data terbaru sedang dimuat.' });
    return null;
  }
  return expected;
}

function saveGame(req: Request, res: Response, revision: number, state: ActiveSession | null, entry?: TimelineEntry) {
  const userId = res.locals.userId;
  if (accounts.userId(readCookie(req, SESSION_COOKIE)) !== userId) {
    res.status(401).json({ error: 'Masuk ke akun Naseeb dulu.' });
    return;
  }
  const update = accounts.game.commit(userId, revision, state, entry);
  if (!update) {
    res.status(409).json({ error: 'Progres sudah berubah. Data terbaru sedang dimuat.' });
    return;
  }
  res.json(update);
}

app.post('/api/game/reset', (req, res) => {
  const revision = requireCurrentRevision(req, res);
  if (revision !== null) saveGame(req, res, revision, null);
});

app.delete('/api/game/archives/:id', (req, res) => {
  accounts.game.deleteArchive(res.locals.userId, req.params.id);
  res.sendStatus(204);
});

app.get('/api/gemini-key', (_req, res) => {
  res.json({ configured: accounts.hasGeminiKey(res.locals.userId) });
});

app.put('/api/gemini-key', async (req, res) => {
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';

  try {
    await createAiClient(apiKey).models.generateContent({
      model: MODEL_NAME,
      contents: 'Reply with OK.',
      config: {
        maxOutputTokens: 32,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        httpOptions: { timeout: 15_000 },
      },
    });
  } catch (error) {
    const formatted = formatGeminiError(error);
    if (formatted.status === 403 || formatted.status === 429) {
      res.status(formatted.status).json({ error: formatted.message });
    } else {
      const message = error instanceof ApiError
        ? `Tes ke model ${MODEL_NAME} gagal (HTTP ${error.status} dari Gemini).`
        : 'Tes API key gagal saat mengirim request ke Gemini. Coba lagi ya.';
      res.status(502).json({ error: message });
    }
    return;
  }

  try {
    if (accounts.userId(readCookie(req, SESSION_COOKIE)) !== res.locals.userId) {
      res.status(401).json({ error: 'Masuk ke akun Naseeb dulu.' });
      return;
    }
    accounts.setGeminiKey(res.locals.userId, apiKey);
    res.sendStatus(204);
  } catch {
    res.status(500).json({ error: 'API key belum bisa disimpan. Coba lagi sebentar ya.' });
  }
});

app.delete('/api/gemini-key', (_req, res) => {
  accounts.setGeminiKey(res.locals.userId, null);
  res.sendStatus(204);
});

app.post('/api/story/start', async (req, res) => {
  try {
    const revision = requireCurrentRevision(req, res);
    if (revision === null) return;
    if (accounts.game.loadActive(res.locals.userId)) {
      res.status(409).json({ error: 'Masih ada cerita aktif. Pilih Main Baru dulu.' });
      return;
    }
    const body = req.body as { name?: string; gender?: GenderOption; familyClass?: FamilyClass };
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const gender: GenderOption =
      body?.gender === 'Perempuan' || body?.gender === 'Non-biner' ? body.gender : 'Laki-laki';
    const familyClass: FamilyClass =
      body?.familyClass === 'Lower' || body?.familyClass === 'Upper' ? body.familyClass : 'Middle';

    if (!name || name.length < 2 || name.length > 50) {
      res.status(400).json({ error: 'Nama karakter minimal 2 huruf sampai maksimal 50 huruf ya.' });
      return;
    }

    const ai = getAiClient(res.locals.userId);
    const initialStatsByClass: Record<FamilyClass, CharacterStats> = {
      Lower: { health: 80, finance: 22, career: 42, relationships: 78, happiness: 64 },
      Middle: { health: 82, finance: 50, career: 54, relationships: 74, happiness: 70 },
      Upper: { health: 85, finance: 84, career: 68, relationships: 66, happiness: 72 },
    };
    const initialStats = initialStatsByClass[familyClass];

    const classContextMap: Record<FamilyClass, string> = {
      Lower: 'Keluarga sederhana (Lower): uang pas-pasan, suasana rumah apa adanya, ada tekanan buat cepat bantu ekonomi keluarga.',
      Middle: 'Keluarga kelas menengah (Middle): hidup cukup, tapi ada ekspektasi tinggi buat kuliah/kerja mapan.',
      Upper: 'Keluarga berada (Upper): fasilitas dan koneksi berlimpah, tapi beban nama besar dan standar keluarga bikin sesak.',
    };

    const prompt = `Mulai simulasi hidup baru buat:
- Nama: ${name}
- Gender: ${gender}
- Latar Kelas Keluarga: ${classContextMap[familyClass]}
- Momen awal: Baru mulai melangkah ke hidup dewasa (Bab 1)

Buka Bab 1 dengan adegan singkat yang mencerminkan latar keluarga ${familyClass}-nya. Kalau ortu atau sahabat mengajak ngobrol, biarkan karakter pemain menanggapi langsung lewat ucapan atau tindakan yang wajar.
Set relationshipUpdate ke status "Lajang" (partnerName dan partnerNote kosong).
Kasih statDeltas 0 semua, consequenceNote singkat soal titik start hidupnya, 1 pertanyaan dilema yang santai tapi ngena, dan 4 opsi keputusan awal yang bervariasi (campuran arah belajar/karier, sosial/kenalan orang baru, dan keluarga/hobi).`;

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: getStoryInstructions(),
          responseMimeType: 'application/json',
          responseSchema: chapterSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
    );

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<ChapterResponse>;
    const chapter: ChapterResponse = {
      chapterTitle: stripEmDash(parsed.chapterTitle || 'Pagi Baru Dimulai'),
      lifePhase: stripEmDash(parsed.lifePhase || 'Titik Awal'),
      narrative: stripEmDash(
        parsed.narrative ||
          `Ibu naruh teh hangat di depanmu. "Jadi, habis ini mau ngapain, ${name}?"\n\nKamu dorong ponsel ke tengah meja. "Aku lagi lihat beberapa pilihan, Bu." Ibu narik kursi dan duduk di sebelahmu. "Coba Ibu lihat. Mana yang bikin kamu penasaran?" Kamu geser layar pelan. Ada beberapa hal yang selama ini cuma berani kamu simpan di tab.`,
      ),
      dilemmaQuestion: stripEmDash(
        parsed.dilemmaQuestion || 'Langkah pertama yang pengen kamu ambil apa nih?',
      ),
      consequenceNote: stripEmDash(
        parsed.consequenceNote || 'Perjalanan hidupmu resmi dimulai dari sini.',
      ),
      statDeltas: { health: 0, finance: 0, career: 0, relationships: 0, happiness: 0 },
      newTrait: parsed.newTrait?.trim() ? stripEmDash(parsed.newTrait.trim()) : undefined,
      options:
        Array.isArray(parsed.options) && parsed.options.length > 0
          ? parsed.options.slice(0, 4).map((opt, idx) => ({
              id: opt.id || `opt_${idx + 1}`,
              label: stripEmDash(opt.label || ''),
              hint: stripEmDash(opt.hint || ''),
            }))
          : [
              { id: 'opt_1', label: 'Kuliah atau kursus skill baru', hint: 'Ilmu dapet, peluang kebuka.' },
              { id: 'opt_2', label: 'Nekat merantau ke kota besar', hint: 'Risiko gede, pengalaman luas.' },
              { id: 'opt_3', label: 'Nongkrong dan perluas lingkaran teman', hint: 'Kenal orang baru, relasi naik.' },
              { id: 'opt_4', label: 'Rintis proyek atau bisnis kecil', hint: 'Bebas, tapi penuh ketidakpastian.' },
            ],
      isEnding: false,
      relationshipUpdate: { status: 'Lajang' },
    };

    const character: CharacterState = {
      name,
      gender,
      familyClass,
      phase: chapter.lifePhase,
      stats: initialStats,
      traits: chapter.newTrait ? [chapter.newTrait] : [],
      relationship: { status: 'Lajang' },
    };

    saveGame(req, res, revision, { character, currentChapter: chapter, turn: 1, timeline: [], savedAt: new Date().toISOString() });
  } catch (error) {
    const formatted = formatGeminiError(error);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/story/next', async (req, res) => {
  try {
    const revision = requireCurrentRevision(req, res);
    if (revision === null) return;
    const active = accounts.game.loadActive(res.locals.userId);
    const selectedAnswer = typeof req.body?.selectedAnswer === 'string' ? req.body.selectedAnswer.trim() : '';
    if (!active || active.currentChapter.isEnding || !selectedAnswer) {
      res.status(400).json({ error: 'Data karakter dan pilihanmu belum lengkap nih.' });
      return;
    }
    const { character, currentChapter } = active;
    const turn = active.turn + 1;
    const entry: TimelineEntry = {
      turn: active.turn,
      phase: currentChapter.lifePhase,
      chapterTitle: currentChapter.chapterTitle,
      narrative: currentChapter.narrative,
      question: currentChapter.dilemmaQuestion,
      chosenAnswer: selectedAnswer,
      consequenceNote: '',
      statDeltas: { health: 0, finance: 0, career: 0, relationships: 0, happiness: 0 },
      statsAfter: character.stats,
    };
    const history = [...active.timeline, entry];

    const ai = getAiClient(res.locals.userId);
    const currentStats = normalizeStats(character.stats);
    const currentRelationship: RelationshipProfile = character.relationship?.status
      ? character.relationship
      : { status: 'Lajang' };
    const historyText = summarizeHistory(history);

    const relationshipSummary =
      currentRelationship.status === 'Lajang'
        ? 'Lajang (BELUM punya pacar, tunangan, istri, atau suami sama sekali!)'
        : `${currentRelationship.status}${currentRelationship.partnerName ? ` dengan ${currentRelationship.partnerName}` : ''}${currentRelationship.partnerNote ? ` (${currentRelationship.partnerNote})` : ''}`;

    const prompt = `Lanjutin simulasi hidup tanpa batas bab ke Bab ${turn}.

Profil Karakter:
- Nama: ${character.name}
- Gender: ${character.gender}
- Latar Kelas Keluarga Awal: ${character.familyClass || 'Middle'}
- Fase Cerita Saat Ini: ${character.phase}
- Status Hubungan Saat Ini: ${relationshipSummary}
- Sifat yang udah kebentuk: ${character.traits.length > 0 ? character.traits.join(', ') : 'Belum menonjol'}
- Statistik sebelum pilihan ini: Kesehatan=${currentStats.health}, Keuangan=${currentStats.finance}, Karier=${currentStats.career}, Relasi=${currentStats.relationships}, Kebahagiaan=${currentStats.happiness}

Riwayat Perjalanan:
${historyText}

Adegan sebelum pilihan terbaru:
${currentChapter.narrative}

Pilihan Terbaru yang Diambil:
"${selectedAnswer}"

Instruksi Bab ${turn}:
- Ceritain kelanjutan kejadiannya secara mengalir dan alami dari bab sebelumnya tanpa nyebut atau ngitung angka umur.
- Tunjukkan dampak pilihan lewat tindakan, ucapan, dan respons tokoh. Kalau pilihan pemain berisi ucapan, masukkan ucapannya dalam tanda kutip dan beri tokoh lain ruang untuk bereaksi.
- ATURAN KONTINUITAS PASANGAN: JANGAN PERNAH tiba-tiba nyebut istri/suami/pacar kalau status masih "Lajang"! Kalau ada tokoh baru yang dikenalin di adegan ini, tulis momen kenalannya secara jelas (sebut namanya + di mana ketemu) dan isi relationshipUpdate ke "PDKT". Kalau belum ada romansa, pertahankan status "${currentRelationship.status}".
- Tunjukin efek nyata dari pilihan "${selectedAnswer}" ke statistik (statDeltas). Kalau pilihannya nekat/merusak tubuh atau health udah tipis, health bisa turun drastis sampai 0.
- Kasih 1 pertanyaan dilema baru dan 4 opsi yang BERVARIASI (jangan kerja/karier semua; sering kasih opsi sosial, nongkrong, kenalan sama orang baru, romansa, keluarga, atau jaga diri).`;

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: getStoryInstructions(),
          responseMimeType: 'application/json',
          responseSchema: chapterSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
    );

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<ChapterResponse>;
    const deltas: CharacterStats = {
      health: clampDelta(parsed.statDeltas?.health),
      finance: clampDelta(parsed.statDeltas?.finance),
      career: clampDelta(parsed.statDeltas?.career),
      relationships: clampDelta(parsed.statDeltas?.relationships),
      happiness: clampDelta(parsed.statDeltas?.happiness),
    };

    const nextStats = applyDeltas(currentStats, deltas);
    const newTrait = parsed.newTrait?.trim();
    const updatedTraits =
      newTrait && !character.traits.includes(newTrait)
        ? [...character.traits, newTrait].slice(-8)
        : character.traits;

    const nextPhase = parsed.lifePhase || character.phase;
    const nextRelationship = normalizeRelationship(
      currentRelationship,
      parsed.relationshipUpdate,
      selectedAnswer,
    );

    const updatedCharacter: CharacterState = {
      ...character,
      phase: nextPhase,
      stats: nextStats,
      traits: updatedTraits,
      relationship: nextRelationship,
    };

    const isHealthZero = nextStats.health <= 0;
    let endingSummary: EndingSummary | undefined;

    if (isHealthZero) {
      const finalRelSummary =
        nextRelationship.status === 'Lajang'
          ? 'Lajang (tidak punya pasangan/istri/suami)'
          : `${nextRelationship.status}${nextRelationship.partnerName ? ` dengan ${nextRelationship.partnerName}` : ''}${nextRelationship.partnerNote ? ` (${nextRelationship.partnerNote})` : ''}`;

      const endingPrompt = `Kesehatan ${character.name} baru aja menyentuh angka 0 pada Bab ${turn} (Fase: ${nextPhase}).

Keputusan terakhirnya: "${selectedAnswer}"
Cerita terakhir: ${parsed.narrative ?? ''}
Status Hubungan: ${finalRelSummary}
Statistik akhir: Kesehatan=0, Keuangan=${nextStats.finance}, Karier=${nextStats.career}, Relasi=${nextStats.relationships}, Kebahagiaan=${nextStats.happiness}
Sifat yang kebentuk: ${updatedTraits.join(', ') || 'Apa adanya'}

Riwayat Lengkap:
${historyText}

Bikin epilog nasib akhir yang singkat, kasual tapi dalem dan membekas soal gimana ${character.name} nutup perjalanan hidupnya sampai akhir (konsisten dengan status hubungan di atas, jangan ngarang pasangan yang nggak pernah ada).`;

      const endingRes = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: endingPrompt,
          config: {
            systemInstruction: getStoryInstructions(),
            responseMimeType: 'application/json',
            responseSchema: endingSchema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        }),
      );

      endingSummary = sanitizeEndingSummary(
        JSON.parse((endingRes.text ?? '{}').trim()) as Partial<EndingSummary>,
      );
    }

    const chapter: ChapterResponse = {
      chapterTitle: stripEmDash(parsed.chapterTitle || `Bab ${turn}`),
      lifePhase: stripEmDash(nextPhase),
      narrative: stripEmDash(
        parsed.narrative ||
          `Waktu terus jalan dan ${character.name} mulai ngerasain langsung hasil dari pilihannya kemarin.`,
      ),
      dilemmaQuestion: isHealthZero
        ? ''
        : stripEmDash(parsed.dilemmaQuestion || 'Sekarang, langkah apa yang mau kamu ambil?'),
      consequenceNote: stripEmDash(
        parsed.consequenceNote || 'Pilihan kemarin ngubah arah hidupmu hari ini.',
      ),
      statDeltas: deltas,
      newTrait: newTrait ? stripEmDash(newTrait) : undefined,
      relationshipUpdate: nextRelationship,
      options: isHealthZero
        ? []
        : Array.isArray(parsed.options) && parsed.options.length > 0
          ? parsed.options.slice(0, 4).map((opt, idx) => ({
              id: opt.id || `opt_${idx + 1}`,
              label: stripEmDash(opt.label || ''),
              hint: stripEmDash(opt.hint || ''),
            }))
          : [
              { id: 'opt_1', label: 'Ambil langkah nekat sekalian', hint: 'Peluang gede, risikonya juga gede.' },
              { id: 'opt_2', label: 'Main aman dan jaga ritme', hint: 'Biar hidup tetap stabil dulu.' },
              { id: 'opt_3', label: 'Dahuluin orang-orang terdekat', hint: 'Relasi kuat, karier agak melambat.' },
              { id: 'opt_4', label: 'Rehat sebentar dan ganti haluan', hint: 'Cari napas dan arah baru.' },
            ],
      isEnding: isHealthZero,
      endingSummary,
    };

    entry.consequenceNote = chapter.consequenceNote;
    entry.statDeltas = chapter.statDeltas;
    entry.statsAfter = updatedCharacter.stats;
    saveGame(req, res, revision, {
      character: updatedCharacter, currentChapter: chapter, turn, timeline: history, savedAt: new Date().toISOString(),
    }, entry);
  } catch (error) {
    const formatted = formatGeminiError(error);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/story/end', async (req, res) => {
  try {
    const revision = requireCurrentRevision(req, res);
    if (revision === null) return;
    const active = accounts.game.loadActive(res.locals.userId);
    if (!active || active.currentChapter.isEnding) {
      res.status(400).json({ error: 'Data karakter perlu diisi dulu buat nyimpulin nasib.' });
      return;
    }
    const { character, currentChapter, turn, timeline: history } = active;

    const ai = getAiClient(res.locals.userId);
    const stats = normalizeStats(character.stats);
    const historyText = summarizeHistory(history);

    const endRel = character.relationship?.status
      ? character.relationship
      : { status: 'Lajang' as const };
    const endRelSummary =
      endRel.status === 'Lajang'
        ? 'Lajang (tidak punya pasangan/istri/suami)'
        : `${endRel.status}${endRel.partnerName ? ` dengan ${endRel.partnerName}` : ''}${endRel.partnerNote ? ` (${endRel.partnerNote})` : ''}`;

    const prompt = `Pemain mutusin buat nutup cerita hidup ${character.name} (${character.gender}, asal keluarga kelas ${character.familyClass || 'Middle'}) pada Bab ${turn} (Fase: ${character.phase}).

Status Hubungan: ${endRelSummary}
Statistik saat ini: Kesehatan=${stats.health}, Keuangan=${stats.finance}, Karier=${stats.career}, Relasi=${stats.relationships}, Kebahagiaan=${stats.happiness}
Sifat yang kebentuk: ${character.traits.join(', ') || 'Apa adanya'}

Riwayat Perjalanan:
${historyText}

Adegan terakhir:
${currentChapter.narrative}

Bikin epilog nasib akhir yang singkat, kasual, natural, dan ngena sesuai kondisi hidup serta pilihan-pilihan ${character.name} (konsisten dengan status hubungan di atas, jangan ngarang pasangan yang nggak pernah dikenalin).`;

    const endingRes = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: getStoryInstructions(),
          responseMimeType: 'application/json',
          responseSchema: endingSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
    );

    const endingSummary = sanitizeEndingSummary(
      JSON.parse((endingRes.text ?? '{}').trim()) as Partial<EndingSummary>,
    );

    const chapter: ChapterResponse = {
      chapterTitle: 'Garis Akhir Cerita',
      lifePhase: 'Nasib Akhir',
      narrative: `Di bab ke-${turn}, ${character.name} narik napas panjang dan nengok ke belakang, ngelihat semua jejak yang udah dilewatin.`,
      dilemmaQuestion: '',
      consequenceNote: 'Semua pilihanmu dirangkum jadi gambaran utuh perjalanan hidupmu.',
      statDeltas: { health: 0, finance: 0, career: 0, relationships: 0, happiness: 0 },
      options: [],
      isEnding: true,
      endingSummary,
    };

    saveGame(req, res, revision, {
      ...active, currentChapter: chapter, savedAt: new Date().toISOString(),
    });
  } catch (error) {
    const formatted = formatGeminiError(error);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));
app.use('/api', (error: { status?: number }, _req: Request, res: Response, _next: express.NextFunction) => {
  if (error.status === 413) {
    res.status(413).json({ error: 'Data terlalu besar untuk dikirim.' });
  } else if (error.status === 400) {
    res.status(400).json({ error: 'Data permintaan tidak bisa dibaca.' });
  } else {
    res.status(500).json({ error: 'Server gagal memproses permintaan. Coba lagi ya.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server berjalan pada http://localhost:${PORT}`);
  });
}

startServer();
