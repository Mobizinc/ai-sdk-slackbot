# PROD Service Deployment Summary - Altus Health

## Overview
Successfully deployed complete MSP service portfolio for Altus Health in PROD environment.

## What Was Created

### 1. Business Service
- **Name**: Managed Support Services
- **sys_id**: e24d6752c368721066d9bdb4e40131a8
- **Number**: BSN0001019
- **Vendor**: Mobiz IT (sys_id: 2d6a47c7870011100fadcbb6dabb35fb)

### 2. Service Offerings (6 total)
All linked to "Managed Support Services" Business Service with Mobiz IT as vendor:

1. **Infrastructure and Cloud Management**
   - sys_id: 0f4e2f96c320f210ad36b9ff050131f5

2. **Network Management**
   - sys_id: 6b4e6f96c320f210ad36b9ff050131ba

3. **Cybersecurity Management**
   - sys_id: 4c5eaf96c320f210ad36b9ff05013172

4. **Helpdesk and Endpoint Support - 24/7**
   - sys_id: 377ea3d2c368721066d9bdb4e40131d2

5. **Helpdesk and Endpoint - Standard**
   - sys_id: ae8f6356c368721066d9bdb4e40131a3
   - Note: Shortened from "Helpdesk and Endpoint Support - Standard Business Hours" due to character limit

6. **Application Administration**
   - sys_id: 7abe6bd6c320f210ad36b9ff05013112

### 3. Application Services (24 total)
All services have:
- **Company**: Altus Community Healthcare (sys_id: c3eec28c931c9a1049d9764efaba10f3)
- **Vendor**: Mobiz IT (sys_id: 2d6a47c7870011100fadcbb6dabb35fb)
- **Operational Status**: Operational

#### Application Administration (18 services)
1. Altus Health - NextGen Production
2. Altus Health - Novarad Production
3. Altus Health - Epowerdocs (EPD) Production
4. Altus Health - TSheet Account
5. Altus Health - Qgenda Account
6. Altus Health - Paylocity Account
7. Altus Health - Availity Account
8. Altus Health - GlobalPay Account
9. Altus Health - Gorev Production
10. Altus Health - Imagine Production
11. Altus Health - Medicus Production
12. Altus Health - One Source Account
13. Altus Health - OnePACS Production
14. Altus Health - TruBridge Production
15. Altus Health - ViaTrack Production
16. Altus Health - VizTech Production
17. Altus Health - WayStar Account
18. Altus Health - Magdou Health (PACS) Production

#### Infrastructure and Cloud Management (5 services)
19. Altus Health - O365 Production
20. Altus Health - Azure Environment
21. Altus Health - Corporate Fileshares
22. Altus Health - Endpoint Management Platform
23. Altus Health - Active Directory

#### Network Management (1 service)
24. Altus Health - Vonage UCaaS

## Key Findings and Lessons Learned

### 1. Vendor Field Requirement
**Issue**: ServiceNow business rule "Check Uniqueness for SN App Service ID" blocks creation of Business Services and Service Offerings without the `vendor` field.

**Solution**: Always include `vendor` field when creating:
- Business Services: `vendor: '2d6a47c7870011100fadcbb6dabb35fb'` (Mobiz IT)
- Service Offerings: `vendor: '2d6a47c7870011100fadcbb6dabb35fb'` (Mobiz IT)
- Application Services: `vendor: '2d6a47c7870011100fadcbb6dabb35fb'` (Mobiz IT)

**Note**: For Application Services, both fields are needed:
- `company`: Customer who owns/uses the service (Altus)
- `vendor`: MSP who provides/manages the service (Mobiz IT)

### 2. Service Offering Name Character Limit
**Issue**: Service Offering names longer than approximately 36-40 characters trigger business rule failures.

**Evidence**:
- ❌ Failed: "Helpdesk and Endpoint Support - Standard Business Hours" (55 chars)
- ❌ Failed: "Helpdesk and Endpoint Support - Standard" (40 chars)
- ✅ Success: "Helpdesk and Endpoint - Standard" (32 chars)
- ✅ Success: "Helpdesk and Endpoint Support - 24/7" (36 chars)

**Best Practice**: Keep Service Offering names under 36 characters to avoid business rule conflicts.

### 3. Consistency is Critical
All records in the same hierarchy (Business Service → Service Offerings → Application Services) must have consistent vendor assignments to maintain proper CMDB relationships and satisfy business rules.

## Scripts Updated

The following scripts were updated to include vendor field and corrected names:

1. **setup-service-portfolio.ts**
   - Added vendor field to Business Service creation
   - Added vendor field to Service Offering creation
   - Updated Service Offering name to shorter version

2. **setup-altus-application-services.ts**
   - Added vendor field to Application Service creation
   - Clarified company vs vendor field usage in comments

## Verification

All services verified to exist in PROD:
- ✅ 1 Business Service
- ✅ 6 Service Offerings (all with correct parent and vendor)
- ✅ 24 Application Services (all with correct parent, company, and vendor)

Total: 31 CMDB records created successfully

## Environment Details

- **Environment**: PRODUCTION
- **Instance URL**: https://mobiz.service-now.com
- **Service Account**: SVC.Mobiz.Integration.TableAPI.PROD
- **Deployment Date**: 2025-10-15
- **Customer Account**: ACCT0010145 (Altus Community Healthcare)

## View in ServiceNow

Business Service:
https://mobiz.service-now.com/nav_to.do?uri=cmdb_ci_service_business.do?sys_id=e24d6752c368721066d9bdb4e40131a8
