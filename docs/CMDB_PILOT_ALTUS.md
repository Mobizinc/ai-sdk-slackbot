# CMDB Population Pilot: Altus Infrastructure

## Overview

**Goal**: Document Altus infrastructure in ServiceNow CMDB starting manually to understand what works, then gradually automate.

**Why Altus First**:
- Clear scope (single customer/location)
- Known pain point (10.252.0.40 file share not documented)
- Active Slack channel with infrastructure mentions

**Approach**: Crawl → Walk → Run
1. **Crawl**: Manual discovery and documentation with AI assistance
2. **Walk**: Semi-automated drafting with human review
3. **Run**: PeterPool auto-detects and drafts new CIs

---

## Phase 1: Manual Discovery & Template Development (Week 1)

### Step 1.1: Infrastructure Inventory Session

**Participants**: You + Engineer familiar with Altus + PeterPool (AI assistant)

**Process**:
1. Open Slack #altus-support channel
2. Review last 30-60 days of messages
3. Look for mentions of:
   - IP addresses (10.252.x.x, any private IPs)
   - Server names (file servers, domain controllers, apps)
   - Share paths (\\server\share)
   - Network equipment (routers, switches, firewalls)
   - Applications (Line of Business apps)

4. Create initial list in this format:

```markdown
## Altus Infrastructure Discovered

### File Servers
- 10.252.0.40 - "L Drive" / Altus share
  - Source: SCS0048728, multiple Slack messages
  - Purpose: File share for Altus HQ users
  - Issues: Permission/access problems

### Network Equipment
- [To be discovered]

### Applications
- [To be discovered]
```

**Time estimate**: 1-2 hours

**Deliverable**: `altus-infrastructure-inventory.md` with initial list

---

### Step 1.2: Design CMDB CI Template

Based on what we find, create a reusable template that:
- Captures essential info for troubleshooting
- Is easy for AI to search/parse
- Balances completeness with practicality

**Template Structure** (see `templates/cmdb-ci-template.json` created below)

**Fields to include**:
- **Required**: Name, IP, Type, Support Team
- **Important**: Location, Purpose, Primary Users
- **Nice-to-have**: Documentation links, Dependencies, Known issues
- **AI-Searchable**: Tags, keywords from conversations

**Time estimate**: 30 minutes

**Deliverable**: Working template in JSON format

---

### Step 1.3: Document First 3 CIs Manually

Pick 3 different types:
1. **File Server** (10.252.0.40 - we know this one has issues)
2. **Network Device** (if discovered)
3. **Application/Service** (if discovered)

For each CI:
1. Fill out template completely
2. Add to ServiceNow manually (or document what would go there)
3. Test: Can PeterPool find it? Does search work?
4. Note: What was hard? What info was missing?

**Time estimate**: 1 hour

**Deliverable**:
- 3 completed CI records (JSON format)
- Lessons learned document

---

## Phase 2: Refine Template & Process (Week 2)

### Step 2.1: Review & Adjust

**Questions to answer**:
- Which fields were hardest to fill?
- Which fields are most useful for troubleshooting?
- What information do we wish we had captured?
- Are there patterns in how we describe infrastructure?

**Actions**:
- Update template based on learnings
- Create field guidelines (examples of good vs bad entries)
- Document "AI-friendly" descriptions (how to write so PeterPool can find it)

**Deliverable**: Template v2.0 + Field Guidelines

---

### Step 2.2: Bulk Documentation Sprint

**Goal**: Document 10-15 more Altus CIs using refined template

**Process**:
1. Use template to document remaining infrastructure
2. Assign ownership/support teams
3. Add to tracking sheet/database
4. Upload to ServiceNow (manual or bulk import)

**Quality checks**:
- [ ] Can I find this CI by IP address search?
- [ ] Can I find this CI by name search?
- [ ] Does description explain purpose clearly?
- [ ] Are support contacts correct?

**Deliverable**: 15-20 documented Altus CIs

---

### Step 2.3: Test PeterPool Integration

**Scenarios to test**:
1. User mentions "10.252.0.40" in Slack → PeterPool finds CI, shares info
2. User mentions "L drive" → PeterPool finds file server CI
3. User mentions "Altus file server" → PeterPool finds CI
4. User has permission issue → PeterPool references support team from CI

**Success criteria**:
- PeterPool finds CI in 80%+ of test cases
- Information returned is accurate and helpful
- Response time is acceptable

