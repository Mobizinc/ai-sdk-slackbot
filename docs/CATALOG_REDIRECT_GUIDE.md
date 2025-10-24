# Catalog Request Redirect System

## Overview

The Catalog Request Redirect System automatically detects HR-related requests that were incorrectly submitted as generic "IT Support Issues" and redirects them to the proper ServiceNow catalog items. This system enforces process compliance while providing professional, helpful guidance to users.

## Features

✅ **Automated Detection**: Identifies HR requests using keyword-based pattern matching
✅ **Professional Messaging**: Generates polite, helpful closure messages with catalog links
✅ **Flexible Configuration**: Customizable per-client via environment variables
✅ **Full Audit Trail**: Maintains classification and redirect metrics
✅ **Non-Disruptive**: Only affects HR requests, doesn't interfere with normal case processing
✅ **Confidence-Based**: Only redirects when confidence threshold is met

## Architecture

### Components

1. **ServiceNow Catalog API** (`lib/tools/servicenow.ts`)
   - `getCatalogItems()` - Search for catalog items
   - `getCatalogItemByName()` - Get specific catalog item
   - `getCatalogItemUrl()` - Generate user-friendly URLs

2. **HR Request Detector** (`lib/services/hr-request-detector.ts`)
   - Detects HR-related keywords in case descriptions
   - Maps to appropriate catalog items
   - Calculates confidence scores

3. **Catalog Redirect Handler** (`lib/services/catalog-redirect-handler.ts`)
   - Generates professional closure messages
   - Fetches appropriate catalog items
   - Closes cases with proper status
   - Tracks redirect metrics

4. **Case Triage Integration** (`lib/services/case-triage.ts`)
   - Runs catalog redirect check after classification
   - Only redirects non-incident cases
   - Maintains full audit trail

## Configuration

### Configuration Hierarchy

The catalog redirect system uses a three-tier configuration hierarchy:

1. **Client-Specific Settings (Database)** - Highest priority
2. **Environment Variables** - Global defaults
3. **Hardcoded Defaults** - Fallback values

This allows you to set global defaults via environment variables while customizing settings per client in the database.

### Environment Variables

Add these to your `.env` file as global defaults:

```bash
# Enable/disable catalog redirect feature globally
CATALOG_REDIRECT_ENABLED=true

# Confidence threshold (0.0 - 1.0)
# Only redirect if detection confidence is above this threshold
CATALOG_REDIRECT_CONFIDENCE_THRESHOLD=0.5

# Auto-close cases (true/false)
# If true, cases are automatically closed
# If false, only work notes are added
CATALOG_REDIRECT_AUTO_CLOSE=true

# Support contact information
# Displayed in closure messages for users who need help
SUPPORT_CONTACT_INFO="your IT Support team at support@company.com"
```

### Database Configuration

#### Database Migration

First, apply the database migration to create the required tables:

```bash
npm run db:push
```

This creates two tables:
- `client_settings` - Per-client configuration
- `catalog_redirect_log` - Redirect activity tracking

#### Managing Client Settings

Use the `ClientSettingsRepository` to manage per-client configuration programmatically:

```typescript
import { getClientSettingsRepository } from './lib/db/repositories/client-settings-repository';

const repo = getClientSettingsRepository();

// Create or update client settings
await repo.upsertClientSettings({
  clientId: 'acme-corp',
  clientName: 'ACME Corporation',
  catalogRedirectEnabled: true,
  catalogRedirectConfidenceThreshold: 0.7,  // Stricter for this client
  catalogRedirectAutoClose: true,
  supportContactInfo: 'ACME IT Support at it@acme.com',
  customCatalogMappings: [],
  features: {},
});

// Update specific fields
await repo.updateClientSettings('acme-corp', {
  catalogRedirectAutoClose: false,  // Change to work notes only
  catalogRedirectConfidenceThreshold: 0.6,
});

// Get current settings
const settings = await repo.getClientSettings('acme-corp');

// Get all clients with redirect enabled
const enabledClients = await repo.getClientsWithRedirectEnabled();
```

#### Client Settings Schema

