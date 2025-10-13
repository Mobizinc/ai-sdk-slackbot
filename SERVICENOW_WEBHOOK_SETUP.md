# ServiceNow Webhook Setup Guide

**Purpose:** Configure ServiceNow to send case webhooks to your Vercel deployment
**Security:** HMAC-SHA256 signature validation
**Date:** 2025-10-13

---

## Overview

The webhook endpoint uses **HMAC-SHA256 signature validation** to ensure webhooks come from ServiceNow and haven't been tampered with.

**Security Flow:**
```
ServiceNow → Signs payload with secret → Sends webhook with signature header
    ↓
Vercel Endpoint → Verifies signature with same secret → Processes if valid
```

---

## Step 1: Generate Webhook Secret

Generate a strong random secret key:

```bash
# On Mac/Linux:
openssl rand -base64 32

# Example output:
# Jx7Kp9mN2vQ8rL4wE6tY1uI3oP5aS0dF7gH9jK2lM4nB8cV6xZ1qW3eR5tY7uI9
```

**Save this secret** - you'll need it for both ServiceNow AND Vercel.

---

## Step 2: Configure Vercel Environment Variables

### In Vercel Dashboard:

1. Go to: **Your Project → Settings → Environment Variables**

2. Add the webhook secret:

```bash
Name: SERVICENOW_WEBHOOK_SECRET
Value: <your-generated-secret-from-step-1>
Environment: Production, Preview, Development (select all)
```

3. Add other required variables (if not already set):

```bash
# ServiceNow API Credentials (for writing work notes back)
Name: SERVICENOW_URL
Value: https://mobiz.service-now.com

Name: SERVICENOW_USERNAME
Value: SVC.Mobiz.Integration.TableAPI.PROD

Name: SERVICENOW_PASSWORD
Value: <your-servicenow-password>

Name: SERVICENOW_CASE_TABLE
Value: x_mobit_serv_case_service_case

# Azure AI Search (for similar cases)
Name: AZURE_SEARCH_ENDPOINT
Value: https://search-sharedservices-rag.search.windows.net

Name: AZURE_SEARCH_KEY
Value: <your-azure-search-key>

Name: AZURE_SEARCH_INDEX_NAME
Value: case-intelligence-prod

# OpenAI (for embeddings - enables vector search)
Name: OPENAI_API_KEY
Value: <your-openai-key>

# Database (for caching)
Name: DATABASE_URL
Value: postgresql://user:password@host/db?sslmode=require

# Feature flags
Name: ENABLE_CASE_CLASSIFICATION
Value: true

Name: CASE_CLASSIFICATION_WRITE_NOTES
Value: true

Name: CASE_CLASSIFICATION_MAX_RETRIES
Value: 3
```

4. **Redeploy** after adding variables:
```bash
vercel --prod
```

---

## Step 3: Configure ServiceNow Business Rule / Flow

You need to configure ServiceNow to send webhooks when cases are created/updated.

### Option A: ServiceNow Flow Designer (Recommended)

**1. Create a Flow:**

Go to: **Flow Designer → New → Flow**

- Name: `Case Classification Webhook Trigger`
- Trigger: When a record is created or updated
- Table: `sn_customerservice_case` (or your case table)

**2. Add Trigger Conditions:**

```
Conditions:
- State is "New" OR State is "In Progress"
- Assignment Group is not empty
```

**3. Add REST Step:**

- Action: **REST → Post to External Endpoint**
- Endpoint URL: `https://your-app.vercel.app/api/servicenow-webhook`
- HTTP Method: **POST**
- Content Type: **application/json**

**4. Configure Request Headers:**

Add header to send the HMAC signature:

**Header Name:** `x-servicenow-signature`
**Header Value:** Use a Script step to generate the signature

**5. Add Script Step (Before REST step):**

```javascript
// Calculate HMAC-SHA256 signature
(function execute(inputs, outputs) {
    var GlideEncrypter = new GlideEncrypter();
    var payload = JSON.stringify(inputs.payload);
    var secret = '<YOUR-WEBHOOK-SECRET-FROM-STEP-1>';

    // Generate HMAC-SHA256 signature
    var hmac = GlideEncrypter.getHMAC('HmacSHA256', payload, secret);

    outputs.signature = hmac;
})(inputs, outputs);
```

**Note:** Replace `<YOUR-WEBHOOK-SECRET-FROM-STEP-1>` with the actual secret

**6. Configure Request Body:**

Map case fields to JSON payload:

