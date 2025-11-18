import timespan from "timespan-parser";
import config from "config";

export function getAdjustedNow(): number {
  const now = Date.now();

  // Subtract time lag from config
  const timespanParser = timespan({ unit: 'ms' });
  const timeLag = timespanParser.parse(config.get('timeLag'));
  const adjustedNow = now - timeLag;
  return adjustedNow;
}