**Deliverable**: Test results + refinement list

---

## Phase 3: Semi-Automation (Week 3-4)

### Step 3.1: AI-Assisted Drafting

**Goal**: Let AI help draft CI records from conversation context

**Process**:
1. When infrastructure mentioned in Slack without CMDB entry
2. PeterPool gathers context from conversation
3. PeterPool drafts CI record using template
4. Posts draft to steward channel for review
5. Human approves/edits → CI created

**Implementation**:
- Enhance PeterPool with CI drafting capability
- Create steward review workflow
- Test with 5-10 new infrastructure mentions

**Deliverable**: Working draft-and-review system

---

### Step 3.2: Conversation Mining

**Goal**: Extract infrastructure from historical conversations

**Process**:
1. Run script to scan last 90 days of #altus-support
2. Extract IP addresses, server names, share paths
3. Cross-check against existing CMDB
4. Generate "missing CI" list
5. Batch process using AI-assisted drafting

**Deliverable**:
- Discovered infrastructure list
- Gap analysis report
- Batch of AI-drafted CIs for review

---

## Phase 4: Full Automation (Month 2)

### Step 4.1: Proactive CI Detection

**PeterPool automatically**:
- Detects undocumented infrastructure in conversations
- Drafts CI record with available context
- Asks clarifying questions if info missing
- Routes to steward for approval
- Auto-creates in ServiceNow when approved

### Step 4.2: Continuous Maintenance

**PeterPool monitors**:
- Changes to existing infrastructure
- New mentions that might indicate updates needed
- CIs that haven't been referenced in 6+ months (stale?)

### Step 4.3: Expand to Other Customers

Once Altus process is solid:
1. Document lessons learned
2. Create playbook
3. Apply to next customer
4. Rinse and repeat

---

## Templates & Tools

### CI Template Structure

See: `templates/cmdb-ci-template.json`

**Key principles**:
- Use consistent naming conventions
- Include search keywords/tags
- Link to related documentation
- Capture support ownership clearly

### Tracking Spreadsheet

Create simple tracker:
| CI Name | Type | IP/Hostname | Status | Owner | ServiceNow Link | Notes |
|---------|------|-------------|--------|-------|-----------------|-------|
| Altus L Drive | File Server | 10.252.0.40 | Documented | Altus IT | [link] | Common permission issues |

---

## Success Metrics

### Phase 1 (Manual)
- [ ] 3 CIs documented with complete template
- [ ] Template validated by actual use
- [ ] PeterPool can find all 3 CIs

### Phase 2 (Refinement)
- [ ] 15-20 Altus CIs documented
- [ ] 80%+ findable by PeterPool
- [ ] Support teams confirmed correct

### Phase 3 (Semi-Auto)
- [ ] AI drafting tested on 10+ cases
- [ ] 70%+ draft accuracy (human review needed for 30%)
- [ ] Steward approval workflow working

### Phase 4 (Full Auto)
- [ ] PeterPool auto-detects new infrastructure
- [ ] <24hr from mention to CMDB entry
- [ ] 90%+ of infrastructure documented

---

## Next Steps

1. **Schedule inventory session** (1-2 hours)
   - Who: You + Altus engineer
   - When: [TBD]
   - Prep: Review #altus-support last 60 days

2. **Create first 3 CI records**
   - Use template
   - Document learnings
   - Test with PeterPool

3. **Decide on ServiceNow import method**
   - Manual entry?
   - Bulk CSV import?
   - API automation?

4. **Set up steward approval channel**
   - Who reviews CI drafts?
   - What's approval process?
   - How do we handle rejections?

---

## Questions to Answer During Pilot

- [ ] What's the minimum viable CI record? (What can we skip?)
- [ ] How do we handle infrastructure that spans multiple customers?
- [ ] What naming convention works best for search?
- [ ] How often should CIs be reviewed/updated?
- [ ] Who owns CMDB accuracy? (Stewards? Teams? Automated audits?)
- [ ] What triggers a CI update? (Move? Change? Incident?)

---

## Resources

- Template: `templates/cmdb-ci-template.json`
- Example: `examples/altus-file-server-example.json`
- Scripts: `scripts/discover-infrastructure.ts` (when ready)
- PeterPool integration: `lib/services/cmdb-drafter.ts` (Phase 3)