```typescript
{
  clientId: string;                              // Unique identifier (e.g., 'acme-corp')
  clientName: string;                            // Display name
  catalogRedirectEnabled: boolean;               // Override global enable/disable
  catalogRedirectConfidenceThreshold: number;    // 0.0-1.0, override global threshold
  catalogRedirectAutoClose: boolean;             // Override global auto-close
  supportContactInfo?: string;                   // Custom contact info for this client
  customCatalogMappings?: Array<{                // Custom keyword mappings
    requestType: string;
    keywords: string[];
    catalogItemNames: string[];
    priority: number;
  }>;
  features?: Record<string, any>;                // Additional feature flags
  notes?: string;                                // Admin notes
}
```

#### Redirect Activity Tracking

All redirect activity is automatically logged to the `catalog_redirect_log` table:

```typescript
// Get metrics for a client
const metrics = await repo.getRedirectMetrics('acme-corp', 30); // Last 30 days

console.log('Total redirects:', metrics.totalRedirects);
console.log('Auto-closed rate:', metrics.autoClosedRate);
console.log('Top keywords:', metrics.topKeywords);
console.log('Top submitters:', metrics.topSubmitters);
console.log('Redirects by day:', metrics.redirectsByDay);

// Get recent redirect activity
const recentRedirects = await repo.getRecentRedirects('acme-corp', 50);

// Find repeat offenders
const repeatOffenders = await repo.getRepeatOffenders('acme-corp', 30, 3);
console.log('Users with 3+ redirects in 30 days:', repeatOffenders);
```

### Webhook Configuration

Ensure the ServiceNow webhook is configured to enable catalog redirect:

```typescript
// In api/servicenow-webhook.ts
const triageResult = await caseTriageService.triageCase(webhookData, {
  enableCaching: true,
  enableSimilarCases: true,
  enableKBArticles: true,
  enableBusinessContext: true,
  enableWorkflowRouting: true,
  writeToServiceNow: true,
  enableCatalogRedirect: true, // Enable catalog redirect
});
```

### Custom Catalog Mappings (Optional)

To customize which keywords map to which catalog items, set the `HR_REQUEST_DETECTOR_CONFIG` environment variable:

```bash
HR_REQUEST_DETECTOR_CONFIG='{
  "mappings": [
    {
      "requestType": "onboarding",
      "keywords": ["onboarding", "new hire", "new employee"],
      "catalogItemNames": ["HR - Employee Onboarding Request"],
      "priority": 10
    },
    {
      "requestType": "termination",
      "keywords": ["termination", "offboarding", "employee leaving"],
      "catalogItemNames": ["HR - Employee Termination Request"],
      "priority": 10
    }
  ]
}'
```

## Supported Request Types

### 1. Onboarding
**Keywords**: onboarding, onboard, new hire, new employee, new user, starting employee, first day

**Catalog Items**:
- HR - Employee Onboarding Request
- Employee Onboarding
- New Employee Setup
- New Hire Request

### 2. Termination
**Keywords**: termination, terminate, terminated, employee leaving, last day, resignation, quit, fired

**Catalog Items**:
- HR - Employee Termination Request
- Employee Termination
- Employee Offboarding
- User Termination

### 3. Offboarding
**Keywords**: offboarding, offboard, deactivate user, disable account, remove access, revoke access

**Catalog Items**:
- HR - Employee Offboarding Request
- Employee Offboarding
- User Deactivation
- Access Removal

### 4. New Account
**Keywords**: new account, create account, account creation, setup account, add user, provision user

**Catalog Items**:
- HR - New Account Request
- New User Account
- Account Creation Request
- User Provisioning

### 5. Account Modification
**Keywords**: account modification, account change, modify user, update user, change permissions

**Catalog Items**:
- HR - Account Modification Request
- User Account Modification
- Access Modification
- Permission Change Request

### 6. Transfer
**Keywords**: transfer, transferring, department change, role change, moving departments

**Catalog Items**:
- HR - Employee Transfer Request
- Employee Transfer
- Department Transfer
- Role Change Request

## Message Templates

