#!/bin/bash
#
# Run Firewall Import in PROD
#
# This script temporarily unsets DEV variables to force PROD environment
#

echo "🚀 Running Firewall Import in PRODUCTION"
echo "=========================================="
echo ""
echo "⚠️  WARNING: This will CREATE/UPDATE firewalls in PRODUCTION ServiceNow"
echo "   URL: https://mobiz.service-now.com"
echo ""
echo "Starting import..."
echo ""

# Unset DEV variables to force PROD environment
unset DEV_SERVICENOW_URL
unset DEV_SERVICENOW_USERNAME
unset DEV_SERVICENOW_PASSWORD

# Run the import script (will use SERVICENOW_* variables)
npx tsx scripts/create-firewalls-from-template.ts
