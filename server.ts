import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';
import { openAccountStore, SESSION_DURATION } from './account-store.ts';
import { readLegacyGame } from './legacy-game.ts';
import { normalizeDialogueQuotes } from './src/utils/story-text.ts';
import type {
  ActiveSession,
  ChapterResponse,
  CharacterState,
  CharacterStats,
  ChemistryScore,
  EndingSummary,
  FamilyClass,
  FamilyClassChoice,
  GenderOption,
  RelationshipProfile,
  RelationshipStatus,
  StatChanges,
  StoryOption,
  TimelineEntry,
} from './src/types/simulation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-3.1-flash-lite';
const STAT_DELTA_LIMIT = 5;
const MAJOR_DELTA_LIMIT = 25;
const STAT_DELTA_RANGE = `normal -${STAT_DELTA_LIMIT} sampai +${STAT_DELTA_LIMIT}, kejadian besar -${MAJOR_DELTA_LIMIT} sampai +${MAJOR_DELTA_LIMIT}`;
const STAT_LABELS: Record<keyof CharacterStats, string> = {
  health: 'Kesehatan', finance: 'Keuangan', career: 'Karier', relationships: 'Relasi', happiness: 'Kebahagiaan',
};
type StoryState = Pick<CharacterState, 'name' | 'gender' | 'stats' | 'chemistry'>;
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
  if (typeof raw?.epilogue !== 'string' || !raw.epilogue.trim()) {
    throw new Error('Gemini returned an empty epilogue');
  }
  return {
    archetypeTitle: stripEmDash(raw.archetypeTitle || 'Jejak Hidup Unik'),
    fateHeadline: stripEmDash(raw.fateHeadline || 'Perjalanan hidupmu akhirnya sampai di titik tenang.'),
    epilogue: stripEmDash(normalizeDialogueQuotes(raw.epilogue.trim())),
    keyTurningPoints: Array.isArray(raw.keyTurningPoints)
      ? raw.keyTurningPoints.slice(0, 3).map((item) => stripEmDash(normalizeDialogueQuotes(String(item))))
      : [],
    lifeQuote: stripEmDash(normalizeDialogueQuotes(raw.lifeQuote || 'Setiap langkah kecil selalu ninggalin arti.')),
  };
}

function majorEventReason(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function clampDelta(val: unknown, majorEvent?: unknown): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : 0;
  const limit = majorEventReason(majorEvent) ? MAJOR_DELTA_LIMIT : STAT_DELTA_LIMIT;
  return Math.max(-limit, Math.min(limit, Math.round(n)));
}

function appliedDelta(current: number, requested: unknown, majorEvent?: unknown): number {
  return clampStat(current + clampDelta(requested, majorEvent)) - current;
}

function healthContext(health: number): string {
  const condition = health >= 70
    ? 'Kondisi dasar masih bugar. Lembur atau dua kerjaan biasa paling masuk akal bikin capek, pegal, atau ngantuk. Kondisi dasar ini tidak mendukung narasi sekarat atau kolaps tanpa kejadian medis besar yang jelas.'
    : health >= 40
      ? 'Kondisi sedang menurun. Sesuaikan keluhan dengan aktivitas, istirahat, dan gejala yang sudah muncul. Masih bisa beraktivitas dengan penyesuaian.'
      : health > 20
        ? 'Kondisi rentan. Kelelahan atau keluhan dapat lebih terasa. Tunjukkan sebab dan perkembangannya sebelum kondisi memburuk.'
        : health > 0
          ? 'Kondisi sangat lemah. Situasi berat mungkin masuk akal sesuai kejadian dan gejala yang sudah dibangun.'
          : 'Kesehatan sudah habis. Tuntaskan adegan dan perjalanan karakter.';
  return `Sisa kesehatan ${health}/100. ${condition}
Untuk aktivitas rutin, sisa kesehatan berada di ${clampStat(health - STAT_DELTA_LIMIT)}–${clampStat(health + STAT_DELTA_LIMIT)}/100.
Ini skor kondisi tubuh dalam game. Tentukan apakah karakter sakit dari sebab, gejala, durasi, dan kejadian yang benar-benar ada di cerita. Hitung kesehatan setelah delta yang diizinkan, lalu sesuaikan tingkat keluhan dengan sisa skor itu. Contoh kesehatan 80 dikurangi 3 menjadi 77, karakter bisa lelah setelah lembur dan masih bugar secara umum. Rasa lelah bisa pulih dengan istirahat. Jika deskripsi bab sebelumnya terlalu parah untuk skor sekarang, lanjutkan dengan kondisi yang selaras dengan skor saat ini dan sebab yang sudah ada. Jangan menarasikan kematian selama kesehatan setelah perubahan masih di atas 0.`;
}

