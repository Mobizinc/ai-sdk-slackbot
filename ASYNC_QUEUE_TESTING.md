# Async Queue Testing Guide

## Overview
This document provides testing procedures for the async queue architecture implemented to handle ServiceNow webhook processing.

## Architecture Summary

```
ServiceNow → /api/servicenow-webhook → QStash Queue → /api/workers/process-case → Case Triage → ServiceNow Update
              ↓ 202 Accepted                          ↓ Async Processing
```

**Key Benefits:**
- No timeout constraints (webhook returns immediately)
- Built-in retry logic (3x with exponential backoff)
- Idempotency (prevents duplicate work from retries)
- Graceful degradation (falls back to sync if QStash fails)

## Environment Variables

### Required for Async Mode
```bash
# Feature flags
# ENABLE_ASYNC_TRIAGE is ON by default (omit or set to 'false' to disable)
ENABLE_CASE_CLASSIFICATION=true     # Master switch for classification

# QStash Configuration (already configured in .env.local)
QSTASH_TOKEN=eyJVc2VySUQiOiJjNTRlMDVmNS0yMWJhLTRkYzYtOGY2NS05OTFjMzcwNGM2OTIiLCJQYXNzd29yZCI6Ijg0MTNiNTZhYzE1MzRlNGJiYTViNDlmMzZmMTRjYjM5In0=
QSTASH_CURRENT_SIGNING_KEY=sig_5HVwS3ERt1cwUirw5SYVUMdPpeXW
QSTASH_NEXT_SIGNING_KEY=sig_4rYAFHd5gg4xn1wTZhVwYwQrUcGC

# Worker URL is auto-detected from VERCEL_URL (no configuration needed)
```

## Testing Phases

### Phase 1: Sync Mode Validation (Optional - Async is default)
**Objective:** Verify sync processing still works if explicitly disabled

**Steps:**
1. Set `ENABLE_ASYNC_TRIAGE=false` in Vercel environment
2. Send test webhook to `/api/servicenow-webhook`
3. Expect 200 response with full classification result
4. Verify ServiceNow update occurred
5. Check logs for timing: `[Webhook] Case SCS0048870 classified as...`

**Expected Behavior:**
- HTTP 200 with classification data
- Processing time < 180s (with new timeouts)
- ServiceNow work notes updated

### Phase 2: Async Mode - Happy Path (Default Mode)
**Objective:** Verify async processing works end-to-end

**Steps:**
1. Ensure `ENABLE_ASYNC_TRIAGE` is NOT set to 'false' (async is on by default)
2. Deploy to Vercel
3. Send test webhook:
```bash
curl -X POST "https://slack.mobiz.solutions/api/servicenow-webhook?code=55fe003e06c02ae2ec4b553d38396dab" \
  -H "Content-Type: application/json" \
  -d '{
    "case_number": "SCS0048870",
    "sys_id": "test-sys-id-001",
    "short_description": "Test async queue processing",
    "description": "User cannot access email on mobile device",
    "priority": "3",
    "state": "New"
  }'
```

4. Expect 202 Accepted response:
```json
{
  "success": true,
  "queued": true,
  "case_number": "SCS0048870",
  "message": "Case queued for async processing"
}
```

5. Check QStash dashboard: https://console.upstash.com/qstash
   - Verify message was enqueued
   - Monitor message processing status

6. Poll for completion:
```bash
curl "https://slack.mobiz.solutions/api/case-status/SCS0048870"
```

7. Expected response (once processed):
```json
{
  "status": "completed",
  "case_number": "SCS0048870",
  "classified_at": "2025-10-14T...",
  "age_minutes": 2,
  "is_recent": true,
  "classification": {
    "category": "Service Request",
    "subcategory": "Mobile Device Support",
    "confidence_score": 0.92,
    "reasoning": "...",
    "quick_summary": "...",
    "immediate_next_steps": ["..."]
  },
  "processing_time_ms": 15234
}
```

**Expected Logs:**
```
[Webhook] Received webhook for case SCS0048870 (test-sys-id-001)
[Webhook] Enqueueing case SCS0048870 to https://slack.mobiz.solutions/api/workers/process-case
[Webhook] Case SCS0048870 queued successfully (async mode)

[Worker] Processing case SCS0048870 (QStash message: msg_xxx)
[Case Triage] Starting case triage for SCS0048870
[Case Triage] Case SCS0048870 classified as Service Request > Mobile Device Support (92% confidence) in 15234ms
[Worker] Case SCS0048870 processed successfully in 15234ms
```

### Phase 3: Idempotency Test
**Objective:** Verify duplicate webhooks don't cause duplicate work

**Steps:**
1. Send same webhook 3 times within 5 minutes
2. QStash will deliver all 3 messages to worker
3. First message: Full processing
4. Second/third messages: Return cached result (idempotency guard)

**Expected Behavior:**
- First request: Full AI classification
- Subsequent requests within 5min: Return cached result
- Log: `[Case Triage] Idempotency check: SCS0048870 was processed 45s ago - returning cached result`

### Phase 4: Failure & Retry Test
**Objective:** Verify QStash retry logic handles transient failures

**Steps:**
1. Temporarily break worker (e.g., set wrong DATABASE_URL)
2. Send test webhook
3. Worker returns 500 error
4. QStash automatically retries (3x with exponential backoff)
5. Fix database connection
6. Next retry succeeds

**Expected Behavior:**
- QStash retries: 1min, 5min, 15min
- Dead letter queue after 3 failures
- Success after fix

### Phase 5: Fallback Test
**Objective:** Verify graceful degradation if QStash unavailable

**Steps:**
1. Temporarily remove QSTASH_TOKEN from environment
2. Send test webhook
3. Should fall back to sync processing

