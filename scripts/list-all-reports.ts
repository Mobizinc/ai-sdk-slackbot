/**
 * List All Available Reports and Analytics
 * Comprehensive overview of all reporting capabilities in the system
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function listReports() {
  console.log('📊 AVAILABLE REPORTS & ANALYTICS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('This system has several built-in reporting and analytics capabilities:');
  console.log('');

  // Category 1: Missing Categories
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣  CATEGORY MISMATCH ANALYTICS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Shows AI-suggested categories that don\'t exist in ServiceNow');
  console.log('Includes parent-child relationships and frequency analysis');
  console.log('');
  console.log('📁 Scripts:');
  console.log('   • scripts/report-missing-categories.ts (NEW)');
  console.log('');
  console.log('📦 Repository Methods:');
  console.log('   • getCategoryMismatchRepository()');
  console.log('     - getStatistics(days)');
  console.log('     - getTopSuggestedCategories(days)');
  console.log('     - getRecentMismatches(limit)');
  console.log('');
  console.log('📊 Metrics Provided:');
  console.log('   • Total mismatches');
  console.log('   • Unique missing categories');
  console.log('   • Suggested subcategories per category');
  console.log('   • Avg confidence per category');
  console.log('   • Recent case examples');
  console.log('');
  console.log('🔧 Run:');
  console.log('   npx tsx --env-file=.env.local scripts/report-missing-categories.ts');
  console.log('');

  // Category 2: Case Queue Reports
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2️⃣  CASE QUEUE REPORTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Daily case queue snapshots and trend analysis');
  console.log('Tracks open cases by priority, assignment, and aging');
  console.log('');
  console.log('📁 Files:');
  console.log('   • api/cron/case-queue-report.ts');
  console.log('   • api/cron/case-queue-snapshot.ts');
  console.log('   • scripts/post-case-queue-report.ts');
  console.log('   • scripts/pull-case-queue-snapshot.ts');
  console.log('');
  console.log('📦 Service:');
  console.log('   • lib/services/case-queue-report.ts');
  console.log('   • lib/services/case-queue-snapshots.ts');
  console.log('');
  console.log('📊 Metrics Provided:');
  console.log('   • Open cases by priority');
  console.log('   • Cases by assignment group');
  console.log('   • Aging analysis (> 24h, > 3 days, > 7 days)');
  console.log('   • High priority alerts');
  console.log('   • Unassigned case details');
  console.log('   • Trend charts');
  console.log('');
  console.log('🔧 Run:');
  console.log('   npx tsx --env-file=.env.local scripts/post-case-queue-report.ts');
  console.log('   curl https://your-domain.vercel.app/api/cron/case-queue-report?channel=XXX');
  console.log('');

  // Category 3: Case Leaderboard
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3️⃣  CASE LEADERBOARD');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Engineer performance metrics and resolved case tracking');
  console.log('Gamification and productivity insights');
  console.log('');
  console.log('📁 Files:');
  console.log('   • api/cron/case-leaderboard.ts');
  console.log('   • scripts/post-case-leaderboard.ts');
  console.log('');
  console.log('📦 Service:');
  console.log('   • lib/services/case-leaderboard.ts');
  console.log('');
  console.log('📊 Metrics Provided:');
  console.log('   • Cases resolved per engineer');
  console.log('   • Resolution time averages');
  console.log('   • Leaderboard rankings');
  console.log('   • Time period customizable (7/14/30 days)');
  console.log('');
  console.log('🔧 Run:');
  console.log('   npx tsx --env-file=.env.local scripts/post-case-leaderboard.ts');
  console.log('   curl https://your-domain.vercel.app/api/cron/case-leaderboard?channel=XXX&days=7');
  console.log('');

  // Category 4: Escalation Analytics
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4️⃣  ESCALATION ANALYTICS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Tracks non-BAU case escalations (project scope, executive, compliance)');
  console.log('Response time and acknowledgment tracking');
  console.log('');
  console.log('📦 Repository:');
  console.log('   • lib/db/repositories/escalation-repository.ts');
  console.log('');
  console.log('📊 Available Queries:');
  console.log('   • Get escalations by case number');
  console.log('   • Get escalations by Slack message timestamp');
  console.log('   • Get recent active escalations');
  console.log('   • Get acknowledged escalations');
  console.log('   • Statistics: total escalations, response time, acknowledgment rate');
  console.log('');
  console.log('🔧 Query Database:');
  console.log('   SELECT escalation_reason, COUNT(*) FROM case_escalations');
  console.log('   WHERE created_at > NOW() - INTERVAL \'30 days\'');
  console.log('   GROUP BY escalation_reason;');
  console.log('');

  // Category 5: CMDB Reconciliation
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('5️⃣  CMDB RECONCILIATION REPORTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Tracks configuration item (CI) discovery and reconciliation');
  console.log('Shows when AI detects CIs that don\'t exist in CMDB');
  console.log('');
  console.log('📦 Repository:');
  console.log('   • lib/db/repositories/cmdb-reconciliation-repository.ts');
  console.log('');
  console.log('📊 Metrics Available:');
  console.log('   • CIs detected in cases');
  console.log('   • Reconciliation success rate');
  console.log('   • Missing CIs (detected but not in CMDB)');
  console.log('   • Task creation tracking');
  console.log('');
  console.log('🔧 Query Database:');
  console.log('   SELECT status, COUNT(*) FROM cmdb_reconciliation_log');
  console.log('   GROUP BY status;');
  console.log('');

  // Category 6: Case Classification Analytics
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('6️⃣  CASE CLASSIFICATION ANALYTICS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Comprehensive case classification metrics and insights');
  console.log('Token usage, costs, processing times, accuracy');
  console.log('');
  console.log('📦 Repository:');
  console.log('   • lib/db/repositories/case-classification-repository.ts');
  console.log('');
  console.log('📊 Metrics Available:');
  console.log('   • Classifications by category/subcategory');
  console.log('   • Average confidence scores');
  console.log('   • Token usage and LLM costs');
  console.log('   • Processing time analysis');
  console.log('   • Cache hit rates');
  console.log('   • Business intelligence detection rates');
  console.log('   • Incident/Problem creation tracking');
  console.log('');
  console.log('🔧 Query Database:');
  console.log('   SELECT category, subcategory, COUNT(*), AVG(confidence_score)');
  console.log('   FROM case_classification_results');
  console.log('   WHERE classified_at > NOW() - INTERVAL \'7 days\'');
  console.log('   GROUP BY category, subcategory');
  console.log('   ORDER BY COUNT(*) DESC;');
  console.log('');

  // Category 7: Catalog Redirect Analytics (NEW)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('7️⃣  CATALOG REDIRECT ANALYTICS (NEW)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Tracks HR request redirects to catalog items');
  console.log('Shows which request types trigger most often');
  console.log('');
  console.log('📦 Repository:');
  console.log('   • lib/db/repositories/client-settings-repository.ts');
  console.log('     - getRedirectStatistics()');
  console.log('     - getRedirectsByClient()');
  console.log('');
  console.log('📊 Metrics Available:');
  console.log('   • Redirects by request type (onboarding, termination, new_account)');
  console.log('   • Redirects by company');
  console.log('   • Average confidence scores');
  console.log('   • Auto-close rate');
  console.log('   • Matched keywords');
  console.log('');
  console.log('🔧 Query Database:');
  console.log('   SELECT request_type, client_name, COUNT(*), AVG(confidence)');
  console.log('   FROM catalog_redirect_log');
  console.log('   WHERE created_at > NOW() - INTERVAL \'30 days\'');
  console.log('   GROUP BY request_type, client_name');
  console.log('   ORDER BY COUNT(*) DESC;');
  console.log('');

  // Category 8: Repeat Submitter Analysis
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('8️⃣  REPEAT SUBMITTER PATTERN ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Identifies users who frequently submit cases');
  console.log('Pattern recognition for training opportunities');
  console.log('');
  console.log('📁 Scripts:');
  console.log('   • scripts/analyze-repeat-submitter-patterns.ts');
  console.log('');
  console.log('📊 Metrics Provided:');
  console.log('   • Cases per submitter');
  console.log('   • Common request patterns');
  console.log('   • Category distribution');
  console.log('   • Potential catalog redirect candidates');
  console.log('');
  console.log('🔧 Run:');
  console.log('   npx tsx --env-file=.env.local scripts/analyze-repeat-submitter-patterns.ts');
  console.log('');

  // Summary table
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📋 QUICK REFERENCE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('| Report | Command |');
  console.log('|--------|---------|');
  console.log('| Missing Categories | npx tsx --env-file=.env.local scripts/report-missing-categories.ts |');
  console.log('| Case Queue Report | npx tsx --env-file=.env.local scripts/post-case-queue-report.ts |');
  console.log('| Case Leaderboard | npx tsx --env-file=.env.local scripts/post-case-leaderboard.ts |');
  console.log('| Repeat Submitters | npx tsx --env-file=.env.local scripts/analyze-repeat-submitter-patterns.ts |');
  console.log('| Catalog Redirects | SELECT * FROM catalog_redirect_log ORDER BY created_at DESC |');
  console.log('| Escalations | SELECT * FROM case_escalations ORDER BY created_at DESC |');
  console.log('| CMDB Reconciliation | SELECT * FROM cmdb_reconciliation_log ORDER BY created_at DESC |');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('💡 COMING SOON');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Additional reports that could be created:');
  console.log('');
  console.log('  • Catalog Redirect Dashboard');
  console.log('    - Redirect volume by request type');
  console.log('    - Top redirected companies');
  console.log('    - False positive rate');
  console.log('');
  console.log('  • Classification Accuracy Report');
  console.log('    - Confidence score distribution');
  console.log('    - Category accuracy over time');
  console.log('    - Misclassification patterns');
  console.log('');
  console.log('  • Business Intelligence Insights');
  console.log('    - Project scope detection rate');
  console.log('    - Executive visibility cases');
  console.log('    - Compliance impact tracking');
  console.log('');
  console.log('  • Token Usage & Cost Analysis');
  console.log('    - LLM costs by service');
  console.log('    - Token consumption trends');
  console.log('    - Cost optimization opportunities');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════');
}

listReports().catch(console.error);
