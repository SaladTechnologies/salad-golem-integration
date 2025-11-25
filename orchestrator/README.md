# Orchestrator Docker Usage

## Building the Docker Image

```sh
# From the orchestrator directory
docker build -t orchestrator-app .
```

## Running the Docker Container


```sh
docker run \
	-e API_URL=your-yagna-api-url \
	-e API_KEY=your-yagna-api-key \
	-e KUBE_CONFIG_PATH=/app/config/kubeconfig.yaml \
	-e MATRIX_API_KEY=your-matrix-key \
	-e MATRIX_API_URL=https://matrix.example.com \
	-e NODES_DATABASE_FILE_PATH=/app/data/nodes.db \
	-e ORGANIZATION_WHITELIST="[\"realfake\"]" \
	-e PLANS_DATABASE_FILE_PATH=/app/data/plans.db \
	-e PRICES_DATABASE_FILE_PATH=/app/data/prices.db \
	-e YAGNA_ACCOUNT=your-yagna-account \
	orchestrator-app
```

## Custom Environment Variables

Set the following environment variables as needed:

- `API_URL`
- `API_KEY`
- `KUBE_CONFIG_PATH`
- `MATRIX_API_KEY`
- `MATRIX_API_URL`
- `NODES_DATABASE_FILE_PATH`
- `ORGANIZATION_WHITELIST`
- `PLANS_DATABASE_FILE_PATH`
- `PRICES_DATABASE_FILE_PATH`
- `YAGNA_ACCOUNT`