**Expected Logs:**
```
[Webhook] Failed to enqueue to QStash: QStash client not initialized
[Webhook] Falling back to synchronous processing
[Webhook] Case SCS0048870 classified as... (sync mode)
```

**Expected Behavior:**
- HTTP 200 (not 202)
- Sync processing occurs
- Classification result returned immediately

### Phase 6: Observability Test
**Objective:** Verify monitoring endpoints provide useful metrics

**Steps:**
1. Check queue stats:
```bash
curl "https://slack.mobiz.solutions/api/admin/queue-stats"
```

2. Expected response:
```json
{
  "queue_config": {
    "async_triage_enabled": true,
    "qstash_enabled": true,
    "qstash_configured": true,
    "worker_url": "https://slack.mobiz.solutions"
  },
  "stats_7d": {
    "total_classifications": 45,
    "average_processing_time_ms": 12500,
    "average_confidence": 88,
    "top_workflows": [
      {"workflowId": "standard", "count": 30},
      {"workflowId": "incident-conversion", "count": 15}
    ]
  },
  "stats_24h": {
    "total_classifications": 12,
    "average_processing_time_ms": 11800,
    "average_confidence": 90
  },
  "recent_performance": {
    "sample_size": 20,
    "avg_processing_time_ms": 12200,
    "min_processing_time_ms": 8500,
    "max_processing_time_ms": 18900,
    "failure_count": 0,
    "failure_rate": 0
  },
  "recent_classifications": [
    {
      "case_number": "SCS0048870",
      "workflow_id": "standard",
      "processing_time_ms": 12100,
      "confidence_score": 92,
      "classified_at": "2025-10-14T...",
      "age_minutes": 5
    }
  ],
  "timestamp": "2025-10-14T..."
}
```

3. Check webhook health:
```bash
curl "https://slack.mobiz.solutions/api/servicenow-webhook"
```

4. Expected response:
```json
{
  "status": "healthy",
  "classification_enabled": true,
  "connectivity": {
    "azure_search": true,
    "database": true,
    "servicenow": true
  },
  "stats": {
    "total_cases_7d": 45,
    "avg_processing_time_ms": 12500,
    "avg_confidence": 88,
    "cache_hit_rate": 15,
    "top_workflows": [...]
  },
  "timestamp": "2025-10-14T..."
}
```

## Rollout Strategy

### Step 1: Deploy with Async Mode (Default)
```bash
# Async is ON by default - just deploy
vercel --prod
```
- Async mode is enabled automatically (no env var needed)
- Monitor for 1 hour
- Check `/api/admin/queue-stats` for queue health

### Step 2: Verify Async Processing
```bash
# Send test webhook
# Verify async processing works end-to-end
# Check QStash dashboard for message flow
```

### Step 3: Monitor for 24 Hours
- Check `/api/admin/queue-stats` every 4 hours
- Monitor QStash dashboard for failures
- Review Vercel logs for errors
- Verify ServiceNow updates still occurring

### Step 4: Gradual Rollback if Needed (Optional)
If issues arise, disable async mode temporarily:
```bash
# Set ENABLE_ASYNC_TRIAGE=false in Vercel dashboard
# Falls back to sync processing immediately
```

### Step 5: Scale Monitoring
```bash
# Monitor for 48 hours
# Watch for dead letter queue messages
# Track average processing time trends
```

## Success Criteria

✅ **Async Mode:**
- Webhook returns 202 in < 200ms
- Worker processes within 5 minutes
- ServiceNow gets updated
- No duplicate classifications from retries

✅ **Idempotency:**
- Duplicate webhooks within 5min return cached result
- No duplicate work logged

✅ **Retry Logic:**
- Transient failures auto-retry
- Persistent failures go to dead letter queue

✅ **Fallback:**
- QStash unavailable → sync processing
- No webhook failures

✅ **Observability:**
- Queue stats show accurate metrics
- Health check reports connectivity

## Troubleshooting

### Issue: 401 Unauthorized at Worker
**Cause:** QStash signature verification failed
**Fix:** Verify QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY are correct

### Issue: Worker never receives messages
**Cause:** WORKER_BASE_URL misconfigured or QStash can't reach it
**Fix:**
- Verify WORKER_BASE_URL=https://slack.mobiz.solutions (no trailing slash)
- Check Vercel logs for incoming POST to /api/workers/process-case
- Verify QStash dashboard shows delivery attempts

### Issue: Duplicate classifications
**Cause:** Idempotency window too short or not triggering
**Fix:**
- Check database for recent classifications
- Verify idempotency check in case-triage.ts:143-166
- Consider increasing window from 5min to 10min

### Issue: Cases stuck in queue
**Cause:** Worker returning errors
**Fix:**
- Check Vercel worker logs for errors
- Review QStash dead letter queue
- Manually retry from QStash dashboard

## Next Steps After Testing

1. **ServiceNow Callback Implementation** (Optional)
   - Instead of polling, call ServiceNow webhook when complete
   - Add callback URL to worker response
   - Update ServiceNow business rule to handle callback

2. **Advanced Monitoring**
   - Set up Vercel alerts for worker failures
   - Create Slack alerts for dead letter queue
   - Dashboard for queue metrics

3. **Performance Tuning**
   - Adjust retry delays based on average processing time
   - Consider parallel processing for high volume
   - Optimize idempotency window

4. **Cost Optimization**
   - Monitor QStash message volume
   - Review Vercel function invocation costs
   - Consider batching for extremely high volumes

## References

- QStash Dashboard: https://console.upstash.com/qstash
- QStash Documentation: https://upstash.com/docs/qstash
- Vercel Functions: https://vercel.com/docs/functions
- Original Python Implementation: api/app/routers/webhooks.py:379-531
