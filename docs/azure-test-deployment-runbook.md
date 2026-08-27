# Azure test deployment runbook

This runbook records the Azure test deployment for Village of Shadows. It is intended to make every created resource visible, reproducible, and removable after testing.

## Safety rules

- All test resources belong to one resource group.
- Do not commit Azure connection strings, provider keys, database passwords, or registry tokens.
- Keep Container Apps at one replica: the live game registry and in-process MCP server are not horizontally distributed yet.
- To stop all Azure billing after the test, delete the resource group.

## Selected scope

| Item | Value |
| --- | --- |
| Subscription | Azure subscription 1 |
| Region | Southeast Asia |
| Resource group | `rg-village-shadows-test-sea` |
| Database | Azure Database for PostgreSQL Flexible Server |
| API runtime | Azure Container Apps |
| Container image registry | Azure Container Registry Basic |

## Provisioning log

### 2026-08-27 - authentication and resource boundary

1. Azure CLI 2.89.1 was installed locally through Homebrew.
2. Device-code login was blocked by the tenant security-defaults policy.
3. Browser-based `az login` succeeded for the enabled free subscription.
4. The resource group below is the teardown boundary for every test resource:

```bash
az group create \
  --name rg-village-shadows-test-sea \
  --location southeastasia
```

5. `rg-village-shadows-test-sea` was created successfully in `southeastasia` with `project=village-of-shadows`, `environment=test`, and `purpose=azure-migration` tags.
6. Registration was requested for the `Microsoft.App`, `Microsoft.DBforPostgreSQL`, `Microsoft.ContainerRegistry`, and `Microsoft.OperationalInsights` providers. Azure may take a few minutes to finish that one-time subscription operation before resources can be created.

### 2026-08-27 - data-plane result

- Azure Container Registry and the PostgreSQL Flexible Server were created.
- The backend image was built locally and pushed to Azure Container Registry because ACR Tasks were blocked in this subscription.
- Azure Container Apps environment creation requires `Microsoft.OperationalInsights`; the deployment script now registers it before creating the environment.
- Azure Container Apps expects a Linux AMD64 image. On Apple Silicon Macs, the deployment script must build Docker with `--platform linux/amd64`.
- The database creation command originally used an obsolete `--database-name` flag; the provisioning script now uses the current `--name` flag.
- The `village` database was created successfully with the current `az postgres flexible-server db create --name village` syntax.
- The database administrator password was exposed outside the terminal during setup and must be rotated before the API is deployed.

## Data-plane provisioning script

[`scripts/azure-provision-data-plane.sh`](../scripts/azure-provision-data-plane.sh) is the one-time script that creates ACR Basic, a small PostgreSQL Flexible Server, and the `village` database. It should not be rerun after those resources already exist unless the resource group has been deleted and recreated.

For this short test, PostgreSQL permits Azure-service access (`0.0.0.0`) so Container Apps can connect. The server still enforces TLS and password authentication. Delete the resource group immediately after testing.

## Required password rotation

The first PostgreSQL administrator password was exposed outside the terminal during setup. Rotate it before deploying the API:

```bash
read -s PG_NEW_PASSWORD

az postgres flexible-server update \
  --resource-group rg-village-shadows-test-sea \
  --name pgvillageshadows23894 \
  --admin-password "$PG_NEW_PASSWORD"

unset PG_NEW_PASSWORD
```

Do not paste the new password into chat, commit it, or write it into a file. The API deployment script prompts for it only inside the local terminal.

## API deployment

After the password is rotated, run the API deployment from the repository root:

```bash
scripts/azure-deploy-api.sh
```

The script now avoids Azure Container Registry Tasks because this subscription returned `TasksOperationsNotAllowed`. It uses local Docker build/push instead, so Docker Desktop must be running before the script prompts for the database password. Local image builds are pinned to `linux/amd64` so Azure Container Apps can run them. The Docker image installs from `backend/requirements.lock` with `pip` to avoid a `uv sync` QEMU segmentation fault during AMD64 builds on Apple Silicon.

The script:

- builds the backend Docker image locally and pushes it to Azure Container Registry;
- creates an Azure Container Apps environment if needed;
- stores the PostgreSQL connection string as a Container Apps secret;
- exposes the FastAPI service over HTTPS;
- keeps the demo warm with one replica;
- waits until `/health` returns `{"ok": true}`;
- prints the API URL to use as `NEXT_PUBLIC_API_URL` in Vercel.

The deployment intentionally starts with no provider API keys in Azure. The app can still be smoke-tested with mock/local model paths. Add provider keys later as Container Apps secrets only if the demo needs live provider calls.

## Frontend wiring

After the script prints the Azure API URL, set the Vercel frontend environment variable:

```text
NEXT_PUBLIC_API_URL=https://<printed-container-app-url>
```

Then redeploy the Vercel frontend. Local Docker and local development continue to use the local Python backend; only the Vercel deployment should point to Azure.

## Stop and delete

Container Apps cannot be paused like a virtual machine. For a short testing pause, set its minimum replicas to zero after the API is deployed:

```bash
az containerapp update \
  --name ca-village-shadows-api \
  --resource-group rg-village-shadows-test-sea \
  --min-replicas 0
```

Set `--min-replicas 1` to resume a warm demo API. PostgreSQL and ACR still incur charges while they exist. When testing is complete, delete every Azure resource and its ongoing cost with one command:

```bash
az group delete \
  --name rg-village-shadows-test-sea \
  --yes \
  --no-wait
```

Check deletion progress:

```bash
az group exists --name rg-village-shadows-test-sea
```

`false` means the resource group and all resources inside it are gone.