Each request type has a professional, helpful message template that includes:

- **Greeting**: Friendly acknowledgment
- **Explanation**: Clear reason for redirect
- **Catalog Links**: Direct links to appropriate catalog items
- **Benefits**: Why using the catalog is better
- **Required Information**: What fields they'll need to fill out
- **Contact Info**: How to get help if needed
- **Confidence Score**: Transparency about automated decision

### Example Message (Onboarding)

```
Hello,

Thank you for contacting IT Support regarding a new employee onboarding request.

To ensure your request is processed efficiently with all required information, please submit this through our dedicated HR Request catalog:

📋 **Employee Onboarding Request**
   • HR - Employee Onboarding Request
     https://yourinstance.service-now.com/sp?id=sc_cat_item&sys_id=abc123

**Why use the catalog?**
✅ Faster processing with automated routing
✅ Ensures all required fields are captured
✅ Direct routing to specialized onboarding team
✅ Better tracking and reporting
✅ Reduces back-and-forth communication

**What information will be needed?**
• Employee name and contact details
• Start date and department
• Job title and manager
• Required system access and equipment
• Additional special requirements

This case (SCS0048402) has been closed. Please resubmit using the catalog link above.

If you need assistance completing the form or have questions, please contact your IT Support team at support@company.com.

Thank you for your cooperation in helping us maintain an efficient support process!

---
*This is an automated redirect. Confidence: 85%*
```

## Testing

### Test Detection Without Closing Cases

```typescript
import { getCatalogRedirectHandler } from './lib/services/catalog-redirect-handler';

const handler = getCatalogRedirectHandler();

const testResult = await handler.testRedirect({
  shortDescription: 'New employee onboarding for John Smith',
  description: 'We have a new hire starting next week and need to setup their account',
  category: 'User Access',
});

console.log('Would redirect:', testResult.wouldRedirect);
console.log('Request type:', testResult.detection.requestType);
console.log('Confidence:', testResult.detection.confidence);
console.log('Matched keywords:', testResult.detection.matchedKeywords);
console.log('Message:', testResult.message);
```

### Test End-to-End via Webhook

1. Enable catalog redirect in environment:
```bash
CATALOG_REDIRECT_ENABLED=true
CATALOG_REDIRECT_AUTO_CLOSE=false  # Test mode - don't close yet
```

2. Send test webhook with HR keywords:
```bash
curl -X POST https://your-app.vercel.app/api/servicenow-webhook \
  -H "x-api-key: $SERVICENOW_WEBHOOK_SECRET" \
  -H "content-type: application/json" \
  -d '{
    "case_number": "TEST001",
    "sys_id": "test-sys-id",
    "short_description": "New employee onboarding request",
    "description": "We need to setup a new hire starting Monday"
  }'
```

3. Check response for catalog redirect:
```json
{
  "success": true,
  "case_number": "TEST001",
  "catalogRedirected": true,
  "catalogRedirectReason": "HR request detected and redirected to catalog. Work note added.",
  "catalogItemsProvided": 1
}
```

4. Verify work note was added to ServiceNow case

## Metrics and Reporting

### Database-Backed Metrics

All redirect activity is automatically tracked in the `catalog_redirect_log` table. Use the `ClientSettingsRepository` to access rich metrics:

#### Redirect Metrics

```typescript
const repo = getClientSettingsRepository();
const metrics = await repo.getRedirectMetrics('acme-corp', 30); // Last 30 days

// Available metrics:
interface RedirectMetrics {
  clientId: string;
  clientName: string;
  totalRedirects: number;                              // Total redirect count
  redirectsByType: Record<string, number>;             // Breakdown by request type
  averageConfidence: number;                           // Average detection confidence
  autoClosedCount: number;                             // How many were auto-closed
  autoClosedRate: number;                              // % that were auto-closed
  topKeywords: Array<{keyword: string; count: number}>; // Most common keywords
  topSubmitters: Array<{submitter: string; count: number}>; // Most frequent users
  redirectsByDay: Array<{date: string; count: number}>; // Daily trend data
}
```

#### Recent Activity