```json
{
  "case_number": "${trigger.number}",
  "sys_id": "${trigger.sys_id}",
  "short_description": "${trigger.short_description}",
  "description": "${trigger.description}",
  "priority": "${trigger.priority}",
  "urgency": "${trigger.urgency}",
  "impact": "${trigger.impact}",
  "category": "${trigger.category}",
  "subcategory": "${trigger.subcategory}",
  "state": "${trigger.state}",
  "assignment_group": "${trigger.assignment_group.name}",
  "assignment_group_sys_id": "${trigger.assignment_group.sys_id}",
  "assigned_to": "${trigger.assigned_to.name}",
  "caller_id": "${trigger.caller_id.name}",
  "contact_type": "${trigger.contact_type}",
  "company": "${trigger.company.sys_id}",
  "account_id": "${trigger.account.sys_id}",
  "opened_at": "${trigger.opened_at}",
  "configuration_item": "${trigger.configuration_item.name}",
  "business_service": "${trigger.business_service.name}"
}
```

---

### Option B: ServiceNow Business Rule (Alternative)

**1. Create Business Rule:**

Go to: **System Definition → Business Rules → New**

- Name: `Case Classification Webhook`
- Table: `sn_customerservice_case`
- When: `after` insert or update
- Filter Conditions: State is "New" OR State is "In Progress"

**2. Add Script:**

```javascript
(function executeRule(current, previous /*null when async*/) {
    try {
        // Webhook configuration
        var webhookUrl = 'https://your-app.vercel.app/api/servicenow-webhook';
        var webhookSecret = '<YOUR-WEBHOOK-SECRET-FROM-STEP-1>';

        // Build payload
        var payload = {
            case_number: current.getValue('number'),
            sys_id: current.getValue('sys_id'),
            short_description: current.getValue('short_description'),
            description: current.getValue('description'),
            priority: current.getValue('priority'),
            urgency: current.getValue('urgency'),
            impact: current.getValue('impact'),
            category: current.category.getDisplayValue(),
            subcategory: current.subcategory.getDisplayValue(),
            state: current.state.getDisplayValue(),
            assignment_group: current.assignment_group.getDisplayValue(),
            assignment_group_sys_id: current.getValue('assignment_group'),
            assigned_to: current.assigned_to.getDisplayValue(),
            caller_id: current.caller_id.getDisplayValue(),
            contact_type: current.getValue('contact_type'),
            company: current.getValue('company'),
            account_id: current.getValue('account'),
            opened_at: current.getValue('opened_at'),
            configuration_item: current.configuration_item.getDisplayValue(),
            business_service: current.business_service.getDisplayValue()
        };

        var payloadJson = JSON.stringify(payload);

        // Generate HMAC signature
        var encrypter = new GlideEncrypter();
        var signature = encrypter.getHMAC('HmacSHA256', payloadJson, webhookSecret);

        // Send webhook
        var request = new sn_ws.RESTMessageV2();
        request.setEndpoint(webhookUrl);
        request.setHttpMethod('POST');
        request.setRequestHeader('Content-Type', 'application/json');
        request.setRequestHeader('x-servicenow-signature', signature);
        request.setRequestBody(payloadJson);

        var response = request.execute();
        var httpStatus = response.getStatusCode();

        gs.info('[Case Classification] Webhook sent for case ' + current.getValue('number') +
                ', response: ' + httpStatus);

        if (httpStatus != 200) {
            gs.error('[Case Classification] Webhook failed: ' + response.getBody());
        }

    } catch (e) {
        gs.error('[Case Classification] Webhook error: ' + e.message);
    }

})(current, previous);
```

**Note:** Replace:
- `your-app.vercel.app` with your actual Vercel URL
- `<YOUR-WEBHOOK-SECRET-FROM-STEP-1>` with the actual secret

---

## Step 4: Test the Webhook

### Test from ServiceNow

**1. Create or update a test case in ServiceNow**

**2. Check ServiceNow System Logs:**

Go to: **System Logs → Application Logs**

Look for:
```
[Case Classification] Webhook sent for case SCS0048536, response: 200
```

**3. Check Vercel Logs:**

```bash
vercel logs --follow
```

Look for:
```
[Webhook] Received webhook for case SCS0048536
[Azure Search] Vector search across ALL clients
[Azure Search] Found 5 similar cases
[Webhook] Case SCS0048536 classified as Hardware > Timeclock
```

**4. Verify in ServiceNow Case:**

Check the case work notes - should see:

```
[AI Classification]
━━━ AI TRIAGE ━━━
Hardware | 🟡 Medium | 82% confidence

NEXT STEPS:
1. Prerequisite: Confirm device model...
2. Check power indicators...

📚 SIMILAR CASES (5 found):
1. SCS0043556 [Neighbors] - RHONDA SETH... (Score: 0.68)
2. SCS0045478 [Exceptional] - SCANNER... (Score: 0.65)
...
```

