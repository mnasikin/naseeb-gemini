import type { ActiveSession, ArchivedLife } from './src/types/simulation.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasStrings(value: Record<string, unknown>, fields: string[]) {
  return fields.every((field) => typeof value[field] === 'string');
}

function isStats(value: unknown) {
  return isRecord(value) && ['health', 'finance', 'career', 'relationships', 'happiness']
    .every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]));
}

function isCharacter(value: unknown) {
  return isRecord(value) && hasStrings(value, ['name', 'gender', 'phase']) &&
    (value.familyClass === undefined || typeof value.familyClass === 'string') &&
    isStats(value.stats) && Array.isArray(value.traits) && value.traits.every((trait) => typeof trait === 'string');
}

function isTimeline(value: unknown) {
  return Array.isArray(value) && value.every((entry) =>
    isRecord(entry) && Number.isSafeInteger(entry.turn) &&
    hasStrings(entry, ['phase', 'chapterTitle', 'narrative', 'question', 'chosenAnswer', 'consequenceNote']) &&
    isStats(entry.statDeltas) && isStats(entry.statsAfter),
  );
}

function isEnding(value: unknown) {
  return isRecord(value) && hasStrings(value, ['archetypeTitle', 'fateHeadline', 'epilogue', 'lifeQuote']) &&
    Array.isArray(value.keyTurningPoints) && value.keyTurningPoints.every((point) => typeof point === 'string');
}

function isChapter(value: unknown) {
  return isRecord(value) && hasStrings(value, ['chapterTitle', 'lifePhase', 'narrative', 'dilemmaQuestion', 'consequenceNote']) &&
    isStats(value.statDeltas) && typeof value.isEnding === 'boolean' &&
    (value.newTrait === undefined || typeof value.newTrait === 'string') &&
    (value.endingSummary === undefined || isEnding(value.endingSummary)) &&
    Array.isArray(value.options) && value.options.every((option) => isRecord(option) && hasStrings(option, ['id', 'label', 'hint']));
}

export function readLegacyGame(value: unknown): { activeSession: ActiveSession | null; archives: ArchivedLife[] } | null {
  if (value === undefined) return { activeSession: null, archives: [] };
  if (!isRecord(value) || !Array.isArray(value.archives)) return null;

  const { activeSession, archives } = value;
  if (activeSession !== null && (
    !isRecord(activeSession) || !isCharacter(activeSession.character) || !isChapter(activeSession.currentChapter) ||
    !Number.isSafeInteger(activeSession.turn) || !isTimeline(activeSession.timeline) ||
    typeof activeSession.savedAt !== 'string'
  )) return null;
  if (!archives.every((item) =>
    isRecord(item) && hasStrings(item, ['id', 'completedAt']) &&
    isCharacter(item.character) && isEnding(item.endingSummary) && isTimeline(item.timeline),
  )) return null;

  return { activeSession: activeSession as ActiveSession | null, archives };
}
