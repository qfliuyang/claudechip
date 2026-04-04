import type { ModelName } from './model.js'
import type { APIProvider } from './providers.js'

export type ModelConfig = Record<APIProvider, ModelName>

// Get model names from environment variables, fallback to glm-5.1
function getOpusModel(): string {
  return process.env.CLAUDECHIP_OPUS_MODEL ?? 'glm-5.1'
}

function getSonnetModel(): string {
  return process.env.CLAUDECHIP_SONNET_MODEL ?? 'glm-5.1'
}

function getHaikuModel(): string {
  return process.env.CLAUDECHIP_HAIKU_MODEL ?? 'glm-5.1'
}

// All configs use env vars - no hardcoded model names
export const CLAUDECHIP_3_7_SONNET_CONFIG = {
  firstParty: getSonnetModel(),
  bedrock: getSonnetModel(),
  vertex: getSonnetModel(),
  foundry: getSonnetModel(),
} as const satisfies ModelConfig

export const CLAUDECHIP_3_5_V2_SONNET_CONFIG = {
  firstParty: getSonnetModel(),
  bedrock: getSonnetModel(),
  vertex: getSonnetModel(),
  foundry: getSonnetModel(),
} as const satisfies ModelConfig

export const CLAUDECHIP_3_5_HAIKU_CONFIG = {
  firstParty: getHaikuModel(),
  bedrock: getHaikuModel(),
  vertex: getHaikuModel(),
  foundry: getHaikuModel(),
} as const satisfies ModelConfig

export const CLAUDECHIP_HAIKU_4_5_CONFIG = {
  firstParty: getHaikuModel(),
  bedrock: getHaikuModel(),
  vertex: getHaikuModel(),
  foundry: getHaikuModel(),
} as const satisfies ModelConfig

export const CLAUDECHIP_SONNET_4_CONFIG = {
  firstParty: getSonnetModel(),
  bedrock: getSonnetModel(),
  vertex: getSonnetModel(),
  foundry: getSonnetModel(),
} as const satisfies ModelConfig

export const CLAUDECHIP_SONNET_4_5_CONFIG = {
  firstParty: getSonnetModel(),
  bedrock: getSonnetModel(),
  vertex: getSonnetModel(),
  foundry: getSonnetModel(),
} as const satisfies ModelConfig

export const CLAUDECHIP_OPUS_4_CONFIG = {
  firstParty: getOpusModel(),
  bedrock: getOpusModel(),
  vertex: getOpusModel(),
  foundry: getOpusModel(),
} as const satisfies ModelConfig

export const CLAUDECHIP_OPUS_4_1_CONFIG = {
  firstParty: getOpusModel(),
  bedrock: getOpusModel(),
  vertex: getOpusModel(),
  foundry: getOpusModel(),
} as const satisfies ModelConfig

export const CLAUDECHIP_OPUS_4_5_CONFIG = {
  firstParty: getOpusModel(),
  bedrock: getOpusModel(),
  vertex: getOpusModel(),
  foundry: getOpusModel(),
} as const satisfies ModelConfig

export const CLAUDECHIP_OPUS_4_6_CONFIG = {
  firstParty: getOpusModel(),
  bedrock: getOpusModel(),
  vertex: getOpusModel(),
  foundry: getOpusModel(),
} as const satisfies ModelConfig

export const CLAUDECHIP_SONNET_4_6_CONFIG = {
  firstParty: getSonnetModel(),
  bedrock: getSonnetModel(),
  vertex: getSonnetModel(),
  foundry: getSonnetModel(),
} as const satisfies ModelConfig

// @[MODEL LAUNCH]: Register the new config here.
export const ALL_MODEL_CONFIGS = {
  haiku35: CLAUDECHIP_3_5_HAIKU_CONFIG,
  haiku45: CLAUDECHIP_HAIKU_4_5_CONFIG,
  sonnet35: CLAUDECHIP_3_5_V2_SONNET_CONFIG,
  sonnet37: CLAUDECHIP_3_7_SONNET_CONFIG,
  sonnet40: CLAUDECHIP_SONNET_4_CONFIG,
  sonnet45: CLAUDECHIP_SONNET_4_5_CONFIG,
  sonnet46: CLAUDECHIP_SONNET_4_6_CONFIG,
  opus40: CLAUDECHIP_OPUS_4_CONFIG,
  opus41: CLAUDECHIP_OPUS_4_1_CONFIG,
  opus45: CLAUDECHIP_OPUS_4_5_CONFIG,
  opus46: CLAUDECHIP_OPUS_4_6_CONFIG,
} as const satisfies Record<string, ModelConfig>

export type ModelKey = keyof typeof ALL_MODEL_CONFIGS

/** Union of all canonical first-party model IDs from env vars */
export type CanonicalModelId =
  (typeof ALL_MODEL_CONFIGS)[ModelKey]['firstParty']

/** Runtime list of canonical model IDs — used by comprehensiveness tests. */
export const CANONICAL_MODEL_IDS = Object.values(ALL_MODEL_CONFIGS).map(
  c => c.firstParty,
) as [CanonicalModelId, ...CanonicalModelId[]]

/** Map canonical ID → internal short key. Used to apply settings-based modelOverrides. */
export const CANONICAL_ID_TO_KEY: Record<CanonicalModelId, ModelKey> =
  Object.fromEntries(
    (Object.entries(ALL_MODEL_CONFIGS) as [ModelKey, ModelConfig][]).map(
      ([key, cfg]) => [cfg.firstParty, key],
    ),
  ) as Record<CanonicalModelId, ModelKey>
