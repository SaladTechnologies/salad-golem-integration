import { GolemNetwork } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import config from "config";

// Initialize Golem Network client
export const glm = createGolemClient();

// Create AbortController for cancellation
export const shutdown = new AbortController();

export function createGolemClient<GolemNetwork>() {
  return new GolemNetwork({
    logger: pinoPrettyLogger({ level: "info" }),
    api: {
      url: config.get<string>("apiUrl"),
      key: config.get<string>("apiKey")
    },
    payment: {
      network: config.get<string>("paymentNetwork")
    }
  })
}
