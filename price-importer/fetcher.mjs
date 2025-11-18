import fetch from 'node-fetch';
import config from 'config';
import { logger } from './logger.mjs';

/**
 * Retrieves the latest GLM/USD price from the CoinMarketCap API
 * @param {string} apiKey - CoinMarketCap API key
 * @returns {Promise<number>} The GLM/USD price
 */
export async function getGlmPrice(apiKey) {
  const url = config.get('apiUrl');
  const params = new URLSearchParams({
    symbol: 'GLM',
    convert: 'USD'
  });

  try {
    const response = await fetch(`${url}?${params}`, {
      headers: {
        'X-CMC_PRO_API_KEY': config.get('apiKey'),
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`CoinMarketCap API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status.error_code !== 0) {
      throw new Error(`CoinMarketCap API error: ${data.status.error_message}`);
    }

    const glmData = data.data.GLM;
    if (!glmData) {
      throw new Error('GLM data not found in response');
    }

    const price = glmData.quote.USD.price;
    logger.info(`Retrieved GLM price: $${price}`);

    return price;
  } catch (error) {
    logger.error('Error fetching GLM price:', error.message);
    throw error;
  }
}