```typescript
// Get last 50 redirects for a client
const recent = await repo.getRecentRedirects('acme-corp', 50);

recent.forEach(redirect => {
  console.log({
    case: redirect.caseNumber,
    type: redirect.requestType,
    confidence: redirect.confidence,
    submitter: redirect.submittedBy,
    closed: redirect.caseClosed,
    catalogItems: redirect.catalogItemNames,
    when: redirect.redirectedAt,
  });
});
```

#### Repeat Offenders

Identify users who need training:

```typescript
// Find users with 3+ redirects in last 30 days
const offenders = await repo.getRepeatOffenders('acme-corp', 30, 3);

offenders.forEach(offender => {
  console.log(`${offender.submitter}: ${offender.redirectCount} redirects`);
  // Send training reminder or notify manager
});
```

#### Track These Key Metrics

- **Redirect Rate**: % of HR cases that get redirected
- **Request Type Distribution**: Which HR request types are most common
- **Compliance Over Time**: Are redirects decreasing as users learn?
- **Common Violators**: Which teams/users need additional training
- **Confidence Distribution**: Are we catching the right cases?
- **Auto-Close Effectiveness**: Is auto-close reducing workload?

### Logging

All redirect activity is logged with structured data:

```
[CatalogRedirect] Detection for SCS0048402: isHR=true, type=onboarding, confidence=85%, keywords=onboarding, new hire
[CatalogRedirect] Catalog redirect successful for SCS0048402: 1 catalog items provided, case closed: true
[ClientSettingsRepository] Logged redirect for case SCS0048402
[Case Triage] Completed triage for SCS0048402: User Access (85% confidence) in 2500ms | Redirected to catalog (1 items)
```

### Database Schema

The following tables track all redirect activity:

```sql
-- Client-specific settings
CREATE TABLE client_settings (
  id SERIAL PRIMARY KEY,
  client_id TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  catalog_redirect_enabled BOOLEAN DEFAULT true NOT NULL,
  catalog_redirect_confidence_threshold REAL DEFAULT 0.5 NOT NULL,
  catalog_redirect_auto_close BOOLEAN DEFAULT false NOT NULL,
  support_contact_info TEXT,
  custom_catalog_mappings JSONB DEFAULT '[]'::jsonb NOT NULL,
  features JSONB DEFAULT '{}'::jsonb NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

-- Redirect activity log
CREATE TABLE catalog_redirect_log (
  id SERIAL PRIMARY KEY,
  case_number TEXT NOT NULL,
  case_sys_id TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT,
  request_type TEXT NOT NULL,
  confidence REAL NOT NULL,
  confidence_threshold REAL NOT NULL,
  catalog_items_provided INTEGER NOT NULL,
  catalog_item_names JSONB DEFAULT '[]'::jsonb NOT NULL,
  case_closed BOOLEAN NOT NULL,
  close_state TEXT,
  matched_keywords JSONB DEFAULT '[]'::jsonb NOT NULL,
  submitted_by TEXT,
  short_description TEXT,
  category TEXT,
  subcategory TEXT,
  redirected_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX idx_redirect_case_number ON catalog_redirect_log(case_number);
CREATE INDEX idx_redirect_client_id ON catalog_redirect_log(client_id);
CREATE INDEX idx_redirect_request_type ON catalog_redirect_log(request_type);
CREATE INDEX idx_redirect_redirected_at ON catalog_redirect_log(redirected_at);
```

## Best Practices

### 1. Start Conservative

Begin with:
- `CATALOG_REDIRECT_AUTO_CLOSE=false` (just add work notes)
- `CATALOG_REDIRECT_CONFIDENCE_THRESHOLD=0.7` (high confidence only)

Monitor results, then gradually enable auto-close and lower threshold.

### 2. Communicate with Users

Before enabling:
1. Send announcement email about new process
2. Update internal documentation
3. Train HR teams on proper catalog usage
4. Set expectations about automated redirects

### 3. Monitor and Adjust

