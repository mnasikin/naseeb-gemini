export type GenderOption = 'Laki-laki' | 'Perempuan' | 'Non-biner';
export type FamilyClass = 'Lower' | 'Middle' | 'Upper';
export type RelationshipStatus = 'Lajang' | 'PDKT' | 'Pacaran' | 'Menikah' | 'Berpisah';

export interface RelationshipProfile {
  status: RelationshipStatus;
  partnerName?: string;
  partnerNote?: string;
}

export interface CharacterStats {
  health: number;
  finance: number;
  career: number;
  relationships: number;
  happiness: number;
}

export interface ChemistryScore {
  name: string;
  gender: GenderOption;
  points: number;
}

export interface StatChanges extends CharacterStats {
  chemistry?: Array<Omit<ChemistryScore, 'points'> & { delta: number }>;
}

export interface StoryOption {
  id: string;
  label: string;
  hint: string;
}

export interface CharacterState {
  name: string;
  gender: GenderOption;
  familyClass: FamilyClass;
  phase: string;
  stats: CharacterStats;
  traits: string[];
  relationship?: RelationshipProfile;
  chemistry?: ChemistryScore[];
}

export interface TimelineEntry {
  turn: number;
  phase: string;
  chapterTitle: string;
  narrative: string;
  question: string;
  chosenAnswer: string;
  consequenceNote: string;
  statDeltas: StatChanges;
  statsAfter: CharacterStats;
}

export interface EndingSummary {
  archetypeTitle: string;
  fateHeadline: string;
  epilogue: string;
  keyTurningPoints: string[];
  lifeQuote: string;
}

export interface ChapterResponse {
  chapterTitle: string;
  lifePhase: string;
  narrative: string;
  dilemmaQuestion: string;
  consequenceNote: string;
  statDeltas: StatChanges;
  newTrait?: string;
  relationshipUpdate?: RelationshipProfile;
  options: StoryOption[];
  isEnding: boolean;
  endingSummary?: EndingSummary;
}

export interface ArchivedLife {
  id: string;
  completedAt: string;
  character: CharacterState;
  endingSummary: EndingSummary;
  timeline: TimelineEntry[];
}

export interface ActiveSession {
  character: CharacterState;
  currentChapter: ChapterResponse;
  turn: number;
  timeline: TimelineEntry[];
  savedAt: string;
}

export interface SavedGame {
  revision: number;
  activeSession: ActiveSession | null;
}

export interface GameData extends SavedGame {
  archives: ArchivedLife[];
}

export interface GameUpdate extends SavedGame {
  archivedLife?: ArchivedLife;
}

export interface AccountData {
  id: string;
  username: string;
  game: GameData;
  geminiConfigured: boolean;
}