---

## Security Best Practices

### 1. Rotate Webhook Secret Regularly

Every 90 days:
```bash
# Generate new secret
openssl rand -base64 32

# Update in:
# 1. Vercel environment variables
# 2. ServiceNow webhook configuration
# 3. Redeploy both
```

### 2. Monitor for Invalid Signatures

Check Vercel logs for:
```
[Webhook] Invalid webhook signature received
```

This indicates:
- Someone trying to spoof webhooks
- ServiceNow using wrong secret
- Secret mismatch between systems

### 3. Use HTTPS Only

Vercel automatically provides HTTPS, but ensure ServiceNow is configured to use `https://` URL.

---

## Troubleshooting

### Webhook Returns 401 "Invalid signature"

**Cause:** Secret mismatch or signature calculation issue

**Fix:**
1. Verify secret matches in both Vercel and ServiceNow
2. Check ServiceNow is using HMAC-SHA256 (not SHA1 or MD5)
3. Ensure payload is stringified before signing
4. Check header name is `x-servicenow-signature`

**Test Signature Locally:**

```bash
# Calculate expected signature
echo -n '{"case_number":"TEST"}' | openssl dgst -sha256 -hmac "your-secret" | cut -d' ' -f2

# Should match what ServiceNow sends
```

### Webhook Returns 422 "Invalid webhook payload schema"

**Cause:** Missing required fields or wrong field types

**Fix:**
1. Check ServiceNow is sending `case_number`, `sys_id`, `short_description` (required)
2. Verify field names match (use snake_case: `case_number`, not `caseNumber`)
3. Check payload structure in Vercel logs

### Webhook Returns 503 "Case classification is disabled"

**Cause:** Feature flag not set

**Fix:**
```bash
# In Vercel, set:
ENABLE_CASE_CLASSIFICATION=true
```

### ServiceNow Shows "Connection Refused" or Timeout

**Cause:** Vercel URL not accessible or function timeout

**Fix:**
1. Verify Vercel URL is public: `https://your-app.vercel.app`
2. Test endpoint: `curl https://your-app.vercel.app/api/servicenow-webhook`
3. Check Vercel function timeout settings (max 60s for Pro, 10s for Hobby)

---

## What ServiceNow Needs from You

### 1. Webhook Endpoint URL

```
https://your-app.vercel.app/api/servicenow-webhook
```

**Get this after deployment:**
```bash
vercel --prod
# Returns: https://your-app-xyz.vercel.app
```

### 2. Shared Secret Key

The secret you generated in Step 1:
```
Example: Jx7Kp9mN2vQ8rL4wE6tY1uI3oP5aS0dF7gH9jK2lM4nB8cV6xZ1qW3eR5tY7uI9
```

**Security:** Store in ServiceNow securely (encrypted property or credential store)

### 3. Signature Header Name

```
x-servicenow-signature
```

### 4. Signature Algorithm

```
HMAC-SHA256 (hex-encoded lowercase)
```

### 5. What to Sign

```
The raw request body as a string (before parsing JSON)
```

---

## What You Need to Configure in Vercel

### Required Environment Variables

```bash
# Webhook Security
SERVICENOW_WEBHOOK_SECRET=<your-generated-secret>

# Feature Flag
ENABLE_CASE_CLASSIFICATION=true
CASE_CLASSIFICATION_WRITE_NOTES=true
```

### Optional but Recommended

```bash
# Retry configuration
CASE_CLASSIFICATION_MAX_RETRIES=3

# Workflow routing (for future)
# CASE_WORKFLOW_ROUTING={"rules":[],"defaultWorkflowId":"tech_triage"}
```

---

## Test Without Signature (Development Only)

For testing, you can temporarily disable signature validation:

**In Vercel (Development environment only):**
```bash
# DON'T set SERVICENOW_WEBHOOK_SECRET
# Webhook will skip signature validation and log a warning
```

**Warning:** Never do this in production!

---

## Example ServiceNow REST Message Configuration

If using REST Message instead of Flow:

**1. Create REST Message:**

Go to: **System Web Services → Outbound → REST Message → New**

- Name: `Case Classification Webhook`
- Endpoint: `https://your-app.vercel.app`
- Authentication: None (using HMAC instead)

**2. Create HTTP Method:**

- Name: `classify_case`
- HTTP Method: POST
- Endpoint: `${endpoint}/api/servicenow-webhook`
- HTTP Headers:
  ```
  Content-Type: application/json
  x-servicenow-signature: ${signature}
  ```

