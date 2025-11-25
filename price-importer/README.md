# Price Importer

This project imports price data using Node.js and supports configuration via environment variables. Logging is handled with Pino.

## Running with Docker

1. **Build the Docker image:**
   ```powershell
   docker build -t price-importer .
   ```

2. **Run the container:**
   ```powershell
   docker run --rm -it \
     -e COINMARKETCAP_API_KEY=your_api_key_here \
     -e DATABASE_FILE_PATH=/app/data/prices.db \
     price-importer
   ```
   Replace `your_api_key_here` with your actual CoinMarketCap API key.

## Environment Variables


Configuration values can be set using environment variables, as mapped in `config/custom-environment-variables.json`:

- `COINMARKETCAP_API_KEY`: The API key for accessing external services.
- `DATABASE_FILE_PATH`: Path to the database file used by the application.

Set these variables when running the Docker container to override config values.

## Project Structure
- `index.mjs`: Main entry point
- `db.mjs`, `fetcher.mjs`, `logger.mjs`: Core modules
- `config/`: Configuration files
  - `default.json`, `development.json`: Default and development configs
  - `custom-environment-variables.json`: Maps config keys to environment variables
- `Dockerfile`: Container build instructions

## Example
```powershell
docker run --rm -it -e COINMARKETCAP_API_KEY=your_api_key_here price-importer
```

## Notes
- The app uses ES modules (`.mjs` files).
- Logging output is formatted with `pino-pretty`.
- For more configuration options, edit the files in the `config/` directory.
