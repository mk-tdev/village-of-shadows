#!/usr/bin/env bash
# Builds the backend image in ACR and deploys it to Azure Container Apps.
# Run from an already authenticated Azure CLI terminal. No secrets are saved.
set -euo pipefail

SUBSCRIPTION_ID="23894f22-7366-444f-80dd-73ee86709eed"
RESOURCE_GROUP="rg-village-shadows-test-sea"
LOCATION="southeastasia"
REGISTRY_NAME="acrvillageshadows23894"
CONTAINER_APP_ENV="cae-village-shadows-test-sea"
CONTAINER_APP_NAME="ca-village-shadows-api"
IMAGE_NAME="village-of-shadows-api"
IMAGE_TAG="${IMAGE_TAG:-azure-test-v1}"
POSTGRES_SERVER="pgvillageshadows23894"
POSTGRES_ADMIN="village_admin"
DATABASE_NAME="village"
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-https://village-of-shadows.vercel.app}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

az account set --subscription "$SUBSCRIPTION_ID"

az extension add --name containerapp --upgrade --yes >/dev/null

for provider in Microsoft.App Microsoft.OperationalInsights; do
  az provider register --namespace "$provider" --wait
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker was not found. Install Docker Desktop, then rerun this script."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed, but the Docker daemon is not running."
  echo "Start Docker Desktop and wait until it says Docker is running, then rerun this script."
  exit 1
fi

if ! az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "Resource group '$RESOURCE_GROUP' was not found. Run the data-plane provisioning script first."
  exit 1
fi

if ! az acr show --resource-group "$RESOURCE_GROUP" --name "$REGISTRY_NAME" >/dev/null 2>&1; then
  echo "ACR '$REGISTRY_NAME' was not found. Run scripts/azure-provision-data-plane.sh first."
  exit 1
fi

if ! az postgres flexible-server show --resource-group "$RESOURCE_GROUP" --name "$POSTGRES_SERVER" >/dev/null 2>&1; then
  echo "PostgreSQL server '$POSTGRES_SERVER' was not found. Run scripts/azure-provision-data-plane.sh first."
  exit 1
fi

echo "This script expects the rotated PostgreSQL administrator password."
read -r -s -p "Rotated PostgreSQL password for ${POSTGRES_ADMIN}: " POSTGRES_PASSWORD
printf '\n'
trap 'unset POSTGRES_PASSWORD ACR_PASSWORD ACR_USERNAME DATABASE_URL PASSWORD_ENCODED' EXIT

PASSWORD_ENCODED="$(printf '%s' "$POSTGRES_PASSWORD" | python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))')"
DATABASE_URL="postgresql://${POSTGRES_ADMIN}:${PASSWORD_ENCODED}@${POSTGRES_SERVER}.postgres.database.azure.com:5432/${DATABASE_NAME}?sslmode=require"

FULL_IMAGE_NAME="${REGISTRY_NAME}.azurecr.io/${IMAGE_NAME}:${IMAGE_TAG}"

echo "Logging Docker into Azure Container Registry ${REGISTRY_NAME}..."
az acr login --name "$REGISTRY_NAME" >/dev/null

echo "Building ${FULL_IMAGE_NAME} locally..."
docker build \
  --platform linux/amd64 \
  --file "$REPO_ROOT/Dockerfile" \
  --tag "$FULL_IMAGE_NAME" \
  "$REPO_ROOT"

echo "Pushing ${FULL_IMAGE_NAME} to Azure Container Registry..."
docker push "$FULL_IMAGE_NAME"

if az containerapp env show --name "$CONTAINER_APP_ENV" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "Using existing Container Apps environment ${CONTAINER_APP_ENV}."
else
  echo "Creating Container Apps environment ${CONTAINER_APP_ENV}..."
  az containerapp env create \
    --name "$CONTAINER_APP_ENV" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --tags project=village-of-shadows environment=test purpose=azure-migration \
    >/dev/null
fi

echo "Enabling ACR admin credentials for this test deployment..."
az acr update --name "$REGISTRY_NAME" --admin-enabled true >/dev/null
ACR_USERNAME="$(az acr credential show --name "$REGISTRY_NAME" --query username --output tsv)"
ACR_PASSWORD="$(az acr credential show --name "$REGISTRY_NAME" --query 'passwords[0].value' --output tsv)"

if az containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "Updating existing Container App ${CONTAINER_APP_NAME}..."
  az containerapp secret set \
    --name "$CONTAINER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --secrets "database-url=${DATABASE_URL}" \
    >/dev/null

  az containerapp registry set \
    --name "$CONTAINER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --server "${REGISTRY_NAME}.azurecr.io" \
    --username "$ACR_USERNAME" \
    --password "$ACR_PASSWORD" \
    >/dev/null

  az containerapp update \
    --name "$CONTAINER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$FULL_IMAGE_NAME" \
    --set-env-vars \
      "DATABASE_URL=secretref:database-url" \
      "CORS_ORIGINS=[\"${FRONTEND_ORIGIN}\"]" \
      "PORT=8000" \
    --cpu 0.5 \
    --memory 1.0Gi \
    --min-replicas 1 \
    --max-replicas 1 \
    >/dev/null
else
  echo "Creating Container App ${CONTAINER_APP_NAME}..."
  az containerapp create \
    --name "$CONTAINER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$CONTAINER_APP_ENV" \
    --image "$FULL_IMAGE_NAME" \
    --ingress external \
    --target-port 8000 \
    --transport auto \
    --registry-server "${REGISTRY_NAME}.azurecr.io" \
    --registry-username "$ACR_USERNAME" \
    --registry-password "$ACR_PASSWORD" \
    --secrets "database-url=${DATABASE_URL}" \
    --env-vars \
      "DATABASE_URL=secretref:database-url" \
      "CORS_ORIGINS=[\"${FRONTEND_ORIGIN}\"]" \
      "PORT=8000" \
    --cpu 0.5 \
    --memory 1.0Gi \
    --min-replicas 1 \
    --max-replicas 1 \
    --tags project=village-of-shadows environment=test purpose=azure-migration \
    >/dev/null
fi

APP_FQDN="$(az containerapp show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn \
  --output tsv)"

APP_URL="https://${APP_FQDN}"

echo "Waiting for API health at ${APP_URL}/health..."
for attempt in {1..24}; do
  if curl -fsS "${APP_URL}/health" | grep -q '"ok":true'; then
    echo
    echo "Azure API is ready:"
    echo "${APP_URL}"
    echo
    echo "Set Vercel NEXT_PUBLIC_API_URL to:"
    echo "${APP_URL}"
    echo
    echo "To keep the API warm for demos, min replicas is currently 1."
    echo "To pause the Container App after testing:"
    echo "az containerapp update --name ${CONTAINER_APP_NAME} --resource-group ${RESOURCE_GROUP} --min-replicas 0"
    echo
    echo "To delete all Azure test resources:"
    echo "az group delete --name ${RESOURCE_GROUP} --yes --no-wait"
    exit 0
  fi

  printf 'Health check not ready yet, retrying in 10 seconds... (%s/24)\n' "$attempt"
  sleep 10
done

echo "Container App was deployed, but /health did not become ready within 4 minutes."
echo "Check logs with:"
echo "az containerapp logs show --name ${CONTAINER_APP_NAME} --resource-group ${RESOURCE_GROUP} --follow"
exit 1
