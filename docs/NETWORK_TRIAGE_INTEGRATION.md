# Network Triage Agent Integration Plan
## Azure Event Grid (Event-Driven Pub/Sub)

---

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Phase 1: Azure Infrastructure Setup](#phase-1-azure-infrastructure-setup)
3. [Phase 2: Network Agent Changes](#phase-2-network-agent-changes)
4. [Phase 3: Slack Bot Changes](#phase-3-slack-bot-changes)
5. [Phase 4: Configure Event Grid Subscriptions](#phase-4-configure-event-grid-subscriptions)
6. [Phase 5: Testing & Validation](#phase-5-testing--validation)
7. [Phase 6: Production Hardening](#phase-6-production-hardening)
8. [Environment Variables](#environment-variables-summary)
9. [Cost Analysis](#cost-analysis)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Event Flow Diagram
```
┌─────────────────────────────────────────────────────────────────────┐
│                         Event-Driven Architecture                    │
└─────────────────────────────────────────────────────────────────────┘

Step 1: Case Detected
┌──────────────────┐
│  Slack Bot       │  User mentions case with network issue
│  (Vercel)        │  "Working on SCS0048536 - cannot browse internet"
└────────┬─────────┘
         │
         ▼ Extract: case number, firewall IP, symptoms

Step 2: Publish Investigation Request
┌──────────────────┐
│ Event Grid Topic │  Event: CaseNetwork.InvestigationRequested
│ "case-events"    │  Data: { caseNumber, firewall_ip, symptoms, ... }
└────────┬─────────┘
         │
         ▼ Webhook delivery (push, not poll)

Step 3: Network Agent Receives & Processes
┌──────────────────────┐
│ Network Triage Agent │  Receives webhook
│ (Container App)      │  Validates Event Grid signature
│                      │  Starts investigation (2-5 min)
└────────┬─────────────┘
         │
         ▼ Investigation complete

Step 4: Publish Investigation Result
┌──────────────────────────┐
│ Event Grid Topic         │  Event: CaseNetwork.InvestigationComplete
│ "investigation-complete" │  Data: { caseNumber, result, slack_metadata }
└────────┬─────────────────┘
         │
         ▼ Webhook delivery

Step 5: Post Results to Slack
┌──────────────────┐
│  Slack Bot       │  Receives webhook
│  (Vercel)        │  Formats triage result
│                  │  Posts to Slack thread
└──────────────────┘
```

### Key Benefits
- ✅ **Push-based**: No polling, instant delivery
- ✅ **Decoupled**: Services don't need to know each other's URLs
- ✅ **Resilient**: Built-in retry with exponential backoff (up to 24 hours)
- ✅ **Scalable**: Handles millions of events
- ✅ **Dead Letter Queue**: Failed events automatically preserved
- ✅ **Low Latency**: Sub-second event delivery

---

## Phase 1: Azure Infrastructure Setup

### 1.1 Create Event Grid Topics

**Prerequisites:**
- Azure subscription
- Azure CLI installed and logged in
- Resource group created

**Commands:**
```bash
# Set variables
RESOURCE_GROUP="rg-network-triage"
LOCATION="eastus"
TOPIC_CASE_EVENTS="topic-case-events"
TOPIC_INVESTIGATION_COMPLETE="topic-investigation-complete"

# Create resource group (if not exists)
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION

# Create Event Grid topic for investigation requests
az eventgrid topic create \
  --name $TOPIC_CASE_EVENTS \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Create Event Grid topic for investigation results
az eventgrid topic create \
  --name $TOPIC_INVESTIGATION_COMPLETE \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Get endpoints and keys (save these!)
echo "=== Case Events Topic ==="
az eventgrid topic show \
  --name $TOPIC_CASE_EVENTS \
  --resource-group $RESOURCE_GROUP \
  --query endpoint \
  --output tsv

az eventgrid topic key list \
  --name $TOPIC_CASE_EVENTS \
  --resource-group $RESOURCE_GROUP \
  --query key1 \
  --output tsv

echo "=== Investigation Complete Topic ==="
az eventgrid topic show \
  --name $TOPIC_INVESTIGATION_COMPLETE \
  --resource-group $RESOURCE_GROUP \
  --query endpoint \
  --output tsv

az eventgrid topic key list \
  --name $TOPIC_INVESTIGATION_COMPLETE \
  --resource-group $RESOURCE_GROUP \
  --query key1 \
  --output tsv
```

**Expected Output:**
```
Case Events Endpoint: https://topic-case-events.eastus-1.eventgrid.azure.net/api/events
Case Events Key: [64-character key]

Investigation Complete Endpoint: https://topic-investigation-complete.eastus-1.eventgrid.azure.net/api/events
Investigation Complete Key: [64-character key]
```

### 1.2 Deploy Network Agent to Azure Container Apps

**Build and Deploy:**
```bash
# Navigate to network agent directory
cd /Users/hamadriaz/Documents/codebase/network-triage/network-triage-agent

# Create Azure Container Registry (if not exists)
ACR_NAME="acrmobiznetwork"
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic

# Build and push Docker image
az acr build \
  --registry $ACR_NAME \
  --image network-triage-agent:latest \
  .

# Create Container App environment
az containerapp env create \
  --name network-triage-env \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Deploy container app with public endpoint
az containerapp create \
  --name network-triage-agent \
  --resource-group $RESOURCE_GROUP \
  --environment network-triage-env \
  --image $ACR_NAME.azurecr.io/network-triage-agent:latest \
  --target-port 8000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --cpu 1.0 \
  --memory 2.0Gi \
  --secrets \
    zhipuai-key=$ZHIPUAI_API_KEY \
    sw-user=$SONICWALL_USERNAME \
    sw-pass=$SONICWALL_PASSWORD \
    eg-endpoint=$INVESTIGATION_COMPLETE_ENDPOINT \
    eg-key=$INVESTIGATION_COMPLETE_KEY \
  --env-vars \
    ZHIPUAI_API_KEY=secretref:zhipuai-key \
    SONICWALL_USERNAME=secretref:sw-user \
    SONICWALL_PASSWORD=secretref:sw-pass \
    EVENT_GRID_ENDPOINT=secretref:eg-endpoint \
    EVENT_GRID_KEY=secretref:eg-key \
    LOG_LEVEL=INFO

# Get the public URL
NETWORK_AGENT_URL=$(az containerapp show \
  --name network-triage-agent \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn \
  --output tsv)

echo "Network Agent URL: https://$NETWORK_AGENT_URL"
```

**Verify Deployment:**
```bash
# Health check
curl https://$NETWORK_AGENT_URL/health
# Expected: {"status": "healthy"}
```

---

## Phase 2: Network Agent Changes

### 2.1 Add Event Grid Client Service

**File:** `network-triage-agent/services/event_grid_client.py`

```python
"""
Event Grid Client for publishing investigation results
"""
import os
import uuid
import httpx
import logging
from datetime import datetime
from typing import Dict, Any

logger = logging.getLogger(__name__)

class EventGridClient:
    """Client for publishing events to Azure Event Grid"""

    def __init__(self):
        self.endpoint = os.getenv('EVENT_GRID_ENDPOINT')
        self.key = os.getenv('EVENT_GRID_KEY')

        if not self.endpoint or not self.key:
            logger.warning("Event Grid not configured - events will not be published")

    async def publish_event(
        self,
        event_type: str,
        subject: str,
        data: Dict[str, Any]
    ) -> bool:
        """
        Publish event to Event Grid topic

        Args:
            event_type: Type of event (e.g., 'CaseNetwork.InvestigationComplete')
            subject: Subject of event (e.g., 'cases/SCS0048536')
            data: Event data payload

        Returns:
            True if published successfully, False otherwise
        """
        if not self.endpoint or not self.key:
            logger.error("Event Grid not configured")
            return False

        event = {
            "id": str(uuid.uuid4()),
            "eventType": event_type,
            "subject": subject,
            "eventTime": datetime.utcnow().isoformat() + "Z",
            "dataVersion": "1.0",
            "data": data
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.endpoint,
                    json=[event],
                    headers={
                        "aeg-sas-key": self.key,
                        "Content-Type": "application/json"
                    },
                    timeout=30.0
                )
                response.raise_for_status()

            logger.info(f"Published event {event_type} for {subject}")
            return True

        except Exception as e:
            logger.error(f"Failed to publish event: {e}")
            return False

# Singleton instance
event_grid_client = EventGridClient()
```

### 2.2 Add Event Grid Webhook Endpoint

**File:** `network-triage-agent/main.py` (add to existing file)

```python
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from services.event_grid_client import event_grid_client
import asyncio
import logging

logger = logging.getLogger(__name__)

# ... existing code ...

@app.post("/webhooks/event-grid")
async def handle_event_grid_webhook(
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Receive investigation requests from Event Grid

    Event Grid will:
    1. First send a validation event (handshake)
    2. Then send actual events as they're published
    """

    try:
        events = await request.json()
        logger.info(f"Received {len(events)} Event Grid events")

        # Handle subscription validation handshake
        for event in events:
            if event.get('eventType') == 'Microsoft.EventGrid.SubscriptionValidationEvent':
                validation_code = event['data']['validationCode']
                logger.info(f"Validating Event Grid subscription with code: {validation_code}")
                return {
                    "validationResponse": validation_code
                }

        # Process investigation requests in background
        for event in events:
            if event['eventType'] == 'CaseNetwork.InvestigationRequested':
                logger.info(f"Queuing investigation for case {event['data']['caseNumber']}")
                background_tasks.add_task(
                    process_investigation_request,
                    event['data']
                )

        return {"status": "accepted", "processed": len(events)}

    except Exception as e:
        logger.error(f"Error processing Event Grid webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def process_investigation_request(data: Dict[str, Any]):
    """
    Process investigation request and publish result

    Args:
        data: Event data containing case details and Slack metadata
    """
    case_number = data.get('caseNumber', 'UNKNOWN')

    try:
        logger.info(f"[{case_number}] Starting investigation")

        # Build investigation request
        request = InvestigationRequest(
            site_name=data['caseNumber'],
            firewall_ip=data['firewall_ip'],
            firewall_type=data.get('firewall_type', 'sonicwall'),
            ssh_port=data.get('ssh_port', 22),
            symptoms=data['symptoms']
        )

        # Run investigation
        agent = AutonomousInvestigationAgent()
        result = await agent.investigate(request)

        logger.info(f"[{case_number}] Investigation complete - Severity: {result.severity}")

        # Publish completion event
        await event_grid_client.publish_event(
            event_type='CaseNetwork.InvestigationComplete',
            subject=f'cases/{case_number}',
            data={
                'caseNumber': case_number,
                'result': {
                    'severity': result.severity,
                    'summary': result.summary,
                    'recommended_actions': result.recommended_actions,
                    'escalate_to_l3': result.escalate_to_l3,
                    'confidence_score': result.confidence_score,
                    'investigation_steps': len(result.investigation_log) if result.investigation_log else 0
                },
                'slack_metadata': data['slack_metadata']
            }
        )

    except Exception as e:
        logger.error(f"[{case_number}] Investigation failed: {e}")

        # Publish failure event
        await event_grid_client.publish_event(
            event_type='CaseNetwork.InvestigationFailed',
            subject=f'cases/{case_number}',
            data={
                'caseNumber': case_number,
                'error': str(e),
                'error_type': type(e).__name__,
                'slack_metadata': data.get('slack_metadata', {})
            }
        )
```

### 2.3 Update Requirements

**File:** `network-triage-agent/requirements.txt` (add)

```txt
httpx>=0.26.0
```

---

## Phase 3: Slack Bot Changes

### 3.1 Install Event Grid SDK

```bash
cd /Users/hamadriaz/Documents/codebase/ai-sdk-slackbot
npm install @azure/eventgrid
```

### 3.2 Add Event Grid Publisher Service

**File:** `lib/services/event-grid-publisher.ts`

```typescript
/**
 * Event Grid Publisher
 * Publishes investigation requests to Azure Event Grid
 */
import { EventGridPublisherClient, AzureKeyCredential } from '@azure/eventgrid';

class EventGridPublisher {
  private client: EventGridPublisherClient | null = null;

  constructor() {
    const endpoint = process.env.EVENT_GRID_CASE_EVENTS_ENDPOINT;
    const key = process.env.EVENT_GRID_CASE_EVENTS_KEY;

    if (!endpoint || !key) {
      console.warn('[Event Grid] Not configured - investigation requests will not be published');
      return;
    }

    this.client = new EventGridPublisherClient(
      endpoint,
      'EventGrid',
      new AzureKeyCredential(key)
    );

    console.log('[Event Grid] Publisher initialized');
  }

  async publishInvestigationRequest(payload: {
    caseNumber: string;
    firewall_ip: string;
    firewall_type?: string;
    ssh_port?: number;
    symptoms: string;
    channel_id: string;
    thread_ts: string;
  }): Promise<boolean> {
    if (!this.client) {
      console.error('[Event Grid] Publisher not configured');
      return false;
    }

    try {
      console.log(`[Event Grid] Publishing investigation request for ${payload.caseNumber}`);

      await this.client.send([
        {
          eventType: 'CaseNetwork.InvestigationRequested',
          subject: `cases/${payload.caseNumber}`,
          dataVersion: '1.0',
          data: {
            caseNumber: payload.caseNumber,
            firewall_ip: payload.firewall_ip,
            firewall_type: payload.firewall_type || 'sonicwall',
            ssh_port: payload.ssh_port || 22,
            symptoms: payload.symptoms,
            slack_metadata: {
              channel_id: payload.channel_id,
              thread_ts: payload.thread_ts,
            },
          },
        },
      ]);

      console.log(`[Event Grid] Event published successfully for ${payload.caseNumber}`);
      return true;
    } catch (error) {
      console.error(`[Event Grid] Failed to publish event:`, error);
      return false;
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }
}

export const eventGridPublisher = new EventGridPublisher();
```

### 3.3 Add Event Grid Webhook Receiver

**File:** `api/webhooks/event-grid.ts`

```typescript
/**
 * Event Grid Webhook Handler
 * Receives investigation results from network triage agent
 */
import { client } from '../../lib/slack-utils';

type EventGridEvent = {
  id: string;
  eventType: string;
  subject: string;
  eventTime: string;
  data: any;
  dataVersion: string;
};

type EventGridValidationEvent = {
  id: string;
  eventType: 'Microsoft.EventGrid.SubscriptionValidationEvent';
  data: {
    validationCode: string;
  };
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const events = JSON.parse(rawBody) as (EventGridEvent | EventGridValidationEvent)[];

    console.log(`[Event Grid Webhook] Received ${events.length} events`);

    // Handle subscription validation (Event Grid handshake)
    for (const event of events) {
      if (event.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent') {
        const validationEvent = event as EventGridValidationEvent;
        console.log('[Event Grid] Handling subscription validation');

        return new Response(
          JSON.stringify({
            validationResponse: validationEvent.data.validationCode,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Process investigation events
    for (const event of events) {
      try {
        if (event.eventType === 'CaseNetwork.InvestigationComplete') {
          await handleInvestigationComplete(event.data);
        } else if (event.eventType === 'CaseNetwork.InvestigationFailed') {
          await handleInvestigationFailed(event.data);
        } else {
          console.log(`[Event Grid] Ignoring event type: ${event.eventType}`);
        }
      } catch (error) {
        console.error(`[Event Grid Webhook] Error processing event ${event.id}:`, error);
        // Continue processing other events
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('[Event Grid Webhook] Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

async function handleInvestigationComplete(data: any) {
  const { caseNumber, result, slack_metadata } = data;

  console.log(`[Event Grid] Investigation complete for ${caseNumber}`);

  const message = formatNetworkTriageResult(caseNumber, result);

  await client.chat.postMessage({
    channel: slack_metadata.channel_id,
    thread_ts: slack_metadata.thread_ts,
    text: message,
    unfurl_links: false,
  });

  console.log(`[Event Grid] Posted results to Slack for ${caseNumber}`);
}

async function handleInvestigationFailed(data: any) {
  const { caseNumber, error, error_type, slack_metadata } = data;

  console.log(`[Event Grid] Investigation failed for ${caseNumber}: ${error}`);

  await client.chat.postMessage({
    channel: slack_metadata.channel_id,
    thread_ts: slack_metadata.thread_ts,
    text: `⚠️ *Network investigation failed for ${caseNumber}*\n\nError: ${error}\n\n_The network triage agent encountered an issue. Please investigate manually or retry later._`,
    unfurl_links: false,
  });
}

function formatNetworkTriageResult(caseNumber: string, result: any): string {
  const severityEmoji = {
    LOW: '✅',
    MEDIUM: '⚠️',
    HIGH: '🔴',
    CRITICAL: '🚨',
  }[result.severity] || '🔍';

  let message = `${severityEmoji} *Network Triage Complete: ${caseNumber}*\n\n`;
  message += `*Severity:* ${result.severity}\n`;
  message += `*Summary:* ${result.summary}\n`;

  if (result.recommended_actions?.length > 0) {
    message += `\n*Recommended Actions:*\n`;
    result.recommended_actions.forEach((action: string, idx: number) => {
      message += `${idx + 1}. ${action}\n`;
    });
  }

  if (result.escalate_to_l3) {
    message += `\n⚠️ *Escalation Recommended* - This issue should be escalated to the L3 Network Team\n`;
  }

  if (result.confidence_score) {
    const confidence = Math.round(result.confidence_score * 100);
    message += `\n_Confidence: ${confidence}%`;
    if (result.investigation_steps) {
      message += ` | ${result.investigation_steps} diagnostic steps executed`;
    }
    message += `_`;
  }

  return message;
}

// GET method for health check
export async function GET() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      endpoint: '/api/webhooks/event-grid',
      message: 'Event Grid webhook endpoint is active',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
```

### 3.4 Integrate with Handle Passive Messages

**File:** `lib/handle-passive-messages.ts` (add to existing)

```typescript
// Add import at top
import { eventGridPublisher } from './services/event-grid-publisher';
import { getCurrentIssuesService } from './services/current-issues-service';

// Add new function to extract network context
async function extractNetworkContext(
  caseNumber: string,
  caseDetails: ServiceNowCaseResult | null
): Promise<{ firewall_ip: string | null; symptoms: string } | null> {
  // Try to extract firewall IP from case details
  const description = caseDetails?.description || caseDetails?.short_description || '';

  // Look for IP addresses in description
  const ipPattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
  const ips = description.match(ipPattern);

  if (!ips || ips.length === 0) {
    console.log(`[Network Triage] No IP addresses found in case ${caseNumber}`);
    return null;
  }

  // Use first IP found (could be enhanced with CMDB lookup)
  const firewall_ip = ips[0];

  // Check if this is a network-related issue
  const networkKeywords = [
    'network', 'internet', 'connection', 'vpn', 'firewall',
    'ping', 'traceroute', 'dns', 'routing', 'gateway',
    'cannot browse', 'cannot access', 'slow connection'
  ];

  const isNetworkIssue = networkKeywords.some(keyword =>
    description.toLowerCase().includes(keyword)
  );

  if (!isNetworkIssue) {
    console.log(`[Network Triage] Case ${caseNumber} does not appear to be network-related`);
    return null;
  }

  return {
    firewall_ip,
    symptoms: description
  };
}

// Add to processCaseDetection function (after posting intelligent assistance)
async function processCaseDetection(
  event: GenericMessageEvent,
  caseNumber: string,
  botUserId: string
): Promise<void> {
  // ... existing code ...

  // After posting intelligent assistance, check if network investigation is needed
  if (eventGridPublisher.isConfigured() && caseDetails) {
    const networkContext = await extractNetworkContext(caseNumber, caseDetails);

    if (networkContext) {
      console.log(`[Network Triage] Triggering investigation for ${caseNumber} - IP: ${networkContext.firewall_ip}`);

      const published = await eventGridPublisher.publishInvestigationRequest({
        caseNumber,
        firewall_ip: networkContext.firewall_ip!,
        symptoms: networkContext.symptoms,
        channel_id: channelId,
        thread_ts: event.ts,
      });

      if (published) {
        // Post acknowledgment to Slack
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: event.ts,
          text: `🔍 Network diagnostics initiated for firewall ${networkContext.firewall_ip}...`,
          unfurl_links: false,
        });
      }
    }
  }
}
```

### 3.5 Update Environment Variables

**File:** `.env.local` (add)

```bash
# Azure Event Grid Configuration
EVENT_GRID_CASE_EVENTS_ENDPOINT=https://topic-case-events.eastus-1.eventgrid.azure.net/api/events
EVENT_GRID_CASE_EVENTS_KEY=your-key-here
```

**File:** `.env.example` (document)

```bash
# Azure Event Grid Configuration (OPTIONAL - for network triage integration)
# Get these from Azure Portal after creating Event Grid topics
# EVENT_GRID_CASE_EVENTS_ENDPOINT=https://topic-case-events.eastus-1.eventgrid.azure.net/api/events
# EVENT_GRID_CASE_EVENTS_KEY=your-event-grid-key
```

---

## Phase 4: Configure Event Grid Subscriptions

### 4.1 Create Subscription for Network Agent

```bash
# Get network agent URL
NETWORK_AGENT_URL=$(az containerapp show \
  --name network-triage-agent \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn \
  --output tsv)

echo "Network Agent URL: https://$NETWORK_AGENT_URL"

# Create Event Grid subscription
az eventgrid event-subscription create \
  --name sub-network-agent \
  --source-resource-id $(az eventgrid topic show --name $TOPIC_CASE_EVENTS --resource-group $RESOURCE_GROUP --query id --output tsv) \
  --endpoint https://${NETWORK_AGENT_URL}/webhooks/event-grid \
  --endpoint-type webhook \
  --event-delivery-schema eventgridschema \
  --included-event-types CaseNetwork.InvestigationRequested \
  --max-delivery-attempts 10 \
  --event-ttl 1440

# Verify subscription
az eventgrid event-subscription show \
  --name sub-network-agent \
  --source-resource-id $(az eventgrid topic show --name $TOPIC_CASE_EVENTS --resource-group $RESOURCE_GROUP --query id --output tsv)
```

### 4.2 Create Subscription for Slack Bot

```bash
# Your Vercel deployment URL
VERCEL_URL="https://your-app.vercel.app"

# Create Event Grid subscription
az eventgrid event-subscription create \
  --name sub-slack-bot \
  --source-resource-id $(az eventgrid topic show --name $TOPIC_INVESTIGATION_COMPLETE --resource-group $RESOURCE_GROUP --query id --output tsv) \
  --endpoint ${VERCEL_URL}/api/webhooks/event-grid \
  --endpoint-type webhook \
  --event-delivery-schema eventgridschema \
  --included-event-types \
    CaseNetwork.InvestigationComplete \
    CaseNetwork.InvestigationFailed \
  --max-delivery-attempts 10 \
  --event-ttl 1440

# Verify subscription
az eventgrid event-subscription show \
  --name sub-slack-bot \
  --source-resource-id $(az eventgrid topic show --name $TOPIC_INVESTIGATION_COMPLETE --resource-group $RESOURCE_GROUP --query id --output tsv)
```

### 4.3 Configure Dead Letter Queue (Optional but Recommended)

```bash
# Create storage account for dead letter events
STORAGE_ACCOUNT="stnetworktriage"
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS

# Create container for dead letter events
az storage container create \
  --name deadletter \
  --account-name $STORAGE_ACCOUNT

# Update subscriptions with dead letter config
STORAGE_ID=$(az storage account show --name $STORAGE_ACCOUNT --resource-group $RESOURCE_GROUP --query id --output tsv)

az eventgrid event-subscription update \
  --name sub-network-agent \
  --source-resource-id $(az eventgrid topic show --name $TOPIC_CASE_EVENTS --resource-group $RESOURCE_GROUP --query id --output tsv) \
  --deadletter-endpoint ${STORAGE_ID}/blobServices/default/containers/deadletter

az eventgrid event-subscription update \
  --name sub-slack-bot \
  --source-resource-id $(az eventgrid topic show --name $TOPIC_INVESTIGATION_COMPLETE --resource-group $RESOURCE_GROUP --query id --output tsv) \
  --deadletter-endpoint ${STORAGE_ID}/blobServices/default/containers/deadletter
```

---

## Phase 5: Testing & Validation

### 5.1 Test Event Grid Connectivity

**Test publishing from command line:**
```bash
# Get topic details
TOPIC_ENDPOINT=$(az eventgrid topic show --name $TOPIC_CASE_EVENTS --resource-group $RESOURCE_GROUP --query endpoint --output tsv)
TOPIC_KEY=$(az eventgrid topic key list --name $TOPIC_CASE_EVENTS --resource-group $RESOURCE_GROUP --query key1 --output tsv)

# Publish test event
curl -X POST "$TOPIC_ENDPOINT" \
  -H "aeg-sas-key: $TOPIC_KEY" \
  -H "Content-Type: application/json" \
  -d '[{
    "id": "test-'$(uuidgen)'",
    "eventType": "CaseNetwork.InvestigationRequested",
    "subject": "cases/TEST001",
    "eventTime": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "dataVersion": "1.0",
    "data": {
      "caseNumber": "TEST001",
      "firewall_ip": "192.168.1.1",
      "firewall_type": "sonicwall",
      "ssh_port": 22,
      "symptoms": "Cannot browse internet - test event",
      "slack_metadata": {
        "channel_id": "C12345TEST",
        "thread_ts": "1234567890.123456"
      }
    }
  }]'
```

**Expected:** Network agent should receive webhook and log the event

### 5.2 End-to-End Test

**Test flow:**
1. Post message in Slack mentioning case with network issue
2. Check Slack bot logs - should publish event
3. Check network agent logs - should receive and process
4. Check Slack thread - should receive triage results

**Manual test:**
```bash
# In Slack: Post message
"Working on SCS0048999 - Client reports 192.168.1.100 cannot access internet"

# Check bot published event
curl https://your-app.vercel.app/api/health

# Check network agent received
curl https://$NETWORK_AGENT_URL/health

# Monitor logs
# Azure Container Apps:
az containerapp logs show \
  --name network-triage-agent \
  --resource-group $RESOURCE_GROUP \
  --follow

# Vercel:
vercel logs --follow
```

### 5.3 Monitor Event Grid Metrics

```bash
# View published events
az monitor metrics list \
  --resource $(az eventgrid topic show --name $TOPIC_CASE_EVENTS --resource-group $RESOURCE_GROUP --query id --output tsv) \
  --metric PublishSuccessCount \
  --start-time $(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ') \
  --end-time $(date -u '+%Y-%m-%dT%H:%M:%SZ')

# View delivery attempts
az monitor metrics list \
  --resource $(az eventgrid topic show --name $TOPIC_CASE_EVENTS --resource-group $RESOURCE_GROUP --query id --output tsv) \
  --metric DeliveryAttemptFailCount \
  --start-time $(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ') \
  --end-time $(date -u '+%Y-%m-%dT%H:%M:%SZ')
```

---

## Phase 6: Production Hardening

### 6.1 Add Webhook Signature Validation

**In Network Agent** (`main.py`):
```python
import base64
import hmac
import hashlib

def validate_event_grid_signature(request: Request) -> bool:
    """
    Validate Event Grid webhook signature
    https://docs.microsoft.com/azure/event-grid/webhook-event-delivery
    """
    signature = request.headers.get('aeg-event-type')

    # For Event Grid, the validation is done via the subscription validation event
    # The webhook endpoint must respond to validation events
    # Signature validation is optional but recommended for production

    return True  # Implement based on security requirements
```

### 6.2 Configure Monitoring & Alerts

**Create alert for failed deliveries:**
```bash
# Create action group for notifications
az monitor action-group create \
  --name ag-network-triage \
  --resource-group $RESOURCE_GROUP \
  --short-name NetTriage \
  --email-receiver name=ops email=ops@example.com

# Create alert rule
az monitor metrics alert create \
  --name alert-event-delivery-failures \
  --resource-group $RESOURCE_GROUP \
  --scopes $(az eventgrid topic show --name $TOPIC_CASE_EVENTS --resource-group $RESOURCE_GROUP --query id --output tsv) \
  --condition "avg DeliveryAttemptFailCount > 5" \
  --window-size 5m \
  --evaluation-frequency 1m \
  --action ag-network-triage
```

### 6.3 Configure Retry Policies

**Already configured in subscription creation:**
- `--max-delivery-attempts 10` - Retry up to 10 times
- `--event-ttl 1440` - Keep trying for 24 hours
- Exponential backoff between retries

### 6.4 Add Application Insights (Optional)

```bash
# Create Application Insights
az monitor app-insights component create \
  --app network-triage-insights \
  --location $LOCATION \
  --resource-group $RESOURCE_GROUP \
  --application-type web

# Get instrumentation key
APPINSIGHTS_KEY=$(az monitor app-insights component show \
  --app network-triage-insights \
  --resource-group $RESOURCE_GROUP \
  --query instrumentationKey \
  --output tsv)

# Update container app with App Insights
az containerapp update \
  --name network-triage-agent \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars APPINSIGHTS_INSTRUMENTATIONKEY=$APPINSIGHTS_KEY
```

### 6.5 Document Runbook

**Runbook for Common Issues:**

1. **Event not being delivered**
   - Check Event Grid metrics for failures
   - Verify webhook endpoint is accessible
   - Check subscription status
   - Review dead letter queue

2. **Network agent not processing**
   - Check container logs
   - Verify SSH credentials
   - Test firewall connectivity
   - Check LLM API quotas

3. **Results not posting to Slack**
   - Verify Slack bot token
   - Check Vercel logs
   - Test webhook endpoint manually

---

## Environment Variables Summary

### Slack Bot (Vercel)

**File:** `.env.local`
```bash
# Event Grid Configuration
EVENT_GRID_CASE_EVENTS_ENDPOINT=https://topic-case-events.eastus-1.eventgrid.azure.net/api/events
EVENT_GRID_CASE_EVENTS_KEY=<your-key>
```

### Network Agent (Azure Container App)

**Secrets configured via Azure CLI:**
```bash
ZHIPUAI_API_KEY=<zhipuai-key>
SONICWALL_USERNAME=<username>
SONICWALL_PASSWORD=<password>
EVENT_GRID_ENDPOINT=https://topic-investigation-complete.eastus-1.eventgrid.azure.net/api/events
EVENT_GRID_KEY=<your-key>
LOG_LEVEL=INFO
```

---

## Cost Analysis

### Monthly Costs (1000 investigations/month)

**Azure Event Grid:**
- 1000 request events (publish) = $0.0006
- 1000 result events (publish) = $0.0006
- 2000 webhook deliveries (free first 100K)
- **Total: ~$0.001/month** (essentially free)

**Azure Container Apps:**
- 1 vCPU, 2GB RAM, always-on = ~$45/month
- Requests: 1000 investigations × 5 min avg = 83 vCPU-hours
- Additional compute: ~$5/month
- **Total: ~$50/month**

**Azure Storage (Dead Letter):**
- Negligible (<$1/month)

**Total Monthly Cost: ~$50-51/month**

### Cost Optimization Options

1. **Use Consumption Plan for Container Apps**
   - Scale to zero when not in use
   - Pay per request
   - Potential savings: 30-50%

2. **Use Azure Functions instead of Container Apps**
   - Better for intermittent workloads
   - Pay per execution
   - ~$10/month for 1000 investigations

---

## Troubleshooting

### Event Grid not delivering

**Check subscription status:**
```bash
az eventgrid event-subscription show \
  --name sub-network-agent \
  --source-resource-id $(az eventgrid topic show --name $TOPIC_CASE_EVENTS --resource-group $RESOURCE_GROUP --query id --output tsv) \
  --query provisioningState
```

**Check delivery metrics:**
```bash
az monitor metrics list \
  --resource $(az eventgrid topic show --name $TOPIC_CASE_EVENTS --resource-group $RESOURCE_GROUP --query id --output tsv) \
  --metric DeliveryAttemptFailCount
```

**Check dead letter queue:**
```bash
az storage blob list \
  --container-name deadletter \
  --account-name $STORAGE_ACCOUNT \
  --output table
```

### Network agent not responding

**Check container logs:**
```bash
az containerapp logs show \
  --name network-triage-agent \
  --resource-group $RESOURCE_GROUP \
  --follow
```

**Test health endpoint:**
```bash
curl https://$NETWORK_AGENT_URL/health
```

### Slack results not posting

**Check Vercel logs:**
```bash
vercel logs --follow
```

**Test webhook manually:**
```bash
curl -X POST https://your-app.vercel.app/api/webhooks/event-grid \
  -H "Content-Type: application/json" \
  -d '[{
    "id": "test",
    "eventType": "CaseNetwork.InvestigationComplete",
    "subject": "cases/TEST",
    "eventTime": "2025-10-09T00:00:00Z",
    "dataVersion": "1.0",
    "data": {
      "caseNumber": "TEST",
      "result": {"severity": "LOW", "summary": "Test"},
      "slack_metadata": {"channel_id": "C123", "thread_ts": "123"}
    }
  }]'
```

---

## Next Steps

1. ✅ Review this plan
2. ⬜ Execute Phase 1: Azure infrastructure
3. ⬜ Execute Phase 2: Network agent changes
4. ⬜ Execute Phase 3: Slack bot changes
5. ⬜ Execute Phase 4: Configure subscriptions
6. ⬜ Execute Phase 5: Testing
7. ⬜ Execute Phase 6: Production hardening
8. ⬜ Monitor and optimize

---

## References

- [Azure Event Grid Documentation](https://docs.microsoft.com/azure/event-grid/)
- [Event Grid Webhook Delivery](https://docs.microsoft.com/azure/event-grid/webhook-event-delivery)
- [Azure Container Apps Documentation](https://docs.microsoft.com/azure/container-apps/)
- [Vercel Functions Documentation](https://vercel.com/docs/functions)

---

**Last Updated:** 2025-10-09
**Status:** Planning Phase
**Owner:** Network Operations Team
