# ServiceNow Platform Updates - CAB Checklist

1. **Documentation**
   - [ ] Business justification references vendor patch / compliance
   - [ ] Implementation plan names build/patch version
   - [ ] Rollback plan references snapshot verification
   - [ ] Communications list (stakeholders + timing)
   - [ ] Test plan covers catalog, authentication, notifications, integrations
2. **Environment**
   - [ ] UAT clone ≤ 30 days
   - [ ] Snapshot scheduled and confirmed
3. **Impact Considerations**
   - [ ] LDAP listeners / SSO
   - [ ] MID server maintenance windows
   - [ ] Workflow approvals unaffected
   - [ ] Change freeze windows respected
4. **Historical Notes**
   - [ ] Prior failures addressed (e.g., missing comms)