function pointsContext(stats: CharacterStats, chemistry: ChemistryScore[] = []): string {
  const level = (value: number) => value >= 70 ? 'tinggi' : value >= 40 ? 'cukup' : value > 20 ? 'rendah' : 'sangat rendah';
  return `${healthContext(stats.health)}
Keuangan ${stats.finance}/100 (${level(stats.finance)}). Ini indeks kemampuan finansial dalam game. Cocokkan daya beli dan tekanan uang dengan skor serta pengeluaran atau pemasukan yang sudah diceritakan. Skor tinggi masih memberi ruang untuk kebutuhan rutin.
Karier ${stats.career}/100 (${level(stats.career)}). Cocokkan kemampuan, pengalaman, dan peluang kerja dengan skor serta riwayat. Keberhasilan kecil tidak langsung membuat karakter jadi ahli.
Relasi ${stats.relationships}/100 (${level(stats.relationships)}). Ini kondisi hubungan sosial secara umum. Pakai interaksi yang sudah ada untuk menentukan dukungan atau konflik dengan orang sekitar.
Kebahagiaan ${stats.happiness}/100 (${level(stats.happiness)}). Cocokkan suasana hati dengan skor dan kejadian. Masalah rutin saat skor tinggi bisa bikin kesal sesaat tanpa langsung putus asa.
Chemistry per tokoh (0–100): ${chemistry.length
    ? chemistry.map(({ name, points }) => `${name} ${points}/100 (${level(points)})`).join(', ')
    : 'belum ada, setiap tokoh baru mulai dari 0'}.
Chemistry menunjukkan ketertarikan per orang dan perlu interaksi yang mendukungnya. Skor tinggi tidak otomatis mengubah status hubungan.
Untuk SEMUA aspek, hitung skor setelah perubahan pada batas 0–100, lalu tulis kondisi dan pilihan yang masuk akal dari skor tersisa. Skala perubahan ${STAT_DELTA_RANGE}. Hanya aspek yang terdampak yang berubah. Prediksi dampak opsi memakai kondisi di akhir bab, setelah akibat pilihan sebelumnya diterapkan.`;
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

function chemistryKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function updateChemistry(character: StoryState, updates: StatChanges['chemistry']) {
  const scores = new Map((character.chemistry ?? []).map((person) => [chemistryKey(person.name), person]));
  const changes: NonNullable<StatChanges['chemistry']> = [];
  const changed = new Set<string>();
  const playerKey = chemistryKey(character.name);

  for (const update of Array.isArray(updates) ? updates : []) {
    if (typeof update?.name !== 'string') continue;
    const name = stripEmDash(update.name.trim());
    const key = chemistryKey(name);
    if (!key || key === playerKey || changed.has(key)) continue;

    const previous = scores.get(key);
    const gender = previous?.gender ?? update.gender;
    if (gender !== 'Laki-laki' && gender !== 'Perempuan' && gender !== 'Non-biner') continue;
    if (character.gender !== 'Non-biner' && (
      gender === 'Non-biner' || gender === character.gender
    )) continue;

    const before = previous?.points ?? 0;
    const reason = majorEventReason(update.majorEvent);
    const delta = appliedDelta(before, update.delta, reason);
    if (delta === 0) continue;

    changed.add(key);
    const person: ChemistryScore = { name: previous?.name ?? name, gender, points: before + delta };
    scores.set(key, person);
    changes.push({ name: person.name, gender, delta, ...(Math.abs(delta) > STAT_DELTA_LIMIT && { majorEvent: reason }) });
  }

  return { scores: [...scores.values()], changes };
}

function normalizeChanges(character: StoryState, raw: Partial<StatChanges> | undefined): StatChanges {
  const changes: StatChanges = {
    health: 0, finance: 0, career: 0, relationships: 0, happiness: 0,
    chemistry: updateChemistry(character, raw?.chemistry).changes,
  };
  const majorEvents: NonNullable<StatChanges['majorEvents']> = {};
  for (const stat of Object.keys(STAT_LABELS) as Array<keyof CharacterStats>) {
    changes[stat] = appliedDelta(character.stats[stat], raw?.[stat], raw?.majorEvents?.[stat]);
    if (Math.abs(changes[stat]) > STAT_DELTA_LIMIT) {
      majorEvents[stat] = majorEventReason(raw?.majorEvents?.[stat]);
    }
  }
  if (Object.keys(majorEvents).length) changes.majorEvents = majorEvents;
  return changes;
}

function effectsHint(effects: StatChanges): string {
  const parts = (Object.keys(STAT_LABELS) as Array<keyof CharacterStats>)
    .filter((stat) => effects[stat] !== 0)
    .map((stat) => `${STAT_LABELS[stat]} ${effects[stat] > 0 ? '+' : ''}${effects[stat]}`);
  for (const { name, delta } of effects.chemistry ?? []) {
    parts.push(`Chemistry ${name} ${delta > 0 ? '+' : ''}${delta}`);
  }
  return parts.length ? parts.join(', ') : 'Perubahan poin 0';
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

  const nextStatus = VALID_REL_STATUSES.includes(incoming.status as RelationshipStatus)
    ? (incoming.status as RelationshipStatus)
    : prev.status;

  if (prev.status === 'Lajang' && nextStatus !== 'Lajang' && nextStatus !== 'PDKT') {
    return prev;
  }
  if (
    prev.status === 'PDKT' && nextStatus === 'Menikah' &&
    !/\b(nikah|menikah|lamar|melamar|akad|ijab)\b/i.test(selectedAnswer)
  ) {
    return prev;
  }

  let partnerName = stripEmDash((incoming.partnerName || '').trim()) || prev.partnerName || '';
  let partnerNote = stripEmDash((incoming.partnerNote || '').trim()) || prev.partnerNote || '';

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
      minimum: -MAJOR_DELTA_LIMIT,
      maximum: MAJOR_DELTA_LIMIT,
      description: `Perubahan Kesehatan (${STAT_DELTA_RANGE}). Cerita tamat saat skor kesehatan setelah perubahan mencapai 0.`,
    },
    finance: { type: Type.INTEGER, minimum: -MAJOR_DELTA_LIMIT, maximum: MAJOR_DELTA_LIMIT, description: `Perubahan Keuangan (${STAT_DELTA_RANGE}).` },
    career: { type: Type.INTEGER, minimum: -MAJOR_DELTA_LIMIT, maximum: MAJOR_DELTA_LIMIT, description: `Perubahan Karier & Ilmu (${STAT_DELTA_RANGE}).` },
    relationships: { type: Type.INTEGER, minimum: -MAJOR_DELTA_LIMIT, maximum: MAJOR_DELTA_LIMIT, description: `Perubahan Relasi umum dengan teman, keluarga, atau lingkungan (${STAT_DELTA_RANGE}).` },
    happiness: { type: Type.INTEGER, minimum: -MAJOR_DELTA_LIMIT, maximum: MAJOR_DELTA_LIMIT, description: `Perubahan Kebahagiaan (${STAT_DELTA_RANGE}).` },
    chemistry: {
      type: Type.ARRAY,
      description: 'Perubahan Chemistry romantis per tokoh yang terlibat di bab ini. Satu entri per tokoh. Kosongkan jika tidak berubah.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Nama tokoh seperti yang ditulis di cerita atau daftar Chemistry.' },
          gender: { type: Type.STRING, enum: ['Laki-laki', 'Perempuan', 'Non-biner'] },
          delta: { type: Type.INTEGER, minimum: -MAJOR_DELTA_LIMIT, maximum: MAJOR_DELTA_LIMIT, description: `Perubahan Chemistry dengan tokoh ini (${STAT_DELTA_RANGE}).` },
          majorEvent: { type: Type.STRING, description: 'Alasan kejadian besar yang benar-benar terjadi dalam adegan dan mengubah Chemistry orang ini lebih dari 5 poin. Kosongkan untuk interaksi biasa.' },
        },
        required: ['name', 'gender', 'delta'],
      },
    },
    majorEvents: {
      type: Type.OBJECT,
      description: 'Alasan per statistik untuk perubahan melebihi 5 poin. Jelaskan kejadian besar yang sudah terjadi dalam narasi serta dampak langsungnya. Kosongkan untuk kegiatan rutin.',
      properties: {
        health: { type: Type.STRING, description: 'Kejadian besar pada kesehatan, misalnya kecelakaan serius atau pemulihan besar setelah perawatan.' },
        finance: { type: Type.STRING, description: 'Kejadian finansial besar, misalnya kehilangan tabungan atau pemasukan besar yang sudah diterima.' },
        career: { type: Type.STRING, description: 'Perubahan besar di karier atau kemampuan, misalnya promosi besar atau kehilangan pekerjaan.' },
        relationships: { type: Type.STRING, description: 'Perubahan besar hubungan sosial, misalnya pengkhianatan serius atau rekonsiliasi penting.' },
        happiness: { type: Type.STRING, description: 'Kejadian emosional besar yang sudah terjadi pada karakter.' },
      },
    },
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
        'Sesuaikan panjang narasi dengan kebutuhan adegan tanpa jumlah paragraf minimum. Adegan sederhana cukup satu paragraf atau beberapa kalimat. Tambah paragraf hanya jika ada tindakan, dialog, reaksi, atau konsekuensi penting yang perlu diceritakan. Apit dialog langsung dengan petik dua melengkung “…” di antara tindakan dan reaksi tokoh. Tunjukkan kejadian yang memunculkan keputusan berikutnya. Statistik, pertanyaan, dan opsi punya field masing-masing.',
    },
    dilemmaQuestion: {
      type: Type.STRING,
      description: 'Pertanyaan tentang satu keputusan yang belum diambil di akhir adegan. Semua opsi menjawab pertanyaan ini. Kosongkan kalau cerita tamat.',
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
            'Status hubungan sekarang: Lajang, PDKT, Pacaran, Menikah, atau Berpisah. Pertahankan status sebelumnya jika pilihan pemain dan adegan belum mendukung perubahan. Kenalan atau berteman saja belum termasuk PDKT.',
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
          label: { type: Type.STRING, description: 'Tindakan spesifik yang menjawab dilema di akhir adegan. Sebut detail yang membantu pemain memahami pilihannya. Variasikan niat, termasuk spontan, iseng, santai, menghindar, atau impulsif sesuai situasi. Jika berisi ucapan, sesuaikan sapaan dengan lawan bicara.' },
          effects: {
            ...statDeltasSchema,
            description: 'Perkiraan perubahan poin jika opsi ini dipilih. Gunakan kondisi di AKHIR adegan sebagai dasar. Semua angka normal -5 sampai +5. Lebih dari 5 perlu alasan kejadian besar pada aspek terkait. Isi 0 untuk aspek yang tidak berubah. Dampak boleh negatif, netral, positif, atau campuran sesuai akibat konkretnya. Jangan otomatis memberi bonus untuk setiap tindakan atau mengganti semua kerugian dengan kenaikan aspek lain.',
          },
        },
        required: ['id', 'label', 'effects'],
      },
      description: 'Empat tanggapan dengan niat dan konsekuensi berbeda untuk dilema yang sama, termasuk pilihan spontan atau tidak produktif yang masuk akal. Jangan jadikan semuanya cara berbeda mengejar karier, pengembangan diri, atau hidup ideal. Tiap opsi bisa dilakukan berdasarkan situasi dan detail yang sudah diceritakan. Variasikan urutan opsi. Kosongkan kalau cerita tamat.',
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
        'Epilog yang menyambung dari adegan terakhir dan menunjukkan dampak perjalanan karakter. Gunakan detail yang sudah muncul di cerita. Apit setiap dialog dengan petik dua melengkung “…”. Panjangnya mengikuti kebutuhan penutup.',
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

