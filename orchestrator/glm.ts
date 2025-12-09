import { GolemNetwork } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import config from "config";

// Create AbortController for cancellation
export const shutdown = new AbortController();

export function createGolemClient<GolemNetwork>(apiUrl: string, apiKey: string) {
  return new GolemNetwork({
    logger: pinoPrettyLogger({ level: "info" }),
    api: {
      url: apiUrl,
      key: apiKey
    },
    payment: {
      network: config.get<string>("paymentNetwork")
    }
  })
}
