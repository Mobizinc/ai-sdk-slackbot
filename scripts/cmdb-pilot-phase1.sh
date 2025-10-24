#!/bin/bash
###############################################################################
# CMDB Pilot Phase 1: Manual Discovery Helper Script
#
# This script guides you through Phase 1 of the Altus CMDB pilot:
# 1. Discover infrastructure from Slack
# 2. Create CI records manually
# 3. Validate CI records
# 4. Test PeterPool integration
#
# Usage: ./scripts/cmdb-pilot-phase1.sh
###############################################################################

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                 CMDB Pilot - Phase 1: Manual Discovery                ║"
echo "║                     Altus Infrastructure                               ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}\n"

# Check for required environment variables
if [ ! -f .env.local ]; then
  echo -e "${RED}❌ .env.local not found${NC}"
  echo "Please create .env.local with ServiceNow and Slack credentials"
  exit 1
fi

source .env.local

if [ -z "$SLACK_BOT_TOKEN" ]; then
  echo -e "${RED}❌ SLACK_BOT_TOKEN not configured in .env.local${NC}"
  exit 1
fi

if [ -z "$SERVICENOW_INSTANCE_URL" ]; then
  echo -e "${RED}❌ ServiceNow credentials not configured in .env.local${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Prerequisites checked${NC}\n"

# Step 1: Infrastructure Discovery
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ Step 1: Discover Infrastructure from #altus-support                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "This will scan the #altus-support channel for infrastructure mentions"
echo -e "(IP addresses, hostnames, share paths) over the last 60 days.\n"

read -p "Press Enter to start discovery, or Ctrl+C to cancel..."

echo -e "\n${YELLOW}🔍 Running infrastructure discovery...${NC}\n"

npx tsx scripts/discover-infrastructure.ts --channel altus-support --days 60

DISCOVERY_FILE=$(ls -t infrastructure-discovery-altus-support-*.json 2>/dev/null | head -1)

if [ -n "$DISCOVERY_FILE" ]; then
  echo -e "\n${GREEN}✅ Discovery complete!${NC}"
  echo -e "Report saved to: ${DISCOVERY_FILE}\n"
else
  echo -e "\n${RED}❌ Discovery report not found${NC}"
  exit 1
fi

# Step 2: Create CI Records
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ Step 2: Create First 3 CI Records                                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "Based on the discovery report, you should now create 3 CI records:"
echo -e "  1. ${GREEN}File Server${NC} (e.g., 10.252.0.40 - L Drive)"
echo -e "  2. ${GREEN}Network Device${NC} (router, switch, firewall)"
echo -e "  3. ${GREEN}Application/Service${NC} (if discovered)\n"

echo -e "Use the template at: ${YELLOW}templates/cmdb-ci-template.json${NC}"
echo -e "See example at: ${YELLOW}examples/altus-file-server-example.json${NC}\n"

echo -e "Save your CI records as:"
echo -e "  - ${YELLOW}ci-records/altus-[name]-1.json${NC}"
echo -e "  - ${YELLOW}ci-records/altus-[name]-2.json${NC}"
echo -e "  - ${YELLOW}ci-records/altus-[name]-3.json${NC}\n"

# Create ci-records directory if it doesn't exist
mkdir -p ci-records

echo -e "${YELLOW}💡 Tip: Copy the template and fill it out based on discovery findings${NC}"
echo -e "   cp templates/cmdb-ci-template.json ci-records/altus-server-1.json\n"

read -p "Press Enter when you've created your 3 CI records, or Ctrl+C to exit..."

# Step 3: Validate CI Records
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ Step 3: Validate CI Records                                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}\n"

CI_FILES=$(ls ci-records/altus-*.json 2>/dev/null || true)

if [ -z "$CI_FILES" ]; then
  echo -e "${YELLOW}⚠️  No CI files found in ci-records/altus-*.json${NC}"
  echo -e "Skipping validation...\n"
else
  echo -e "${YELLOW}🔍 Validating CI records...${NC}\n"

  npx tsx scripts/validate-ci.ts ci-records/altus-*.json

  VALIDATION_RESULT=$?

  if [ $VALIDATION_RESULT -eq 0 ]; then
    echo -e "\n${GREEN}✅ All CI records are valid!${NC}\n"
  else
    echo -e "\n${RED}❌ Some CI records have validation errors${NC}"
    echo -e "Please fix the errors above and re-run validation:\n"
    echo -e "  npx tsx scripts/validate-ci.ts ci-records/altus-*.json\n"
    exit 1
  fi
fi

# Step 4: Review and Next Steps
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ Step 4: Next Steps                                                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}✅ Phase 1 Discovery Complete!${NC}\n"

echo -e "You've completed:"
echo -e "  ✅ Infrastructure discovery from Slack"
echo -e "  ✅ Created and validated 3 CI records\n"

echo -e "Next steps (from ${YELLOW}operations/cmdb/CMDB_PILOT_ALTUS.md${NC}):\n"

echo -e "1. ${YELLOW}Upload CI records to ServiceNow CMDB${NC}"
echo -e "   - Manual entry in ServiceNow UI, OR"
echo -e "   - Bulk CSV import, OR"
echo -e "   - API upload (we can build this)\n"

echo -e "2. ${YELLOW}Test PeterPool Integration${NC}"
echo -e "   - In Slack, mention infrastructure in #altus-support"
echo -e "   - Verify PeterPool finds the CI records"
echo -e "   - Example: \"@PeterPool what do you know about 10.252.0.40?\"\n"

echo -e "3. ${YELLOW}Document Lessons Learned${NC}"
echo -e "   - Which fields were hard to fill?"
echo -e "   - What information was missing?"
echo -e "   - What would make this easier?\n"

echo -e "4. ${YELLOW}Proceed to Phase 2${NC}"
echo -e "   - Refine template based on learnings"
echo -e "   - Document 10-15 more Altus CIs"
echo -e "   - See: operations/cmdb/CMDB_PILOT_ALTUS.md\n"

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Phase 1 Complete! 🎉                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════════╝${NC}\n"
