import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual,
} from 'node:crypto';
import { closeSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createGameStore, transaction } from './game-store.ts';
import type { ActiveSession, ArchivedLife } from './src/types/simulation.ts';

const LOGIN_WINDOW = 15 * 60_000;
export const SESSION_DURATION = 30 * 24 * 60 * 60_000;
const DUMMY_SALT = Buffer.alloc(16);
const DUMMY_HASH = Buffer.alloc(32);

type LegacyGame = { activeSession: ActiveSession | null; archives: ArchivedLife[] };

function loadEncryptionKey(directory: string): Buffer {
  const configuredKey = process.env.BYOK_ENCRYPTION_KEY;
  if (configuredKey) {
    if (!/^[a-f\d]{64}$/i.test(configuredKey)) {
      throw new Error('BYOK_ENCRYPTION_KEY harus berisi 64 karakter heksadesimal.');
    }
    return Buffer.from(configuredKey, 'hex');
  }

  const keyPath = path.join(directory, 'gemini.key');
  try {
    return readFileSync(keyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const temporaryPath = path.join(directory, `gemini-${randomBytes(16).toString('hex')}.key`);
  writeFileSync(temporaryPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
  try {
    // Publish the complete key atomically when multiple processes start together.
    linkSync(temporaryPath, keyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  } finally {
    unlinkSync(temporaryPath);
  }
  return readFileSync(keyPath);
}

export function openAccountStore(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const encryptionKey = loadEncryptionKey(directory);
  if (encryptionKey.length !== 32) throw new Error('Kunci enkripsi BYOK harus berukuran 32 byte.');

  const databasePath = path.join(directory, '.gemini.sqlite3');
  closeSync(openSync(databasePath, 'a', 0o600));
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS gemini_keys (
      browser_id TEXT PRIMARY KEY,
      encrypted_key TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username_lookup TEXT NOT NULL UNIQUE,
      encrypted_username TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      encrypted_gemini_key TEXT,
      game_revision INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS login_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS login_sessions_expiry ON login_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS login_attempts (
      scope TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS login_attempts_expiry ON login_attempts(expires_at);
  `);
  const game = createGameStore(db);
  const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
  const secretDigest = (purpose: string, value: string) => createHmac('sha256', encryptionKey)
    .update(purpose + '\0').update(value).digest();
  const usernameLookup = (username: string) => secretDigest('username', username.normalize('NFKC').toLowerCase()).toString('hex');

  function encrypt(value: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
  }

  function decrypt(value: string, context: string): string {
    const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  function hashPin(pin: string, salt: Buffer) {
    return new Promise<Buffer>((resolve, reject) => {
      scrypt(secretDigest('pin', pin), salt, 32, { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, hash) => {
        if (error) reject(error);
        else resolve(hash);
      });
    });
  }

  const findLegacy = db.prepare('SELECT encrypted_key FROM gemini_keys WHERE browser_id = ?');
  const deleteLegacy = db.prepare('DELETE FROM gemini_keys WHERE browser_id = ?');
  const createUser = db.prepare(`
    INSERT INTO users (id, username_lookup, encrypted_username, pin_salt, pin_hash, encrypted_gemini_key)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (username_lookup) DO NOTHING
  `);
  const findLogin = db.prepare('SELECT id, pin_salt, pin_hash FROM users WHERE username_lookup = ?');
  const findUser = db.prepare('SELECT encrypted_username, encrypted_gemini_key FROM users WHERE id = ?');
  const updateGeminiKey = db.prepare('UPDATE users SET encrypted_gemini_key = ? WHERE id = ?');
  const addSession = db.prepare('INSERT INTO login_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
  const findSession = db.prepare('SELECT user_id FROM login_sessions WHERE token_hash = ? AND expires_at > ?');
  const deleteSession = db.prepare('DELETE FROM login_sessions WHERE token_hash = ?');
  const expireSessions = db.prepare('DELETE FROM login_sessions WHERE expires_at <= ?');
  const deleteAttempt = db.prepare('DELETE FROM login_attempts WHERE scope = ?');
  const expireAttempts = db.prepare('DELETE FROM login_attempts WHERE expires_at <= ?');
  const attempt = db.prepare(`
    INSERT INTO login_attempts (scope, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT (scope) DO UPDATE SET attempts = attempts + 1 WHERE attempts < ?
  `);

  function startSession(userId: string, previousToken?: string) {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    expireSessions.run(now);
    if (previousToken) deleteSession.run(tokenHash(previousToken));
    addSession.run(tokenHash(token), userId, now + SESSION_DURATION);
    return token;
  }

  const reserveAttempt = (scope: string, max: number, now: number) =>
    Boolean(attempt.run(scope, now + LOGIN_WINDOW, max).changes);

  return {
    game,
    userId(token: string | undefined): string | undefined {
      return token ? findSession.get(tokenHash(token), Date.now())?.user_id as string | undefined : undefined;
    },
    async register(username: string, pin: string, ip: string, legacyToken: string | undefined, legacy: LegacyGame, previousToken?: string) {
      const now = Date.now();
      expireAttempts.run(now);
      if (!reserveAttempt('register:' + secretDigest('ip', ip).toString('hex'), 15, now)) return { status: 'limited' as const };
      const lookup = usernameLookup(username);
      if (findLogin.get(lookup)) return { status: 'duplicate' as const };
      const userId = randomUUID();
      const salt = randomBytes(16);
      const hash = await hashPin(pin, salt);
      return transaction(db, () => {
        const legacyId = legacyToken && tokenHash(legacyToken);
        const previousKey = legacyId ? findLegacy.get(legacyId)?.encrypted_key as string | undefined : undefined;
        const encryptedKey = previousKey && legacyId
          ? encrypt(decrypt(previousKey, legacyId), 'gemini:' + userId)
          : null;
        const result = createUser.run(
          userId, lookup, encrypt(username, 'username:' + userId),
          salt.toString('hex'), hash.toString('hex'), encryptedKey,
        );
        if (!result.changes) return { status: 'duplicate' as const };
        game.importLegacy(userId, legacy.activeSession, legacy.archives);
        if (legacyId) deleteLegacy.run(legacyId);
        return { status: 'ok' as const, token: startSession(userId, previousToken) };
      });
    },
    async login(username: string, pin: string, ip: string, previousToken?: string) {
      const lookup = usernameLookup(username);
      const scope = 'user:' + lookup;
      const now = Date.now();
      const allowed = transaction(db, () => {
        expireAttempts.run(now);
        return reserveAttempt('login:' + secretDigest('ip', ip).toString('hex'), 60, now) && reserveAttempt(scope, 5, now);
      });
      if (!allowed) return { status: 'limited' as const };
      const row = findLogin.get(lookup);
      const salt = row ? Buffer.from(row.pin_salt as string, 'hex') : DUMMY_SALT;
      const expected = row ? Buffer.from(row.pin_hash as string, 'hex') : DUMMY_HASH;
      const hash = await hashPin(pin, salt);
      if (!timingSafeEqual(hash, expected) || !row) return { status: 'invalid' as const };
      return transaction(db, () => {
        deleteAttempt.run(scope);
        return { status: 'ok' as const, token: startSession(row.id as string, previousToken) };
      });
    },
    logout(token: string | undefined) {
      if (token) deleteSession.run(tokenHash(token));
    },
    account(userId: string) {
      const row = findUser.get(userId)!;
      return {
        id: userId,
        username: decrypt(row.encrypted_username as string, 'username:' + userId),
        geminiConfigured: row.encrypted_gemini_key !== null,
        game: game.get(userId),
      };
    },
    hasGeminiKey(userId: string) {
      return findUser.get(userId)?.encrypted_gemini_key != null;
    },
    getGeminiKey(userId: string): string | null {
      const key = findUser.get(userId)?.encrypted_gemini_key as string | null | undefined;
      return key ? decrypt(key, 'gemini:' + userId) : null;
    },
    setGeminiKey(userId: string, key: string | null) {
      updateGeminiKey.run(key === null ? null : encrypt(key, 'gemini:' + userId), userId);
    },
  };
}
