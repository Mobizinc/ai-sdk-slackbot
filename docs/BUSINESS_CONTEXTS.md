# Business Contexts Management

This guide explains how to manage business context data (clients, vendors, platforms) that enriches the LLM's understanding when responding to support cases.

## Overview

Business contexts provide the AI with domain knowledge about:
- **Clients**: Companies you provide managed services to
- **Vendors**: Software/hardware providers you use
- **Platforms**: Cloud/software platforms in your environment

This information helps the AI provide more personalized, contextually aware responses.

## Quick Start

### 1. Run Database Migration

First, apply the database schema changes:

```bash
npm run db:migrate
```

This creates the `business_contexts` table and adds channel metadata columns.

### 2. Edit the Business Contexts File

Edit `business-contexts.json` to add or update entities:

```json
{
  "clients": [
    {
      "entityName": "Altus Community Healthcare",
      "entityType": "CLIENT",
      "industry": "Healthcare",
      "description": "Managed services client operating healthcare facilities",
      "aliases": ["Altus", "Altus Health"],
      "relatedEntities": ["Epic", "Microsoft 365"],
      "technologyPortfolio": "Epic EHR, Microsoft 365, Azure AD, Cisco networking",
      "serviceDetails": "24/7 managed IT services",
      "keyContacts": [
        {
          "name": "John Smith",
          "role": "IT Director",
          "email": "jsmith@altushealth.com"
        }
      ],
      "isActive": true
    }
  ],
  "vendors": [...],
  "platforms": [...]
}
```

### 3. Import into Database

Run the import script:

```bash
npm run db:import-contexts
```

Or with a custom file:

```bash
npm run db:import-contexts -- --file=custom-contexts.json
```

### 4. Verify Import

Check the import output:

```
📥 Importing business contexts from: business-contexts.json

Found 11 entities to import:
  - 3 clients
  - 5 vendors
  - 3 platforms

✅ Inserted: Altus Community Healthcare (CLIENT)
✅ Inserted: Neighbors Emergency Center (CLIENT)
...

📊 Import Summary:
  ✅ Inserted: 11
  ✏️  Updated: 0
  ❌ Skipped: 0
  📦 Total: 11

✨ Business contexts imported successfully!
```

## Entity Types

### CLIENT
Companies you provide managed services to.

**Required fields:**
- `entityName`: Official company name
- `entityType`: "CLIENT"

**Recommended fields:**
- `industry`: e.g., "Healthcare", "Finance", "Manufacturing"
- `description`: What they do
- `aliases`: Alternative names (e.g., ["Altus", "Altus Health"])
- `technologyPortfolio`: Technologies they use
- `keyContacts`: Important people to know

### VENDOR
Software/hardware providers you use.

**Example:**
```json
{
  "entityName": "Microsoft",
  "entityType": "VENDOR",
  "industry": "Software",
  "description": "Cloud services and productivity software provider",
  "aliases": ["MS", "MSFT"],
  "relatedEntities": ["Azure", "Office 365", "Teams"],
  "technologyPortfolio": "Azure, Microsoft 365, Windows Server"
}
```

### PLATFORM
Cloud/software platforms used across clients.

**Example:**
```json
{
  "entityName": "Azure",
  "entityType": "PLATFORM",
  "industry": "Cloud",
  "description": "Microsoft's cloud computing platform",
  "aliases": ["Azure Cloud", "Microsoft Azure"],
  "relatedEntities": ["Microsoft"]
}
```

## Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityName` | string | ✅ | Official entity name (must be unique) |
| `entityType` | string | ✅ | CLIENT, VENDOR, or PLATFORM |
| `industry` | string | ⚪ | Industry/sector |
| `description` | string | ⚪ | What the entity does |
| `aliases` | array | ⚪ | Alternative names for lookup |
| `relatedEntities` | array | ⚪ | Related companies/products |
| `technologyPortfolio` | string | ⚪ | Technologies used/provided |
| `serviceDetails` | string | ⚪ | Services provided/received |
| `keyContacts` | array | ⚪ | Important people [{name, role, email}] |
| `slackChannels` | array | ⚪ | Slack channel hints [{name, channelId?, notes?}] |
| `cmdbIdentifiers` | array | ⚪ | CMDB metadata [{ciName?, sysId?, ipAddresses?, description?, ownerGroup?, documentation?}] |
| `contextStewards` | array | ⚪ | Who approves context updates [{type, id?, name?, notes?}] |
| `isActive` | boolean | ⚪ | Whether entity is active (default: true) |

