// Minimal types derived from D&D Beyond's character service API.
// Shapes are based on reverse-engineered responses — verify against live data and adjust as needed.

export interface DDBAbilityScore {
  id: number; // 1=STR 2=DEX 3=CON 4=INT 5=WIS 6=CHA
  value: number | null;
}

export interface DDBCharacterSummary {
  id: number;
  name: string;
  race: { fullName?: string; baseName?: string } | null;
  classes: Array<{ level: number; definition?: { name?: string } }>;
}

export interface DDBCharacter {
  id: number;
  name: string;
  race: { fullName?: string; baseName?: string; subRaceShortName?: string } | null;
  classes: Array<{
    id: number;
    level: number;
    definition: { name: string };
    subclassDefinition: { name: string } | null;
  }>;
  stats: DDBAbilityScore[];
  bonusStats?: DDBAbilityScore[];
  overrideStats?: DDBAbilityScore[];
  baseHitPoints: number;
  bonusHitPoints: number | null;
  overrideHitPoints: number | null;
  removedHitPoints: number;
  temporaryHitPoints: number;
  inspiration: boolean;
  currentXp: number;
  deathSaves: {
    failCount: number | null;
    successCount: number | null;
    isStabilized: boolean;
  } | null;
  currencies: { cp: number; sp: number; ep: number; gp: number; pp: number } | null;
  inventory: Array<{
    id: number;
    quantity: number;
    equipped: boolean;
    definition: { name: string; type: string; rarity?: string | null };
  }>;
  classSpells: Array<{
    characterClassId: number;
    spells: Array<{
      prepared: boolean;
      alwaysPrepared: boolean;
      definition: { name: string; level: number; school: string };
    }>;
  }>;
  spellSlots: Array<{ level: number; used: number; available: number }>;
  campaign: { id: number; name: string } | null;
  traits: {
    personalityTraits: string | null;
    ideals: string | null;
    bonds: string | null;
    flaws: string | null;
    appearance: string | null;
    backstory: string | null;
  } | null;
}

export interface DDBCampaign {
  id: number;
  name: string;
  description: string | null;
  dmUserId: number;
  dmUsername: string;
  characters?: Array<{
    characterId: number;
    characterName: string;
    userId: number;
    username: string;
  }>;
}
