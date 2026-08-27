#!/usr/bin/env bash
# Creates only the registry and PostgreSQL resources used by the Azure test.
# Run from an already authenticated Azure CLI terminal. No secrets are saved.
set -euo pipefail

SUBSCRIPTION_ID="23894f22-7366-444f-80dd-73ee86709eed"
RESOURCE_GROUP="rg-village-shadows-test-sea"
LOCATION="southeastasia"
REGISTRY_NAME="acrvillageshadows23894"
POSTGRES_SERVER="pgvillageshadows23894"
POSTGRES_ADMIN="village_admin"
DATABASE_NAME="village"

az account set --subscription "$SUBSCRIPTION_ID"

for provider in Microsoft.App Microsoft.DBforPostgreSQL Microsoft.ContainerRegistry Microsoft.OperationalInsights; do
  az provider register --namespace "$provider" --wait
done

read -r -s -p "PostgreSQL administrator password (it will not be saved): " POSTGRES_PASSWORD
printf '\n'
trap 'unset POSTGRES_PASSWORD' EXIT

az acr create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$REGISTRY_NAME" \
  --sku Basic \
  --tags project=village-of-shadows environment=test purpose=azure-migration

az postgres flexible-server create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$POSTGRES_SERVER" \
  --location "$LOCATION" \
  --admin-user "$POSTGRES_ADMIN" \
  --admin-password "$POSTGRES_PASSWORD" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 16 \
  --storage-size 32 \
  --backup-retention 7 \
  --public-access 0.0.0.0 \
  --tags project=village-of-shadows environment=test purpose=azure-migration

az postgres flexible-server db create \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$POSTGRES_SERVER" \
  --name "$DATABASE_NAME"

echo
echo "Created registry: ${REGISTRY_NAME}.azurecr.io"
echo "Created PostgreSQL server: $(az postgres flexible-server show --resource-group "$RESOURCE_GROUP" --name "$POSTGRES_SERVER" --query fullyQualifiedDomainName --output tsv)"
echo "When testing is complete, delete every resource with:"
echo "az group delete --name $RESOURCE_GROUP --yes --no-wait"