## How It's Used

When the AI processes a support case, it automatically:

1. **Detects the customer** from channel name (e.g., "altus-helpdesk" → "Altus")
2. **Looks up business context** in database
3. **Enhances the LLM prompt** with relevant information:

```
--- BUSINESS CONTEXT ---
We (Mobiz IT) are a consulting and Managed Service Provider.

Company in this case: Altus Community Healthcare
- Type: CLIENT
- Industry: Healthcare
- Description: Managed services client operating healthcare facilities
- Also known as: Altus, Altus Health
- Technology: Epic EHR, Microsoft 365, Azure AD, Cisco networking
- Key contacts: John Smith (IT Director)
```

4. **AI uses this context** to provide personalized, accurate responses

## Updating Contexts

### Update Existing Entity

Edit `business-contexts.json` and run:

```bash
npm run db:import-contexts
```

The script automatically **updates** existing entities (matched by `entityName`).

### Deactivate an Entity

Set `isActive: false`:

```json
{
  "entityName": "Old Client",
  "entityType": "CLIENT",
  "isActive": false
}
```

Then re-import.

### Add New Entity

Add to the appropriate array in `business-contexts.json` and re-import.

## Tips

1. **Use aliases generously** - Include common abbreviations and variations
2. **Keep descriptions concise** - 1-2 sentences max
3. **Update key contacts** - Keep them current for better service
4. **Technology portfolio** - List main technologies, not everything
5. **Re-import regularly** - Run import script whenever you update the JSON

## Channel & CMDB Metadata

- **Slack channels**: Track the canonical support channels (`slackChannels`) so the assistant can tie conversation threads to the right customer context. Include a short note describing the channel’s purpose if it helps distinguish production vs. project rooms.
- **CMDB identifiers**: Capture the authoritative CI name, `sys_id` (if known), primary IPs, and owning group in `cmdbIdentifiers`. When a configuration item is missing in ServiceNow, the assistant will now call out the gap and ask for documentation/CMDB creation—having the expected data here keeps the follow-up targeted.
- **Runbooks & docs**: Use the `documentation` array to link to existing runbooks or to flag missing docs (e.g., `"TODO: Publish runbook for Houston file server jump path"`).
- **Keep owners obvious**: Populate `ownerGroup` with the accountable team so follow-up requests automatically land with the right audience.
- **Context stewards**: List the Slack channel/user group/user who must approve context changes (`contextStewards`). The bot will ping these stewards when it drafts an update and wait for their 👍 before writing to the database.

## Context Update Workflow

1. **Detection** – During a case conversation the assistant checks the CMDB via ServiceNow. If no record exists, it gathers the verified facts (hostnames, IPs, owner group, access path).
2. **Proposal** – The assistant calls `proposeContextUpdate`, which posts a summary to the steward channel (defined in `contextStewards`). Stewards are mentioned directly in the message.
3. **Approval via emoji** – React with ✅ to apply or ❌ to discard. On approval the update is written into the `business_contexts` table (and the cache refreshed). Rejection posts a follow-up in the case thread so engineers know nothing changed.
4. **Documentation** – Use the `documentation` array to point to the runbook/ServiceNow task that tracks long-form follow-up. The goal is to keep prompts, CMDB, and tribal notes aligned.

> Tip: Configure a dedicated channel (e.g., `#context-approvals`) and a Slack user group (e.g., `@netops-oncall`) for faster reviews.

## Static Fallback

If an entity isn't in the database, the system falls back to hardcoded data in:
- `lib/services/business-context-service.ts`

These are loaded on startup and cached in memory.

## Troubleshooting

**Import fails with "Database not configured":**
```bash
export DATABASE_URL="postgresql://user:password@host/db"
npm run db:migrate
npm run db:import-contexts
```

**Entity not being recognized:**
1. Check aliases include common variations
2. Verify channel name matches entity name or alias
3. Check `isActive: true`

**Changes not taking effect:**
1. Re-import after editing JSON
2. Restart the bot (clears in-memory cache)

## Future Enhancements

- Slack slash commands: `/add-client`, `/update-client`
- Auto-discovery from channel names
- Admin web UI for management
- ServiceNow integration for customer sync
