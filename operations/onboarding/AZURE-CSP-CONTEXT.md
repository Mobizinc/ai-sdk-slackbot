# Azure CSP Information in Business Context

This document explains how to add Azure Cloud Solution Provider (CSP) subscription information to business contexts so the AI agent knows which subscriptions Mobiz manages.

## Why This Matters

When Azure cases involve CSP subscriptions (where quota requests must go through the service provider), the agent needs to know:
- **Is Mobiz the CSP?** → We can open Partner Center requests internally
- **Is someone else the CSP?** → Customer must contact their service provider

Without this information, the agent will ask clarifying questions that delay resolution.

## Adding Azure Subscription Information

### Current Schema Support

The `businessContexts` table currently doesn't have a dedicated `azureSubscriptions` field. Until the schema is extended, use the `serviceDetails` field to document Azure subscription CSP relationships.

### Example: Altman Plants / Citrix

```typescript
// In lib/services/business-context-service.ts or via database

{
  entityName: "Altman Plants",
  entityType: "CLIENT",
  industry: "Agriculture/Horticulture",
  description: "Plant nursery and distribution company",
  aliases: ["Altman", "Citrix (altmanplants1)"],
  serviceDetails: "Azure CSP subscriptions managed by Mobiz. Subscription 'Citrix (altmanplants1)' #1303812 (bacaed3c-f853-432e-a298-0026adadfd5a) - Mobiz has Partner Center Admin Agent access.",
  keyContacts: [],
  slackChannels: [],
  cmdbIdentifiers: [],
  contextStewards: []
}
```

### What to Include

For each client with Azure subscriptions:

**In `serviceDetails` field**:
```
Azure CSP subscriptions managed by Mobiz.
Subscription '{name}' #{number} ({subscription-id}) - Mobiz has Partner Center {access-level}.
```

**Key information**:
- CSP provider (Mobiz or another company)
- Subscription name as it appears in Azure portal
- Subscription ID (GUID)
- Partner Center access level (Admin Agent, GDAP, etc.)

### Multiple Subscriptions Example

```typescript
{
  entityName: "Example Corp",
  serviceDetails: "Azure CSP: Subscription 'Production' #1234567 (guid-here) managed by Mobiz with Admin Agent access. Subscription 'Development' #7654321 (guid2-here) managed by Contoso (3rd party CSP).",
  ...
}
```

## Future Schema Enhancement

To properly support Azure subscription metadata, consider adding:

```typescript
// Proposed addition to businessContexts table
azureSubscriptions: jsonb("azure_subscriptions").$type<Array<{
  subscriptionName: string;
  subscriptionNumber?: string;
  subscriptionId: string;  // GUID
  cspProvider: string;  // "Mobiz" or other company name
  partnerCenterAccess?: "Admin Agent" | "GDAP" | "None";
  notes?: string;
}>>().default([]).notNull(),
```

## How the Agent Uses This

When a CSP-related case appears (e.g., "contact your service provider" error):

1. Agent extracts company name from channel or case
2. Loads business context for that company
3. Checks `serviceDetails` for CSP information
4. **If Mobiz is CSP**: Provides internal escalation steps (Partner Center, Admin Agent)
5. **If another company is CSP**: Directs user to contact that provider
6. **If CSP unknown**: Asks clarifying question

## Testing

After adding CSP information:

```bash
# Run the Azure Microsoft Learn test
npx tsx scripts/test-azure-microsoft-learn.ts
```

Expected behavior:
- ✅ Agent identifies Mobiz as CSP (from business context)
- ✅ Provides Partner Center guidance instead of asking "Who is the CSP?"
- ✅ No unnecessary clarifying questions

## Example Response (With CSP Context)

```
*Next Actions*
1. Since Mobiz is the CSP for this subscription, we should open a Partner Center
   support request on behalf of Altman Plants
2. Navigate to Partner Center → Customers → Altman Plants → Service requests →
   New request → Service and subscription limits (quotas)
3. Specify: Microsoft Fabric capacity increase from 16 to 70 units in subscription
   'Citrix (altmanplants1)' #1303812
```

vs. **Without CSP Context:**

```
*Key Questions*
• Is Mobiz the subscription's CSP/reseller for altmanplants1 or do you have a different service provider?
```

## Related Files

- `lib/generate-response.ts` - System prompt with Mobiz CSP role
- `lib/services/business-context-service.ts` - Business context loading
- `lib/db/schema.ts` - Database schema for business contexts
