import { isEnvTruthy } from '../utils/envUtils.js';

/**
 * V2 is default-on; set CLAUDECHIP_TWO_PANE_V2=0/false/off to opt out.
 */
export function isTwoPaneRuntimeV2Enabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.CLAUDECHIP_TWO_PANE_V2;
  if (raw === undefined) return true;
  return isEnvTruthy(raw);
}
