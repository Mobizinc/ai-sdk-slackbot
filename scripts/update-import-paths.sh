#!/bin/bash
#
# Automated Import Path Update Script
#
# Updates all relative imports to use TypeScript path aliases (@/)
# Run from project root: bash scripts/update-import-paths.sh
#

set -e  # Exit on error

echo "🔄 Updating import paths to use @/ aliases..."

# Function to update imports in a file
update_file() {
  local file="$1"
  echo "  📝 Updating: $file"

  # Create backup
  cp "$file" "$file.bak"

  # Apply transformations (macOS compatible sed)
  sed -i '' \
    -e 's|from "../../../../infrastructure/|from "@/infrastructure/|g' \
    -e 's|from "../../../../services/|from "@/services/|g' \
    -e 's|from "../../../../utils/|from "@/utils/|g' \
    -e 's|from "../../../../config"|from "@/config"|g' \
    -e 's|from "../../../../tools/|from "@/tools/|g' \
    -e 's|from "../../../lib/|from "@/|g' \
    -e 's|from "../../shared"|from "@/agent/tools/shared"|g' \
    -e 's|from "../../../../../lib/|from "@/|g' \
    -e 's|from "../../infrastructure/|from "@/infrastructure/|g' \
    -e 's|from "../../tools/|from "@/tools/|g' \
    -e 's|from "../../services/|from "@/services/|g' \
    -e 's|from "../../utils/|from "@/utils/|g' \
    -e 's|from "../../config"|from "@/config"|g' \
    "$file"

  # Remove backup if transformation succeeded
  rm "$file.bak"
}

# Update all ServiceNow tool files
echo "📂 Updating tool files..."
find lib/agent/tools/servicenow -name "*.ts" -type f | while read file; do
  update_file "$file"
done

# Update all ServiceNow test files
echo "📂 Updating test files..."
find tests/agent/tools/servicenow -name "*.ts" -type f | while read file; do
  update_file "$file"
done

# Update old tool files
echo "📂 Updating old tool files..."
for file in lib/agent/tools/cmdb.ts lib/agent/tools/knowledge-base.ts lib/agent/tools/triage.ts lib/agent/tools/servicenow-orchestration.ts; do
  if [ -f "$file" ]; then
    update_file "$file"
  fi
done

echo "✅ Import path updates complete!"
echo ""
echo "Next steps:"
echo "  1. Run: npm run build:api"
echo "  2. Run: npm test -- tests/agent/tools/servicenow"
echo "  3. Review changes: git diff"
echo "  4. If good: git add -u && git commit -m 'refactor: update all imports to use @/ path aliases'"
