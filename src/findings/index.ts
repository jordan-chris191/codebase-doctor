export { runFindings } from "./engine.js";
export { buildHotspots } from "./hotspots.js";
export type { FindingsContext, FindingsResult } from "./types.js";
export {
  COMPLEXITY_THRESHOLD,
  CHURN_THRESHOLD,
  FAN_OUT_THRESHOLD,
  FAN_IN_THRESHOLD,
  LARGE_FILE_LINES,
} from "./rules.js";
