# CMDB Pilot Tools - Quick Reference

This document provides a quick overview of all tools created for the Altus CMDB Population pilot.

## 🎯 Quick Start

**To begin Phase 1 of the pilot:**

```bash
./scripts/cmdb-pilot-phase1.sh
```

This interactive script guides you through the entire Phase 1 workflow.

---

## 📁 Files Created

### Documentation

| File | Purpose |
|------|---------|
| `CMDB_PILOT_ALTUS.md` | Complete 4-phase pilot plan (Crawl → Walk → Run) |
| `CMDB_TOOLS_SUMMARY.md` | This file - quick reference |
| `scripts/README.md` | Detailed script documentation |

### Templates & Examples

| File | Purpose |
|------|---------|
| `templates/cmdb-ci-template.json` | JSON schema for CI records |
| `examples/altus-file-server-example.json` | Example: 10.252.0.40 file server |

### Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/cmdb-pilot-phase1.sh` | Guided Phase 1 workflow | `./scripts/cmdb-pilot-phase1.sh` |
| `scripts/discover-infrastructure.ts` | Scan Slack for infrastructure | `npx tsx scripts/discover-infrastructure.ts --channel altus-support --days 90` |
| `scripts/validate-ci.ts` | Validate CI JSON files | `npx tsx scripts/validate-ci.ts ci-records/*.json` |
| `scripts/test-cmdb-search.ts` | Test CMDB search (specific IP) | `npx tsx scripts/test-cmdb-search.ts` |
| `scripts/test-cmdb-altus.ts` | Test CMDB search (Altus CIs) | `npx tsx scripts/test-cmdb-altus.ts` |
| `scripts/test-cmdb-cidr.ts` | Test CMDB coverage (10.252.0.0/x) | `npx tsx scripts/test-cmdb-cidr.ts` |

### Supporting Files

| File | Purpose |
|------|---------|
| `lib/services/troubleshooting-assistant.ts` | Infrastructure extraction utilities |
| `ci-records/` | Directory for work-in-progress CIs |
| `ci-records/README.md` | CI records directory guide |

---

## 🔄 Pilot Workflow

### Phase 1: Manual Discovery (Week 1)

**Goal:** Document first 3 CIs and validate approach

```bash
# 1. Discover infrastructure
npx tsx scripts/discover-infrastructure.ts --channel altus-support --days 60

# 2. Create 3 CI records manually
# - Use templates/cmdb-ci-template.json
# - Save to ci-records/altus-[name].json
# - See examples/altus-file-server-example.json

# 3. Validate CI records
npx tsx scripts/validate-ci.ts ci-records/*.json

# 4. Upload to ServiceNow
# (Manual entry, CSV import, or API)

# 5. Test PeterPool
# In Slack: "@PeterPool what do you know about 10.252.0.40?"
```

**Deliverables:**
- ✅ 3 documented CIs (different types)
- ✅ Template validated by actual use
- ✅ PeterPool can find all 3 CIs
- ✅ Lessons learned documented

---

### Phase 2: Refinement (Week 2)

**Goal:** Document 15-20 Altus CIs with refined template

```bash
# 1. Refine template based on Phase 1 learnings

# 2. Document 10-15 more CIs

# 3. Batch validate
npx tsx scripts/validate-ci.ts ci-records/*.json

# 4. Upload to ServiceNow

# 5. Test PeterPool integration
```

**Deliverables:**
- ✅ 15-20 documented Altus CIs
- ✅ 80%+ findable by PeterPool
- ✅ Support teams confirmed correct

---

### Phase 3: Semi-Automation (Week 3-4)

**Goal:** AI-assisted drafting with human review

```bash
# 1. Find gaps
npx tsx scripts/discover-infrastructure.ts --channel altus-support --days 90

# 2. PeterPool drafts CI records (feature to be built)

# 3. Human review and approval

# 4. Upload to ServiceNow
```

**Deliverables:**
- ✅ AI drafting tested on 10+ cases
- ✅ 70%+ draft accuracy
- ✅ Steward approval workflow working

---

### Phase 4: Full Automation (Month 2)

**Goal:** Proactive detection and auto-creation

- PeterPool auto-detects new infrastructure
- Asks clarifying questions if needed
- Routes to steward for approval
- Auto-creates in ServiceNow

---

## 🛠️ Common Tasks

### Discover Infrastructure from Slack

```bash
# Scan #altus-support for last 90 days
npx tsx scripts/discover-infrastructure.ts --channel altus-support --days 90

# Output: infrastructure-discovery-altus-support-[timestamp].json
```

**What it finds:**
- IP addresses (e.g., 10.252.0.40)
- Hostnames (e.g., altus-fs01)
- UNC paths (e.g., \\\\10.252.0.40\\altus.share)

**Report includes:**
- Mention frequency
- Related ServiceNow cases
- CMDB status (documented vs missing)
- Context examples

---

### Create CI Record

```bash
# 1. Copy template
cp templates/cmdb-ci-template.json ci-records/altus-fileserver-hq.json

# 2. Edit with your favorite editor
code ci-records/altus-fileserver-hq.json

# 3. Validate
npx tsx scripts/validate-ci.ts ci-records/altus-fileserver-hq.json
```

**Required fields:**
- `name` - Customer-Function-Location (e.g., "Altus-FileServer-HQ")
- `type` - From enum (e.g., "File Server")
- `support_team.primary` - Team name (e.g., "Altus IT Team")

**Recommended fields for AI searchability:**
- `purpose` - Troubleshooting context (20+ chars)
- `tags` - Common user terms (5+ tags)
- `ip_addresses` - All associated IPs
- `known_issues` - Tribal knowledge

---

### Validate CI Records