Weekly review:
- Check cases that were redirected
- Look for false positives (incorrectly redirected)
- Look for false negatives (should have been redirected but weren't)
- Adjust keywords and confidence threshold as needed

### 4. Escalation Path

For repeat violators (3+ redirects in 7 days):
1. Send automated Slack DM with training resources
2. Notify their manager after 5+ violations
3. Schedule training session for persistent issues

### 5. Catalog Item Naming

Ensure your ServiceNow catalog items have clear, consistent names:
- ✅ "HR - Employee Onboarding Request"
- ❌ "Onboarding"
- ❌ "HR Request"

## Troubleshooting

### Cases Not Being Redirected

**Problem**: Catalog redirect is enabled but cases aren't being redirected

**Solutions**:
1. Check confidence threshold:
   ```bash
   # Lower threshold for testing
   CATALOG_REDIRECT_CONFIDENCE_THRESHOLD=0.3
   ```

2. Check logs for detection results:
   ```
   [CatalogRedirect] Detection for SCS0048402: isHR=false, ...
   ```

3. Add custom keywords for your organization's terminology

4. Verify catalog items exist in ServiceNow with correct names

### False Positives

**Problem**: Non-HR cases are being redirected

**Solutions**:
1. Raise confidence threshold:
   ```bash
   CATALOG_REDIRECT_CONFIDENCE_THRESHOLD=0.7
   ```

2. Review matched keywords in logs
3. Refine keyword lists to be more specific
4. Add negative keywords (future enhancement)

### Catalog Items Not Found

**Problem**: Redirect detects HR request but can't find catalog items

**Solutions**:
1. Verify catalog item names match exactly
2. Check catalog items are marked as "active" in ServiceNow
3. Verify ServiceNow credentials have permission to read catalog
4. Add custom catalog item mappings via `HR_REQUEST_DETECTOR_CONFIG`

### Messages Not Professional Enough

**Problem**: Closure messages need customization for your organization

**Solutions**:
1. Edit message templates in `lib/services/catalog-redirect-handler.ts`
2. Update `SUPPORT_CONTACT_INFO` environment variable
3. Customize per-client via configuration overrides (future enhancement)

## Roadmap

### Phase 2 Enhancements

- [ ] Database tracking for metrics and reporting
- [ ] Slack notifications to HR managers for repeat violations
- [ ] Per-client catalog item mappings
- [ ] Negative keywords (exclude certain cases from redirect)
- [ ] Machine learning confidence scoring
- [ ] Automated training reminders
- [ ] Dashboard for redirect analytics

### Phase 3 Features

- [ ] Multi-language support for messages
- [ ] Custom message templates per client
- [ ] Integration with HR systems for validation
- [ ] Automatic catalog item discovery
- [ ] A/B testing for message effectiveness

## Support

For questions or issues with the catalog redirect system:

1. Check logs for detailed error messages
2. Review this guide for configuration options
3. Test with `testRedirect()` to debug detection
4. Contact the development team with:
   - Case number
   - Detection results from logs
   - Expected vs actual behavior

## Examples

### Example 1: Basic Onboarding Redirect

**Input Case**:
- **Short Description**: "Setup new employee account"
- **Description**: "We have a new hire John Smith starting Monday"
- **Result**: ✅ Redirected to HR - Employee Onboarding Request (confidence: 78%)

### Example 2: Termination Redirect

**Input Case**:
- **Short Description**: "User leaving company - disable account"
- **Description**: "Employee Jane Doe last day is Friday, please deactivate all access"
- **Result**: ✅ Redirected to HR - Employee Termination Request (confidence: 92%)

### Example 3: Low Confidence - No Redirect

**Input Case**:
- **Short Description**: "Password reset"
- **Description**: "User can't login, need password reset"
- **Result**: ❌ Not redirected (confidence: 5%, no HR keywords)

### Example 4: Incident Takes Priority

**Input Case**:
- **Short Description**: "New hire - VPN down"
- **Description**: "Onboarding new employee but VPN is completely down, nobody can connect"
- **Result**: ⚠️ Not redirected (service disruption detected, Incident created instead)

---

**Version**: 1.0
**Last Updated**: 2025-10-13
**Author**: AI SDK Slackbot Development Team