**3. Add Variable Substitutions:**

- Variable: `signature`
- Escape: None
- Test Value: `test-signature`

**4. Use in Business Rule:**

```javascript
(function executeRule(current, previous) {
    var payload = { /* ... build payload ... */ };
    var payloadJson = JSON.stringify(payload);

    // Generate signature
    var encrypter = new GlideEncrypter();
    var signature = encrypter.getHMAC('HmacSHA256', payloadJson, 'YOUR-SECRET');

    // Send via REST Message
    var rm = new sn_ws.RESTMessageV2('Case Classification Webhook', 'classify_case');
    rm.setStringParameterNoEscape('signature', signature);
    rm.setRequestBody(payloadJson);

    var response = rm.execute();
    gs.info('Webhook response: ' + response.getStatusCode());

})(current, previous);
```

---

## Verification Checklist

Before going live:

- [ ] Webhook secret generated (32+ characters)
- [ ] Secret added to Vercel environment variables
- [ ] Secret added to ServiceNow configuration
- [ ] Vercel deployed with new environment variables
- [ ] Test webhook sent from ServiceNow
- [ ] Vercel logs show successful processing
- [ ] ServiceNow case has AI classification work note
- [ ] Signature validation working (no 401 errors)

---

## Quick Reference

| Item | Value |
|------|-------|
| **Webhook URL** | `https://your-app.vercel.app/api/servicenow-webhook` |
| **HTTP Method** | POST |
| **Content-Type** | application/json |
| **Signature Header** | `x-servicenow-signature` |
| **Signature Algorithm** | HMAC-SHA256 (hex) |
| **What to Sign** | Raw request body (JSON string) |
| **Required Fields** | `case_number`, `sys_id`, `short_description` |
| **Optional Fields** | 17+ additional fields (see schema) |

---

## ServiceNow Webhook Payload Example

**Minimal payload:**
```json
{
  "case_number": "SCS0048536",
  "sys_id": "abc123def456",
  "short_description": "Timeclock not working at Pearland"
}
```

**Recommended payload (includes all context):**
```json
{
  "case_number": "SCS0048536",
  "sys_id": "abc123def456",
  "short_description": "Timeclock not working at Pearland",
  "description": "Time clock device not responding. Cables connected.",
  "priority": "3",
  "urgency": "2",
  "impact": "3",
  "category": "Hardware",
  "subcategory": "Timeclock",
  "state": "New",
  "assignment_group": "L2 Support",
  "assignment_group_sys_id": "group123",
  "assigned_to": "john.doe",
  "caller_id": "user456",
  "company": "company-sys-id",
  "account_id": "account-sys-id",
  "configuration_item": "CI-TIMECLOCK-01",
  "business_service": "Time Management"
}
```

**More fields = better classification context!**

---

## Testing the Signature

**Test signature generation:**

```bash
# Your secret
SECRET="your-webhook-secret-here"

# Test payload
PAYLOAD='{"case_number":"TEST001","sys_id":"test123","short_description":"Test"}'

# Generate signature (what ServiceNow should send)
echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2

# Example output:
# a1b2c3d4e5f6...
```

**Test webhook with curl:**

```bash
SECRET="your-webhook-secret-here"
PAYLOAD='{"case_number":"TEST001","sys_id":"test123","short_description":"Test case"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -X POST https://your-app.vercel.app/api/servicenow-webhook \
  -H "Content-Type: application/json" \
  -H "x-servicenow-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

**Expected response:** 200 OK with classification result

---

## Security Notes

### What's Protected

✅ **Webhook integrity** - HMAC ensures payload hasn't been tampered with
✅ **Source authentication** - Only ServiceNow knows the secret
✅ **Replay attack prevention** - Duplicate detection via classification cache

### What's NOT Protected

⚠️ **Secret stored in ServiceNow script** - Consider using ServiceNow Credential Store
⚠️ **No timestamp validation** - Could add event_time checking for extra security
⚠️ **No IP whitelisting** - Could add Vercel IP restrictions

### Recommended Enhancements

1. **Use ServiceNow Credential Store:**
```javascript
var cred = new GlideCredential('webhook_secret');
var secret = cred.getPassword();
```

2. **Add Timestamp Validation:**
```javascript
// In webhook payload
"event_time": "2025-10-13T12:34:56Z"

// In webhook handler, reject if > 5 minutes old
```

3. **Add IP Whitelisting in Vercel:**

Vercel Pro: Configure IP whitelist for ServiceNow IP range

---

**Need Help?** Contact your ServiceNow administrator to configure the webhook trigger.