const SYSTEM_INSTRUCTION = `Lo jadi narator life simulator berbasis teks di Indonesia yang realistis. Pemain adalah karakter utamanya. Bangun adegan lewat prosa dan dialog.

Gaya penulisan WAJIB:
1. BAHASA KASUAL SESUAI LAWAN BICARA: Pakai kata yang umum di obrolan. Di narasi, sapa pemain dengan "lo". Dalam dialog, pilih sapaan dari usia, kedekatan, peran, dan kebiasaan tokoh. "Lo/gue" cocok untuk teman sebaya yang akrab. Saat bicara dengan orang tua sendiri, gunakan "aku" atau panggilan diri yang sudah terbentuk serta "Bu/Pak/Ma/Pa" sesuai keluarga. Ke orang yang lebih tua, atasan, atau orang baru dalam situasi formal, gunakan "saya" dan "Bapak/Ibu/Pak/Bu" atau sapaan setempat yang wajar. Contoh: ke teman, “Gue duluan, ya”; ke ibu, “Aku berangkat dulu ya, Bu”; ke atasan, “Saya cek dulu ya, Pak.” Tetap terdengar santai dan natural sesuai situasi. Jangan samakan gaya bicara semua tokoh atau semua lawan bicara. Sapaan akrab yang sudah terbentuk boleh dipertahankan, dan ucapan kasar hanya muncul jika pilihan pemain atau konflik memang mendukungnya. Code-switching boleh kalau istilahnya lebih familiar, misalnya "subtitle", "deadline", atau "nge-chat". Terapkan penyesuaian ini juga pada ucapan dalam opsi dan epilog.
2. PANJANG MENGIKUTI ADEGAN: Tidak ada jumlah paragraf minimum atau target tetap per giliran. Untuk tindakan rutin, transisi singkat, atau percakapan sederhana, beberapa kalimat dalam satu paragraf sudah cukup. Tambah paragraf hanya saat ada tindakan, dialog, reaksi, atau konsekuensi penting yang perlu ruang. Momen besar boleh lebih panjang sesuai kebutuhannya. Berhenti saat dampak tindakan dan konteks keputusan berikutnya sudah jelas. Hindari filler, pengulangan situasi, dan memanjangkan adegan hanya untuk memenuhi jumlah paragraf. Variasikan panjang tiap giliran secara alami sesuai isi adegan.
3. PERCAKAPAN DUA ARAH: Tulis percakapan seperti orang yang betulan lagi ngobrol. Tokoh bisa nyeletuk, bercanda, ragu, menyela, atau beda pendapat sesuai sifat dan kedekatannya. Bedakan cara bicara orang rumah, teman, dan rekan kerja. Apit semua ucapan langsung dengan petik dua melengkung, pembuka “ dan penutup ”, termasuk ucapan pemain dan dialog dalam epilog. Contoh: Rani naruh tas. “Lo udah makan?” Lo geleng. “Belum, gue baru sampai.” Jangan gunakan petik tunggal untuk mengapit dialog. Pakai tindakan atau reaksi untuk memperjelas pembicara. Karakter pemain boleh menanggapi sesuai pilihan terakhir. Hindari format skrip Nama: dialog dan blockquote Markdown.
4. KONSEKUENSI NYATA: Sesuaikan akibat pilihan dengan situasi, kemampuan, hubungan, dan keputusan sebelumnya. Jujur atau ngasih ruang bisa memelihara kepercayaan meski hasil langsungnya kurang enak. Ngeles atau curang bisa menguntungkan sesaat dan belakangan ketahuan. Biarkan pemain sesekali salah langkah atau kena akibat lucu kalau masuk akal. Pilihan boleh menghasilkan kerugian saja, tidak mengubah poin, memberi manfaat, atau punya dampak campuran. Jangan otomatis menghadiahi sikap baik dengan bonus, menebus setiap kerugian dengan poin positif, atau menghukum istirahat dan bersenang-senang karena dianggap tidak produktif. Isi statDeltas dari akibat yang benar-benar terjadi di bab, pakai statistik game yang tersedia. Jangan hitung umur secara kaku.
5. SKALA DAMPAK DAN KESEHATAN: Perubahan poin memakai rentang ${STAT_DELTA_RANGE}. Kegiatan rutin seperti lembur, dua kerjaan, ngobrol, atau belanja biasa memakai rentang normal, termasuk 0 jika tidak ada perubahan. Pakai lebih dari 5 poin hanya untuk kejadian luar biasa yang benar-benar terjadi dan berdampak besar pada aspek itu. Isi alasan di statDeltas.majorEvents untuk tiap aspek yang berubah besar, atau majorEvent di entri Chemistry. Satu kejadian besar hanya memengaruhi aspek yang relevan. Hitung sisa kesehatan setelah perubahan sebelum menulis gejala. Cerita berlanjut sampai kesehatan 0 atau pemain menutupnya.
6. HUBUNGAN TUMBUH ALAMI: Perkenalkan tokoh baru sesuai perannya, misalnya teman, tetangga, atau rekan kerja. Kenalan, nongkrong, atau bersikap ramah saja tidak mengubah status. Pertahankan status sebelumnya sampai pilihan pemain mengarah ke romansa dan interaksi antar tokoh mendukungnya. Ketertarikan bisa tumbuh pelan, tetap sebatas teman, atau mereda sesuai pilihan pemain. Kenalkan calon pasangan di cerita sebelum status berkembang. Untuk keputusan besar seperti jadian atau menikah, beri pemain kesempatan memilih dan tunjukkan respons tokoh lain.
7. VARIASI ALUR: Perhatikan beberapa bab terakhir. Variasikan adegan ringan, momen hening, dan momen emosional. Ambil humor dari keseharian, seperti gosip tetangga, orang tua yang kepo, atau salah paham kecil. Setiap beberapa giliran, beri ruang untuk masalah atau keputusan yang lebih berat kalau alurnya sudah mengarah ke sana. Bangun plot twist dari petunjuk atau keputusan sebelumnya, hormati pilihan pemain, dan biarkan konsekuensinya terasa.
8. FORMAT ADEGAN: Pakai baris baru ganda (\\n\\n) antarparagraf. Selama cerita berlanjut, akhiri narasi tepat sebelum pemain mengambil keputusan. Taruh pertanyaan di dilemmaQuestion, empat opsi A–D di options secara berurutan tanpa menulis hurufnya di label, dan perubahan angka di statDeltas. Gunakan field itu supaya stats dan tombol pilihan bisa ditampilkan terpisah dari prosa.
9. DILARANG PAKAI EM DASH: Jangan pernah pakai tanda pisah panjang / em dash (—) di narasi, dialog, judul, maupun opsi. Pakai koma, titik, atau kata sambung biasa.
10. KEHIDUPAN INDONESIA MASA KINI: Pakai teknologi, kebiasaan, dan tekanan hidup yang masuk akal untuk tempat, fase hidup, kelas keluarga, dan kemampuan ekonomi karakter. Misalnya grup chat keluarga, pembayaran QR, jualan lewat marketplace, kerja hybrid, alat AI, atau kabar dari video pendek. Pilih detail yang memengaruhi adegan atau keputusan dan variasikan konteksnya. Sisakan ruang untuk interaksi tatap muka dan kebiasaan setempat.
11. TREN DAN KONTINUITAS: Rujukan masa kini berlaku untuk latar awal dan suasana umum. Hormati periode, tempat, teknologi, dan kebiasaan yang sudah muncul di cerita. Kalau waktu berlalu, tunjukkan perubahan secara wajar seiring fase hidup karakter. Gunakan tren yang masuk akal bagi lingkungannya. Kalau ragu tentang meme, kabar, harga, atau fitur terbaru, pakai rujukan umum tanpa mengklaimnya sedang viral atau menyebut fakta yang belum pasti. Untuk epilog, ambil detail dari perjalanan yang sudah diceritakan.
12. DILEMA LAHIR DARI ADEGAN: Perlihatkan tindakan yang dipilih pemain, lalu reaksi atau akibat konkretnya. Biarkan hal itu membuka keputusan berikutnya. Kalau waktu atau tempat berpindah, beri penanda singkat di prosa. Perubahan besar seperti menerima tawaran atau bikin janji baru tetap jadi pilihan pemain.
13. TOKOH PUNYA URUSAN SENDIRI: Kenalkan tokoh lewat kerjaan, cara bicara, atau kebiasaan yang khas. Ada tokoh yang cukup muncul sekali, ngobrol, lalu lanjut dengan hidupnya sendiri. Saat masih relevan, munculkan lagi janji, nama, detail kecil, atau celetukan dari giliran sebelumnya sebagai callback. Tokoh lain boleh punya batasan, keberatan, dan alasan sendiri untuk membantu.
14. PERTANYAAN DAN PILIHAN NYAMBUNG: Tulis satu pertanyaan dari situasi konkret di akhir adegan. Beri empat tindakan berbeda yang semuanya menjawabnya, sesuai waktu, sumber daya, dan informasi karakter. Kenalkan detail yang dibutuhkan sebelum pemain memilih. Beri tiap opsi keuntungan, biaya, risiko, atau kesempatan yang berbeda supaya pilihan bergantung pada prioritas pemain dan nggak ada satu jawaban yang jelas terbaik. Isi effects tiap opsi dengan perkiraan perubahan ANGKA untuk Kesehatan, Keuangan, Karier, Relasi, Kebahagiaan, dan Chemistry per tokoh yang relevan. Misalnya health -5 dan relationships +3, yang akan ditampilkan sebagai "Kesehatan -5, Relasi +3". Perkiraan opsi belum mengubah skor saat ini. Kalau pemain menulis jawaban di luar A–D, jadikan jawaban itu tindakan berikutnya dan tunjukkan apa yang terjadi.
15. RELASI DAN CHEMISTRY: Relasi mengukur hubungan sosial secara umum. Chemistry mengukur ketertarikan romantis dengan tiap tokoh lawan jenis. Untuk pemain non-biner, ikuti ketertarikan yang sudah muncul di cerita. Isi statDeltas.chemistry hanya saat adegan menunjukkan perubahan ketertarikan dengan tokoh bernama. Berteman atau bersikap ramah saja tidak menambah Chemistry. Pakai nama konsisten. Tokoh baru mulai dari 0, dan skornya tidak otomatis mengubah status pasangan.
16. PILIHAN MANUSIAWI DAN SPONTAN: Variasikan tujuan empat opsi. Sediakan setidaknya satu pilihan spontan, iseng, santai, penasaran, malas, menghindar, atau impulsif yang tetap nyambung dengan adegan. Misalnya nonton pertandingan sampai lupa waktu, mampir karena penasaran, rebahan, nyeletuk receh, atau menunda urusan, jika situasinya memungkinkan. Pilihan bisa sekadar pengalaman sehari-hari tanpa pelajaran hidup atau manfaat tersembunyi. Jangan ubah semua opsi menjadi strategi karier, networking, latihan skill, menjaga citra, atau memperbaiki diri. Kalau pemain memilih santai atau ngawur, ikuti niatnya tanpa membelokkan hasil menjadi peluang sukses atau ceramah motivasi. Acak nuansa dan urutan pilihan antar giliran, tanpa menetapkan huruf tertentu sebagai pilihan baik atau konyol. Variasikan dampak berdasarkan situasi, termasuk nol dan negatif bila ada sebab nyata, tanpa memaksakan kerugian atau bonus hanya untuk memenuhi variasi.`;

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

