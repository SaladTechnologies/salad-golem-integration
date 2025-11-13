import { GolemNetwork } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import config from "config";

// Initialize Golem Network client
export const glm = new GolemNetwork({
	logger: pinoPrettyLogger({ level: "debug" }),
	api: {
		key: config.get<string>("apiKey")
	},
	payment: {
		network: config.get<string>("paymentNetwork")
	}
});

// Create AbortController for cancellation
export const shutdown = new AbortController();
