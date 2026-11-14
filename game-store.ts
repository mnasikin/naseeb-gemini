import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type {
  ActiveSession, ArchivedLife, ChapterResponse, CharacterState, GameData, GameUpdate, TimelineEntry,
} from './src/types/simulation.ts';

export function transaction<T>(db: DatabaseSync, work: () => T, readOnly = false): T {
  db.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function unpack<T>(value: SQLOutputValue): T {
  return JSON.parse(value as string) as T;
}

export function createGameStore(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_games (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      turn INTEGER NOT NULL,
      saved_at TEXT NOT NULL,
      name TEXT NOT NULL,
      gender TEXT NOT NULL,
      family_class TEXT NOT NULL,
      phase TEXT NOT NULL,
      health REAL NOT NULL,
      finance REAL NOT NULL,
      career REAL NOT NULL,
      relationships REAL NOT NULL,
      happiness REAL NOT NULL,
      traits TEXT NOT NULL,
      relationship TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      life_phase TEXT NOT NULL,
      narrative TEXT NOT NULL,
      dilemma_question TEXT NOT NULL,
      consequence_note TEXT NOT NULL,
      stat_deltas TEXT NOT NULL,
      new_trait TEXT,
      relationship_update TEXT NOT NULL,
      options TEXT NOT NULL,
      is_ending INTEGER NOT NULL,
      ending_summary TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS game_timeline (
      user_id TEXT NOT NULL REFERENCES active_games(user_id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      turn INTEGER NOT NULL,
      phase TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      narrative TEXT NOT NULL,
      question TEXT NOT NULL,
      chosen_answer TEXT NOT NULL,
      consequence_note TEXT NOT NULL,
      stat_deltas TEXT NOT NULL,
      stats_after TEXT NOT NULL,
      PRIMARY KEY (user_id, position)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS game_archives (
      user_id TEXT NOT NULL REFERENCES users(id),
      id TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      character TEXT NOT NULL,
      ending_summary TEXT NOT NULL,
      timeline TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    ) STRICT;
  `);

  const revision = db.prepare('SELECT game_revision FROM users WHERE id = ?');
  const advance = db.prepare('UPDATE users SET game_revision = game_revision + 1 WHERE id = ? AND game_revision = ?');
  const active = db.prepare('SELECT * FROM active_games WHERE user_id = ?');
  const timeline = db.prepare('SELECT * FROM game_timeline WHERE user_id = ? ORDER BY position');
  const archives = db.prepare('SELECT * FROM game_archives WHERE user_id = ? ORDER BY completed_at DESC, id DESC');
  const writeActive = db.prepare(`
    INSERT INTO active_games (
      user_id, turn, saved_at, name, gender, family_class, phase, health, finance, career, relationships, happiness,
      traits, relationship, chapter_title, life_phase, narrative, dilemma_question, consequence_note, stat_deltas,
      new_trait, relationship_update, options, is_ending, ending_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET
      turn = excluded.turn, saved_at = excluded.saved_at, name = excluded.name, gender = excluded.gender,
      family_class = excluded.family_class, phase = excluded.phase, health = excluded.health, finance = excluded.finance,
      career = excluded.career, relationships = excluded.relationships, happiness = excluded.happiness,
      traits = excluded.traits, relationship = excluded.relationship, chapter_title = excluded.chapter_title,
      life_phase = excluded.life_phase, narrative = excluded.narrative, dilemma_question = excluded.dilemma_question,
      consequence_note = excluded.consequence_note, stat_deltas = excluded.stat_deltas, new_trait = excluded.new_trait,
      relationship_update = excluded.relationship_update, options = excluded.options, is_ending = excluded.is_ending,
      ending_summary = excluded.ending_summary
  `);
  const appendTimeline = db.prepare(`
    INSERT INTO game_timeline (
      user_id, position, turn, phase, chapter_title, narrative, question, chosen_answer, consequence_note, stat_deltas, stats_after
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertArchive = db.prepare(`
    INSERT INTO game_archives (user_id, id, completed_at, character, ending_summary, timeline)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, id) DO NOTHING
  `);
  const deleteActive = db.prepare('DELETE FROM active_games WHERE user_id = ?');
  const deleteArchive = db.prepare('DELETE FROM game_archives WHERE user_id = ? AND id = ?');

  function saveActive(userId: string, session: ActiveSession) {
    const { character, currentChapter: chapter, turn, savedAt } = session;
    const { health, finance, career, relationships, happiness } = character.stats;
    writeActive.run(
      userId, turn, savedAt, character.name, character.gender, character.familyClass ?? 'Middle', character.phase,
      health, finance, career, relationships, happiness, JSON.stringify(character.traits),
      JSON.stringify(character.relationship ?? null), chapter.chapterTitle, chapter.lifePhase, chapter.narrative,
      chapter.dilemmaQuestion, chapter.consequenceNote, JSON.stringify(chapter.statDeltas), chapter.newTrait ?? null,
      JSON.stringify(chapter.relationshipUpdate ?? null), JSON.stringify(chapter.options), Number(chapter.isEnding),
      JSON.stringify(chapter.endingSummary ?? null),
    );
  }

  function saveTimelineEntry(userId: string, entry: TimelineEntry, position: number) {
    appendTimeline.run(
      userId, position, entry.turn, entry.phase, entry.chapterTitle, entry.narrative, entry.question, entry.chosenAnswer,
      entry.consequenceNote, JSON.stringify(entry.statDeltas), JSON.stringify(entry.statsAfter),
    );
  }

  function saveArchive(userId: string, archive: ArchivedLife) {
    insertArchive.run(
      userId, archive.id, archive.completedAt, JSON.stringify(archive.character), JSON.stringify(archive.endingSummary),
      JSON.stringify(archive.timeline),
    );
  }

  function loadActive(userId: string): ActiveSession | null {
    const row = active.get(userId);
    if (!row) return null;
    const character: CharacterState = {
      name: row.name as string,
      gender: row.gender as CharacterState['gender'],
      familyClass: row.family_class as CharacterState['familyClass'],
      phase: row.phase as string,
      stats: {
        health: row.health as number, finance: row.finance as number, career: row.career as number,
        relationships: row.relationships as number, happiness: row.happiness as number,
      },
      traits: unpack(row.traits),
      relationship: unpack<CharacterState['relationship']>(row.relationship) ?? undefined,
    };
    const currentChapter: ChapterResponse = {
      chapterTitle: row.chapter_title as string,
      lifePhase: row.life_phase as string,
      narrative: row.narrative as string,
      dilemmaQuestion: row.dilemma_question as string,
      consequenceNote: row.consequence_note as string,
      statDeltas: unpack(row.stat_deltas),
      newTrait: (row.new_trait as string | null) ?? undefined,
      relationshipUpdate: unpack<ChapterResponse['relationshipUpdate']>(row.relationship_update) ?? undefined,
      options: unpack(row.options),
      isEnding: Boolean(row.is_ending),
      endingSummary: unpack<ChapterResponse['endingSummary']>(row.ending_summary) ?? undefined,
    };
    return {
      character,
      currentChapter,
      turn: row.turn as number,
      savedAt: row.saved_at as string,
      timeline: timeline.all(userId).map((entry) => ({
        turn: entry.turn as number,
        phase: entry.phase as string,
        chapterTitle: entry.chapter_title as string,
        narrative: entry.narrative as string,
        question: entry.question as string,
        chosenAnswer: entry.chosen_answer as string,
        consequenceNote: entry.consequence_note as string,
        statDeltas: unpack(entry.stat_deltas),
        statsAfter: unpack(entry.stats_after),
      })),
    };
  }

  return {
    revision(userId: string): number {
      return revision.get(userId)!.game_revision as number;
    },
    get(userId: string): GameData {
      return transaction(db, () => ({
        revision: revision.get(userId)!.game_revision as number,
        activeSession: loadActive(userId),
        archives: archives.all(userId).map((row) => ({
          id: row.id as string,
          completedAt: row.completed_at as string,
          character: unpack(row.character),
          endingSummary: unpack(row.ending_summary),
          timeline: unpack(row.timeline),
        })),
      }), true);
    },
    loadActive,
    importLegacy(userId: string, progress: ActiveSession | null, savedArchives: ArchivedLife[]) {
      if (progress) {
        saveActive(userId, progress);
        progress.timeline.forEach((entry, position) => saveTimelineEntry(userId, entry, position));
      }
      for (const archive of savedArchives) saveArchive(userId, archive);
    },
    commit(userId: string, expectedRevision: number, state: ActiveSession | null, entry?: TimelineEntry): GameUpdate | null {
      return transaction(db, () => {
        if (!advance.run(userId, expectedRevision).changes) return null;
        const update: GameUpdate = { revision: expectedRevision + 1, activeSession: state };
        if (!state) {
          deleteActive.run(userId);
          return update;
        }
        saveActive(userId, state);
        if (entry) saveTimelineEntry(userId, entry, state.timeline.length - 1);
        if (state.currentChapter.isEnding && state.currentChapter.endingSummary) {
          update.archivedLife = {
            id: randomUUID(),
            completedAt: state.savedAt,
            character: state.character,
            endingSummary: state.currentChapter.endingSummary,
            timeline: state.timeline,
          };
          saveArchive(userId, update.archivedLife);
        }
        return update;
      });
    },
    deleteArchive(userId: string, archiveId: string) {
      deleteArchive.run(userId, archiveId);
    },
  };
}
