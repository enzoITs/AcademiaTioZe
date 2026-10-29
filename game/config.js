// Ponto único de acesso ao balanceamento. Todos os números do jogo vêm do JSON.
import rawConfig from '../config/gameConfig.json' with { type: 'json' };

export const CONFIG = rawConfig;

export const BLOCKS = CONFIG.time.blocks;
export const EQUIPMENT = CONFIG.equipment;
export const PROFILES = CONFIG.profiles;
export const PROFILE_IDS = Object.keys(CONFIG.profiles);
export const DEMAND_CATEGORIES = Object.keys(CONFIG.demandCategories);

export function getEquipmentDef(type) {
  const def = EQUIPMENT[type];
  if (!def) throw new Error(`Equipamento desconhecido: ${type}`);
  return def;
}

export function getTierDef(type, tierId) {
  const def = getEquipmentDef(type);
  return def.tiers.find((t) => t.id === tierId) ?? def.tiers[0];
}

/** Categoria de demanda (cardio, peso, funcional) ou null para conforto/decoração. */
export function demandCategoryOf(type) {
  return CONFIG.categories[getEquipmentDef(type).category].demand;
}

// ---------------------------------------------------------------- eras
export const ERAS = CONFIG.eras;
export const MAX_ERA = Math.max(...Object.keys(ERAS).map(Number));

/** Regras de uma era (aluguel, equipe máxima, metas para chegar nela...). */
export function eraDef(era) {
  return ERAS[String(era)] ?? ERAS['1'];
}

/** Perfis que já frequentam a academia nesta era (o Idoso chega na Era 2). */
export function profilesForEra(era) {
  return PROFILE_IDS.filter((p) => (PROFILES[p].minEra ?? 1) <= era);
}
