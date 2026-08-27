# Azure deployment and user-provided API-key plan

## Current architecture

Village of Shadows now uses PostgreSQL for application records and LangGraph checkpoints. Docker Compose is the supported local workflow; Azure is the production target.

```text
Browser -> Vercel (Next.js) -> Azure Container Apps (FastAPI + MCP)
                                  -> Azure Database for PostgreSQL Flexible Server
                                  -> selected model providers
```

Keep the backend at one Container Apps replica. PostgreSQL makes state durable, but the active-game registry and in-process MCP server remain process-local. Scaling needs distributed game ownership and stream routing.

## Local Docker workflow

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
./start.sh
```

`compose.yaml` starts PostgreSQL, FastAPI, and Next.js. Its app connection is `postgresql://village:village@postgres:5432/village?sslmode=disable`. The separate `compose.test.yaml` database on port 5433 is disposable, so test cleanup cannot erase development games.

```bash
docker compose -f compose.test.yaml up -d
TEST_DATABASE_URL="postgresql://village_test:village_test@127.0.0.1:5433/village_test?sslmode=disable" backend/.venv/bin/pytest backend/tests -q
```

## Azure deployment

Create, in one region, a resource group, Azure Container Registry, Azure Database for PostgreSQL Flexible Server, a Container Apps environment, and one Container App. Use a small burstable PostgreSQL SKU for the demo and restrict database network access to Azure services or private networking.

Build the repository `Dockerfile`, push it to ACR, and configure Container Apps with ingress target port `8000`, `minReplicas: 1`, and `maxReplicas: 1`. Prefer a managed identity with `AcrPull` rather than ACR administrator credentials. The container binds Uvicorn to `0.0.0.0:$PORT` without reload mode.

Store values in Container Apps secrets, never Git:

| Variable | Production value |
| --- | --- |
| `DATABASE_URL` | PostgreSQL TLS URL ending `?sslmode=require` |
| `CORS_ORIGINS` | JSON list containing the Vercel production URL |
| `HOST` | `127.0.0.1` |
| `PORT` | `8000` |
| provider keys | Optional operator-owned keys for enabled providers |

Example shape only:

```text
postgresql://village_app:password@server.postgres.database.azure.com:5432/village?sslmode=require
```

At startup the backend runs its versioned application-schema bootstrap and LangGraph `AsyncPostgresSaver.setup()`. In Vercel set `NEXT_PUBLIC_API_URL=https://<container-app-fqdn>`, redeploy, then add the exact Vercel URL to `CORS_ORIGINS` and redeploy the Container App. Confirm `https://<container-app-fqdn>/health` returns `{"ok": true}`.

## User-provided API keys

The public demo is operator-keyed today. A future BYOK version should collect one key per provider per game, transmit it once over HTTPS, retain it only in process memory, and delete it at completion, failure, expiry, or restart. Never put visitor keys in PostgreSQL, LangGraph checkpoints, logs, SSE events, URLs, or browser storage.

Before public BYOK, add a per-game control token, strict CORS, rate/concurrency limits, model-call budgets, redacted errors, SSRF protection for custom Ollama endpoints, reconnect-safe SSE, and documented data retention.

## Expected demo costs

Costs vary by region and traffic. Azure Container Apps has a monthly free grant, so a light single-replica demo may fit within it. The recurring baseline is normally PostgreSQL compute/storage plus Azure Container Registry: a small burstable PostgreSQL server with modest storage is commonly low tens of USD per month, and ACR Basic is roughly USD 5/month. Model-provider usage is separate and may cost more. Confirm regional pricing with the Azure calculator before provisioning.

## Operational checklist

1. Keep Container Apps at one replica.
2. Require PostgreSQL TLS in Azure.
3. Configure backups and a finished-game retention period.
4. Monitor container restarts and database failures.
5. Test an end-to-end human interrupt/resume after every release.
6. Run the isolated PostgreSQL test suite before deployment.

## References

- [Azure Container Apps billing](https://learn.microsoft.com/azure/container-apps/billing)
- [Azure Database for PostgreSQL Flexible Server pricing](https://azure.microsoft.com/pricing/details/postgresql/flexible-server/)
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