function generateStory<T>(ai: GoogleGenAI, prompt: string, schema: Schema, read: (text: string) => T) {
  return callGeminiWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: getStoryInstructions(),
        responseMimeType: 'application/json',
        responseSchema: schema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
    return read(response.text ?? '');
  });
}

function parseStoryJson(text: string): unknown {
  const cleaned = text.trim();
  const fenced = cleaned.match(/^[ \t]*(`{3,}|~{3,})(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\1[ \t]*\r?$/im);
  return JSON.parse(fenced?.[2] ?? cleaned);
}

function generateChapter(ai: GoogleGenAI, prompt: string, current: StoryState, initial = false) {
  return generateStory(ai, prompt, chapterSchema, (text) => {
    const parsed = parseStoryJson(text) as Partial<ChapterResponse>;
    if (typeof parsed?.narrative !== 'string' || !parsed.narrative.trim()) {
      throw new Error('Gemini returned a chapter without a scene');
    }

    const narrative = stripEmDash(normalizeDialogueQuotes(parsed.narrative.trim()));
    const deltas = normalizeChanges(current, initial ? undefined : parsed.statDeltas);
    const after: StoryState = {
      ...current,
      stats: applyDeltas(current.stats, deltas),
      chemistry: updateChemistry(current, deltas.chemistry).scores,
    };
    if (!initial && after.stats.health <= 0) {
      return { ...parsed, narrative, dilemmaQuestion: '', options: [] as StoryOption[] };
    }

    if (typeof parsed.dilemmaQuestion !== 'string' || !parsed.dilemmaQuestion.trim() ||
      !Array.isArray(parsed.options) || parsed.options.length !== 4) {
      throw new Error('Gemini returned an incomplete dilemma');
    }

    const labels = new Set<string>();
    const options: StoryOption[] = parsed.options.map((option, index) => {
      if (typeof option?.label !== 'string' || !option.label.trim() || !option.effects ||
        !(Object.keys(STAT_LABELS) as Array<keyof CharacterStats>)
          .every((stat) => typeof option.effects?.[stat] === 'number' && Number.isFinite(option.effects[stat]))) {
        throw new Error('Gemini returned an incomplete option');
      }
      const label = stripEmDash(option.label.trim());
      const key = label.toLowerCase().replace(/\s+/g, ' ');
      if (labels.has(key)) throw new Error('Gemini returned a duplicate option');
      labels.add(key);
      const effects = normalizeChanges(after, option.effects);
      return { id: `opt_${index + 1}`, label, hint: effectsHint(effects), effects };
    });

    return { ...parsed, narrative, dilemmaQuestion: stripEmDash(parsed.dilemmaQuestion.trim()), options };
  });
}

function generateEnding(ai: GoogleGenAI, prompt: string) {
  return generateStory(ai, prompt, endingSchema, (text) => sanitizeEndingSummary(parseStoryJson(text) as Partial<EndingSummary>));
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
    .map((h, index) => {
      const summary = `Bab ${h.turn} (${h.phase} · ${h.chapterTitle}): Ditanya "${h.question}" -> Memilih "${h.chosenAnswer}". Dampak: ${h.consequenceNote}`;
      return index >= recent.length - 3 && h.narrative ? `${summary}\nAdegan: ${h.narrative}` : summary;
    })
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
    const body = req.body as { name?: string; gender?: GenderOption; familyClass?: FamilyClassChoice };
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const gender: GenderOption =
      body?.gender === 'Perempuan' || body?.gender === 'Non-biner' ? body.gender : 'Laki-laki';
    const familyClasses: FamilyClass[] = ['Lower', 'Middle', 'Upper'];
    const familyClass: FamilyClass = body?.familyClass === 'Random'
      ? familyClasses[randomInt(familyClasses.length)]
      : body?.familyClass === 'Lower' || body?.familyClass === 'Upper' ? body.familyClass : 'Middle';

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
- Latar yang sudah dipilih pemain: ${classContextMap[familyClass]}
- Statistik awal: ${JSON.stringify(initialStats)}
- Momen awal: Baru mulai melangkah ke hidup dewasa (Bab 1)

Konteks semua poin awal:
${pointsContext(initialStats)}

Langsung mulai hari pertama berdasarkan latar yang sudah dipilih di layar setup. Kenalkan situasi awal lewat kejadian atau percakapan, lalu tunjukkan hal yang bikin karakter harus memilih. Tulis pertanyaan dan empat opsi yang semuanya bisa dipahami dari adegan itu.
Set relationshipUpdate ke status "Lajang" (partnerName dan partnerNote kosong).
Kasih statDeltas 0 semua dan consequenceNote soal titik awal karakter.`;

    const parsed = await generateChapter(ai, prompt, { name, gender, stats: initialStats, chemistry: [] }, true);
    const chapter: ChapterResponse = {
      chapterTitle: stripEmDash(parsed.chapterTitle || 'Pagi Baru Dimulai'),
      lifePhase: stripEmDash(parsed.lifePhase || 'Titik Awal'),
      narrative: parsed.narrative,
      dilemmaQuestion: parsed.dilemmaQuestion,
      consequenceNote: stripEmDash(
        parsed.consequenceNote || 'Perjalanan hidupmu resmi dimulai dari sini.',
      ),
      statDeltas: { health: 0, finance: 0, career: 0, relationships: 0, happiness: 0 },
      newTrait: parsed.newTrait?.trim() ? stripEmDash(parsed.newTrait.trim()) : undefined,
      options: parsed.options,
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
      chemistry: [],
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
    const answer = typeof req.body?.selectedAnswer === 'string' ? req.body.selectedAnswer.trim() : '';
    if (!active || active.currentChapter.isEnding || !answer) {
      res.status(400).json({ error: 'Data karakter dan pilihanmu belum lengkap nih.' });
      return;
    }
    const { character, currentChapter } = active;
    const choiceIndex = answer.length === 1 ? 'ABCD'.indexOf(answer.toUpperCase()) : -1;
    const selectedAnswer = currentChapter.options[choiceIndex]?.label ?? answer;
    const chosenOption = currentChapter.options.find((option) => option.label === selectedAnswer);
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
    const historyText = summarizeHistory(active.timeline);

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
- Chemistry per tokoh (skor 0–100): ${JSON.stringify(character.chemistry ?? [])}
- Sifat yang udah kebentuk: ${character.traits.length > 0 ? character.traits.join(', ') : 'Belum menonjol'}
- Statistik sebelum pilihan ini: Kesehatan=${currentStats.health}, Keuangan=${currentStats.finance}, Karier=${currentStats.career}, Relasi=${currentStats.relationships}, Kebahagiaan=${currentStats.happiness}

Konteks semua poin sebelum pilihan:
${pointsContext(currentStats, character.chemistry)}

Riwayat Perjalanan:
${historyText}

Adegan sebelum pilihan terbaru:
${currentChapter.narrative}

Pilihan Terbaru yang Diambil:
"${selectedAnswer}"

Pertanyaan yang dijawab pemain:
${currentChapter.dilemmaQuestion}

Perkiraan poin dari opsi yang dipilih:
${chosenOption?.effects ? JSON.stringify(chosenOption.effects) : 'Jawaban bebas atau opsi lama yang belum memiliki perkiraan angka.'}

Instruksi Bab ${turn}:
- Lanjutkan dari akhir adegan terakhir dan ikuti maksud jawaban pemain, termasuk jawaban bebas. Kalau jawabannya singkat seperti "ya", tafsirkan dari pertanyaan terakhir dan percakapannya. Kalau tindakan belum bisa dilakukan, tunjukkan hambatannya di adegan.
- Tunjukkan dampak lewat tindakan, ucapan, dan respons tokoh. Kalau waktu atau tempat berganti, beri transisi yang memperjelas kaitannya dengan pilihan tadi.
- Pertahankan status "${currentRelationship.status}" kalau pilihan dan interaksi tokoh belum mendukung perubahan. Tokoh baru boleh jadi bagian cerita tanpa jadi gebetan.
- Tunjukin efek pilihan lewat statDeltas dengan skala ${STAT_DELTA_RANGE}. Lembur rutin tetap pakai skala normal. Untuk perubahan besar, sebut kejadian yang sudah terjadi dalam adegan dan beri alasan pada aspek terkait.
- Jika ada perkiraan poin untuk opsi terpilih, pakai sebagai acuan dampak langsung. Penyimpangan harus punya sebab konkret di adegan. Hitung semua skor setelah perubahan, lalu buat effects empat opsi berikutnya berdasarkan skor akhir tersebut.
- Sesuaikan sapaan dialog dengan lawan bicara. Variasikan niat opsi berikutnya, termasuk pilihan spontan atau tidak produktif yang nyambung. Ikuti pilihan pemain tanpa selalu mengubahnya menjadi kemajuan karier atau pengembangan diri. Beri dampak nol, negatif, positif, atau campuran sesuai kejadian nyata.
- Kalau cerita berlanjut, akhiri di titik keputusan yang muncul dari kejadian tadi. Tulis satu pertanyaan dan empat tanggapan yang semuanya sesuai titik itu. Opsi romansa muncul jika wajar di situasi tersebut. Kalau kesehatan mencapai nol, tuntaskan adegan terakhir dan kosongkan pertanyaan serta opsi.`;

    const parsed = await generateChapter(ai, prompt, { ...character, stats: currentStats });
    const chemistry = updateChemistry(character, parsed.statDeltas?.chemistry);
    const deltas = normalizeChanges({ ...character, stats: currentStats }, parsed.statDeltas);

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
      chemistry: chemistry.scores,
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
Pertanyaan yang dijawab: ${currentChapter.dilemmaQuestion}
Status Hubungan: ${finalRelSummary}
Chemistry per tokoh: ${JSON.stringify(updatedCharacter.chemistry)}
Statistik akhir: Kesehatan=0, Keuangan=${nextStats.finance}, Karier=${nextStats.career}, Relasi=${nextStats.relationships}, Kebahagiaan=${nextStats.happiness}
Konteks semua poin akhir:
${pointsContext(nextStats, updatedCharacter.chemistry)}
Sifat yang kebentuk: ${updatedTraits.join(', ') || 'Apa adanya'}

Riwayat Perjalanan:
${historyText}

Adegan sebelum pilihan terakhir:
${currentChapter.narrative}

Akibat pilihan dan adegan terakhir:
${parsed.narrative}

Sambung dari adegan terakhir dan tutup perjalanan ${character.name}. Tunjukkan dampak keputusan terakhir dan kaitkan dengan momen penting yang memang sudah terjadi. Pertahankan hubungan yang sudah terbentuk. Cerita berhenti di sini tanpa pilihan baru.`;

      endingSummary = await generateEnding(ai, endingPrompt);
    }

    const chapter: ChapterResponse = {
      chapterTitle: stripEmDash(parsed.chapterTitle || `Bab ${turn}`),
      lifePhase: stripEmDash(nextPhase),
      narrative: parsed.narrative,
      dilemmaQuestion: parsed.dilemmaQuestion,
      consequenceNote: stripEmDash(
        parsed.consequenceNote || 'Pilihan kemarin ngubah arah hidupmu hari ini.',
      ),
      statDeltas: deltas,
      newTrait: newTrait ? stripEmDash(newTrait) : undefined,
      relationshipUpdate: nextRelationship,
      options: parsed.options,
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
Chemistry per tokoh: ${JSON.stringify(character.chemistry ?? [])}
Statistik saat ini: Kesehatan=${stats.health}, Keuangan=${stats.finance}, Karier=${stats.career}, Relasi=${stats.relationships}, Kebahagiaan=${stats.happiness}
Konteks semua poin:
${pointsContext(stats, character.chemistry)}
Sifat yang kebentuk: ${character.traits.join(', ') || 'Apa adanya'}

Riwayat Perjalanan:
${historyText}

Adegan terakhir:
${currentChapter.narrative}

Keputusan yang masih terbuka saat cerita ditutup:
${currentChapter.dilemmaQuestion}

Sambung dari adegan terakhir dan tulis penutup yang sesuai kondisi, pilihan, dan hubungan ${character.name}. Kalau masih ada keputusan terbuka, biarkan terbuka. Tindakan menutup permainan tidak berarti karakter meninggal. Tutup tanpa pertanyaan atau pilihan baru.`;

    const endingSummary = await generateEnding(ai, prompt);

    const chapter: ChapterResponse = {
      chapterTitle: 'Garis Akhir Cerita',
      lifePhase: 'Nasib Akhir',
      narrative: currentChapter.narrative,
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
      server: { middlewareMode: true, allowedHosts: true },
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