```bash
# Validate single file
npx tsx scripts/validate-ci.ts ci-records/altus-fileserver-hq.json

# Validate all
npx tsx scripts/validate-ci.ts ci-records/*.json

# Validate examples
npx tsx scripts/validate-ci.ts examples/*.json
```

**Scoring:**
- 🟢 90-100: Excellent - ready for ServiceNow
- 🟡 70-89: Good - minor improvements recommended
- 🔴 0-69: Needs work - fix errors first

**Exit code 0** = all valid (useful for automation)

---

### Test CMDB Search

```bash
# Search for specific IP
npx tsx scripts/test-cmdb-search.ts

# Search for Altus CIs
npx tsx scripts/test-cmdb-altus.ts

# Search entire 10.252.0.0 network
npx tsx scripts/test-cmdb-cidr.ts
```

These scripts verify ServiceNow integration is working.

---

## 📋 CI Record Checklist

When creating a CI record, ensure:

- [ ] **Name** follows Customer-Function-Location pattern
- [ ] **Type** is from valid enum
- [ ] **Support team** has primary contact
- [ ] **IP addresses** are valid format
- [ ] **Purpose** explains what/why (for troubleshooting)
- [ ] **Tags** include user-facing terms (L drive, share name, IP)
- [ ] **Known issues** capture tribal knowledge
- [ ] **Documentation links** are valid URLs
- [ ] **Metadata** shows created_by and confidence
- [ ] Validates with **90+ score**

---

## 🎯 Success Metrics

### Phase 1 Success Criteria

- [ ] 3 CIs documented with complete template
- [ ] Template validated by actual use
- [ ] PeterPool can find all 3 CIs by:
  - IP address search
  - Name search
  - Common user terms (e.g., "L drive")
- [ ] Support contacts verified
- [ ] Lessons learned documented

### Phase 2 Success Criteria

- [ ] 15-20 Altus CIs documented
- [ ] 80%+ findable by PeterPool
- [ ] Support teams confirmed
- [ ] Template refinement complete

### Phase 3 Success Criteria

- [ ] AI drafting tested on 10+ cases
- [ ] 70%+ draft accuracy
- [ ] Steward approval workflow operational

### Phase 4 Success Criteria

- [ ] PeterPool auto-detects new infrastructure
- [ ] <24hr from mention to CMDB entry
- [ ] 90%+ of infrastructure documented

---

## 🔍 What Makes a Good CI Record?

### AI-Searchable

Good CI records are found when users mention:
- IP addresses: "10.252.0.40"
- Common names: "L drive", "Altus share"
- Server names: "altus-fs01"
- UNC paths: "\\\\10.252.0.40\\altus.share"

**Use tags liberally** - include all terms users might say!

### Troubleshooting-Friendly

**Good purpose:**
> "Primary file share for Altus HQ users. Hosts departmental folders, user home directories, and shared resources. Commonly accessed as 'L Drive' via mapped network drive. Critical for daily operations - users store all working files here."

**Bad purpose:**
> "File server"

### Captures Tribal Knowledge

**Known issues example:**
```json
{
  "description": "Users get 'Access Denied' after password change",
  "workaround": "Disconnect mapped L: drive, then reconnect with new credentials. Use 'net use L: /delete' then remap.",
  "case_references": ["SCS0048728", "SCS0045123"]
}
```

This prevents support agents from solving the same problem repeatedly!

---

## 🚨 Troubleshooting

### Scripts

**"Channel not found"**
- Bot must be invited to channel
- Use channel name without # prefix

**"ServiceNow not configured"**
- Check `.env.local` credentials
- Run: `npx tsx scripts/test-cmdb-search.ts`

**"No infrastructure found"**
- Try longer time range (90+ days)
- Check different channels
- Verify channel has infrastructure mentions

### Validation

**"Missing required field"**
- Check: name, type, support_team.primary

**"Invalid type"**
- Must be from enum (see template)

**"Invalid IP address"**
- Must be valid IPv4 format: xxx.xxx.xxx.xxx

**"Score too low"**
- Add more tags (5+ recommended)
- Expand purpose description (50+ chars better)
- Add known issues if applicable

---

## 📚 Reference

### Key Documents

- **Full Plan:** `CMDB_PILOT_ALTUS.md`
- **Script Docs:** `scripts/README.md`
- **This Guide:** `CMDB_TOOLS_SUMMARY.md`

### Key Files

- **Template:** `templates/cmdb-ci-template.json`
- **Example:** `examples/altus-file-server-example.json`
- **Your CIs:** `ci-records/`

### Environment

Required in `.env.local`:
```bash
SLACK_BOT_TOKEN=xoxb-...
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_USERNAME=admin
SERVICENOW_PASSWORD=password
```

---

## 🎓 Learning Goals

By the end of Phase 1, you should understand:

1. **What makes a CI record useful** for troubleshooting
2. **How to write for AI searchability** (tags, purpose, terms)
3. **What information is readily available** vs. hard to find
4. **How PeterPool searches CMDB** and what works best

This manual work informs the automation strategy!

---

## ✅ Next Actions

**To start Phase 1 right now:**

```bash
./scripts/cmdb-pilot-phase1.sh
```

**Or step by step:**

1. Review discovery report from last session
2. Create first 3 CI records in `ci-records/`
3. Validate with `npx tsx scripts/validate-ci.ts ci-records/*.json`
4. Upload to ServiceNow
5. Test with PeterPool in Slack
6. Document lessons learned

---

## 💡 Tips

- **Start simple** - don't over-document initially
- **Validate frequently** - catch errors early
- **Think like a user** - what terms do they use?
- **Capture context** - why does this exist? What breaks if it's down?
- **Link to cases** - connect CIs to real troubleshooting history

The goal is **useful** documentation, not **perfect** documentation!
