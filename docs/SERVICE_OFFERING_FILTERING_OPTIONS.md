# Service Offering Filtering Solutions for MSP Architecture

## Executive Summary

This document provides detailed explanations of two architectural approaches to fix the Service Offering lookup issue in an MSP (Managed Service Provider) ServiceNow instance. The core problem is that Service Offerings are children of the service portfolio ("Managed Support Services"), but incidents reference customer Business Services ("Altus Health - TSheet Account"), creating a parent-child mismatch in reference qualifiers.

## Problem Context

**Current Environment:**
- MSP managing multiple customers (Altus, others)
- Service Portfolio: "Managed Support Services" containing 6 service offerings
- Service Offerings: "24/7 Help Desk Support", "Infrastructure and Cloud Management", etc.
- Business Services: Customer-specific applications (e.g., "Altus Health - TSheet Account", "Altus Infrastructure")
- Incidents reference: `business_service` = customer application
- Service Offerings have: `parent` = "Managed Support Services"

**Current Reference Qualifier:**
```javascript
javascript:'parent='+current.business_service;
```

**Problem:** This searches for Service Offerings where `parent` equals the incident's Business Service, but Service Offerings' parent is the portfolio, not the customer application. Result: "No records to display"

---

## Option B: Contract-Based Filtering (RECOMMENDED)

### 1. Conceptual Overview

**Core Concept:** Use ServiceNow's Service Portfolio Management (SPM) framework to create formal contractual relationships between customers and the service offerings they've purchased.

**Underlying Logic:**
The `cmdb_ci_service_commitment` table is the OOTB (out-of-box) ServiceNow mechanism for tracking which customers have access to which services. Think of it as a "subscription" or "entitlement" record that says:
- Customer X has purchased Service Offering Y
- This relationship is active from Date A to Date B
- This may include SLA terms, pricing tiers, etc.

When an incident is logged against a customer's Business Service, we can:
1. Identify which customer owns that Business Service (via CI relationships or custom fields)
2. Look up all service commitments for that customer
3. Display only the Service Offerings they've actually purchased

**Benefits of OOTB Framework:**
- Aligns with ServiceNow best practices for SPM
- Enables contract lifecycle management
- Supports SLA tracking and service catalogs
- Provides audit trail of service entitlements
- Scales naturally as you add customers and services

---

### 2. Step-by-Step Implementation

#### Phase 1: Data Model Setup

**Step 1: Identify Customer Relationships**

First, ensure your Business Services have a clear link to the customer company record.

```javascript
// Script Include: CustomerServiceHelper
var CustomerServiceHelper = Class.create();
CustomerServiceHelper.prototype = {
    initialize: function() {},

    // Get the customer company from a Business Service
    // Returns: sys_id of the cmdb_ci_business_service's company
    getCustomerFromBusinessService: function(businessServiceSysId) {
        var bs = new GlideRecord('cmdb_ci_business_service');
        if (bs.get(businessServiceSysId)) {
            // Option A: If Business Service has a company field
            if (!gs.nil(bs.company)) {
                return bs.company.toString();
            }

            // Option B: If using owned_by or supported_by relationships
            if (!gs.nil(bs.owned_by)) {
                return bs.owned_by.company.toString();
            }

            // Option C: If using custom field (e.g., u_customer)
            if (!gs.nil(bs.u_customer)) {
                return bs.u_customer.toString();
            }
        }

        gs.error('CustomerServiceHelper: Could not determine customer for Business Service: ' + businessServiceSysId);
        return '';
    },

    type: 'CustomerServiceHelper'
};
```

**Step 2: Create Service Commitments**

Navigate to **Service Portfolio Management > Service Commitments** and create records linking customers to service offerings.

Manual creation example:
- **Consumer**: Altus Health (core_company record)
- **Service Offering**: 24/7 Help Desk Support (service_offering record)
- **Start Date**: 2024-01-01
- **End Date**: 2025-12-31
- **State**: Active

**Step 3: Bulk Import Script (for existing customers)**

If you have existing customers that need service commitments created:

```javascript
// Background Script: Create Service Commitments for all customers
// WARNING: Test in sub-production first!

(function createServiceCommitments() {
    // Configuration
    var servicePortfolioName = 'Managed Support Services';
    var defaultStartDate = new GlideDateTime('2024-01-01');
    var defaultEndDate = new GlideDateTime('2025-12-31');

    // Get all customers (companies with Business Services)
    var customers = [];
    var bsGr = new GlideRecord('cmdb_ci_business_service');
    bsGr.addNotNullQuery('company');
    bsGr.query();

    while (bsGr.next()) {
        var companyId = bsGr.company.toString();
        if (customers.indexOf(companyId) === -1) {
            customers.push(companyId);
        }
    }

    gs.info('Found ' + customers.length + ' unique customers');

    // Get all Service Offerings under our portfolio
    var portfolio = new GlideRecord('cmdb_ci_service');
    portfolio.addQuery('name', servicePortfolioName);
    portfolio.query();

    if (!portfolio.next()) {
        gs.error('Service Portfolio not found: ' + servicePortfolioName);
        return;
    }

    var offerings = [];
    var offeringGr = new GlideRecord('service_offering');
    offeringGr.addQuery('parent', portfolio.sys_id);
    offeringGr.query();

    while (offeringGr.next()) {
        offerings.push({
            sys_id: offeringGr.sys_id.toString(),
            name: offeringGr.name.toString()
        });
    }

    gs.info('Found ' + offerings.length + ' service offerings');

    // Create commitments for each customer-offering combination
    var commitmentCount = 0;

    for (var i = 0; i < customers.length; i++) {
        for (var j = 0; j < offerings.length; j++) {
            // Check if commitment already exists
            var existing = new GlideRecord('cmdb_ci_service_commitment');
            existing.addQuery('consumer', customers[i]);
            existing.addQuery('service_offering', offerings[j].sys_id);
            existing.query();

            if (!existing.hasNext()) {
                // Create new commitment
                var commitment = new GlideRecord('cmdb_ci_service_commitment');
                commitment.initialize();
                commitment.consumer = customers[i];
                commitment.service_offering = offerings[j].sys_id;
                commitment.start_date = defaultStartDate;
                commitment.end_date = defaultEndDate;
                commitment.state = '2'; // Active
                commitment.insert();

                commitmentCount++;
                gs.info('Created commitment: Customer ' + customers[i] + ' -> ' + offerings[j].name);
            }
        }
    }

    gs.info('Created ' + commitmentCount + ' new service commitments');
})();
```

#### Phase 2: Reference Qualifier Implementation

**Step 4: Create Advanced Reference Qualifier Script**

Navigate to **System Definition > Dictionary** and find the `service_offering` field on the `incident` table (or create it if it doesn't exist).

Set the **Reference Qualifier** to:
```javascript
javascript:new ServiceOfferingFilter().getQualifier(current);
```

**Step 5: Create Script Include**

```javascript
// Script Include: ServiceOfferingFilter
// Application: Global
// Client callable: false
// Description: Filter Service Offerings based on customer service commitments

var ServiceOfferingFilter = Class.create();
ServiceOfferingFilter.prototype = {
    initialize: function() {
        this.customerHelper = new CustomerServiceHelper();
    },

    /**
     * Generate reference qualifier for Service Offering field
     * @param {GlideRecord} current - The current incident record
     * @returns {String} - Encoded query for service_offering table
     */
    getQualifier: function(current) {
        // If no business service selected, show all offerings
        if (gs.nil(current.business_service)) {
            return 'sys_id!=NULL'; // Shows all records
        }

        // Get customer from Business Service
        var customerId = this.customerHelper.getCustomerFromBusinessService(
            current.business_service.toString()
        );

        if (gs.nil(customerId)) {
            gs.warn('ServiceOfferingFilter: No customer found for Business Service: ' +
                current.business_service.getDisplayValue());
            return 'sys_idISEMPTY'; // Shows no records
        }

        // Get active service commitments for this customer
        var offeringIds = this._getCustomerServiceOfferings(customerId);

        if (offeringIds.length === 0) {
            gs.warn('ServiceOfferingFilter: No service commitments found for customer: ' + customerId);
            return 'sys_idISEMPTY'; // Shows no records
        }

        // Build query: sys_id IN (offering1, offering2, offering3)
        return 'sys_idIN' + offeringIds.join(',');
    },

    /**
     * Get list of Service Offering sys_ids for a customer
     * @param {String} customerId - sys_id of customer company
     * @returns {Array} - Array of service offering sys_ids
     */
    _getCustomerServiceOfferings: function(customerId) {
        var offeringIds = [];
        var now = new GlideDateTime();

        var commitment = new GlideRecord('cmdb_ci_service_commitment');
        commitment.addQuery('consumer', customerId);
        commitment.addQuery('state', '2'); // Active state
        commitment.addQuery('start_date', '<=', now); // Started
        commitment.addQuery('end_date', '>=', now); // Not expired
        commitment.query();

        while (commitment.next()) {
            if (!gs.nil(commitment.service_offering)) {
                var offeringId = commitment.service_offering.toString();
                if (offeringIds.indexOf(offeringId) === -1) {
                    offeringIds.push(offeringId);
                }
            }
        }

        return offeringIds;
    },

    type: 'ServiceOfferingFilter'
};
```

#### Phase 3: Testing and Validation

**Step 6: Create Test Script**

```javascript
// Background Script: Test Service Offering Filter

(function testServiceOfferingFilter() {
    var testIncidentNumber = 'INC0167770';

    var inc = new GlideRecord('incident');
    if (!inc.get('number', testIncidentNumber)) {
        gs.error('Test incident not found: ' + testIncidentNumber);
        return;
    }

    gs.info('Testing with Incident: ' + inc.number);
    gs.info('Business Service: ' + inc.business_service.getDisplayValue());

    // Simulate the filter
    var filter = new ServiceOfferingFilter();
    var qualifier = filter.getQualifier(inc);

    gs.info('Generated Qualifier: ' + qualifier);

    // Execute the query to see results
    var offerings = new GlideRecord('service_offering');
    offerings.addEncodedQuery(qualifier);
    offerings.query();

    gs.info('--- Available Service Offerings ---');
    var count = 0;
    while (offerings.next()) {
        count++;
        gs.info(count + '. ' + offerings.name + ' (' + offerings.sys_id + ')');
    }

    if (count === 0) {
        gs.error('No service offerings returned! Check customer commitments.');
    } else {
        gs.info('SUCCESS: ' + count + ' service offerings available');
    }
})();
```

---

### 3. Real-World Example Walkthrough

**Scenario:**
- Incident: INC0167770
- Business Service: "Altus Health - TSheet Account" (sys_id: abc123)
- Customer: Altus Health (core_company sys_id: xyz789)
- Available Service Offerings:
  - 24/7 Help Desk Support (sys_id: off001)
  - Infrastructure and Cloud Management (sys_id: off002)
  - Security Monitoring (sys_id: off003)
  - Backup and Disaster Recovery (sys_id: off004)

**Step-by-Step Execution:**

1. **User opens INC0167770 and clicks Service Offering field**
   - System triggers reference qualifier: `javascript:new ServiceOfferingFilter().getQualifier(current);`

2. **ServiceOfferingFilter.getQualifier() executes**
   - Input: `current.business_service = "Altus Health - TSheet Account" (abc123)`
   - Calls: `customerHelper.getCustomerFromBusinessService(abc123)`
   - Result: Returns customer sys_id `xyz789` (Altus Health company)

3. **_getCustomerServiceOfferings(xyz789) queries commitments**
   ```sql
   SELECT service_offering
   FROM cmdb_ci_service_commitment
   WHERE consumer = 'xyz789'
     AND state = '2' -- Active
     AND start_date <= NOW()
     AND end_date >= NOW()
   ```
   - Result: Returns array `['off001', 'off002', 'off003', 'off004']`

4. **Builds encoded query**
   - Returns: `sys_idINoff001,off002,off003,off004`

5. **Service Offering dropdown renders**
   - Shows only:
     - 24/7 Help Desk Support
     - Infrastructure and Cloud Management
     - Security Monitoring
     - Backup and Disaster Recovery
   - DOES NOT show offerings where no commitment exists

6. **User selects "24/7 Help Desk Support"**
   - Selection saved to `incident.service_offering = off001`
   - Reporting and metrics can now track which services are being utilized

---

### 4. Pros and Cons

**Pros:**
- **OOTB Framework**: Uses native ServiceNow SPM capabilities
- **Scalable**: Easily add new customers and services without code changes
- **Audit Trail**: Full lifecycle tracking of service entitlements
- **SLA Integration**: Can tie to SLA definitions and contract terms
- **Reporting Ready**: Native reports for service utilization, contract renewals
- **Data Integrity**: Ensures users only select services customers actually purchased
- **Self-Documenting**: Service commitments serve as contract documentation
- **Future-Proof**: Supports growth into full SPM implementation
- **Governance**: Clear accountability for which customers have which services

**Cons:**
- **Initial Setup**: Requires creating service commitments for all customers
- **Maintenance Overhead**: Must update commitments when contracts change
- **Data Dependencies**: Requires clean customer-to-business-service relationships
- **Learning Curve**: Team needs to understand SPM framework
- **Migration Effort**: Existing incidents may need backfilling if service offering was optional
- **Complexity**: More moving parts than simpler category-based approach

---

### 5. Maintenance and Scalability

**Ongoing Maintenance:**

1. **New Customer Onboarding** (Frequency: As needed)
   ```javascript
   // When onboarding a new customer, run this script
   function onboardNewCustomer(customerSysId, offeringSysIds) {
       var startDate = new GlideDateTime();
       var endDate = new GlideDateTime();
       endDate.addYears(1); // 1-year contract

       for (var i = 0; i < offeringSysIds.length; i++) {
           var commitment = new GlideRecord('cmdb_ci_service_commitment');
           commitment.initialize();
           commitment.consumer = customerSysId;
           commitment.service_offering = offeringSysIds[i];
           commitment.start_date = startDate;
           commitment.end_date = endDate;
           commitment.state = '2'; // Active
           commitment.insert();
       }
   }
   ```

2. **Contract Renewals** (Frequency: Annually or per contract terms)
   - Update end dates on existing commitments
   - Add/remove offerings based on contract changes
   - Could automate with scheduled jobs that send reminders 30/60/90 days before expiration

3. **New Service Offerings** (Frequency: Quarterly or as new services launch)
   - Create new service_offering record
   - Create commitments for customers purchasing the new service
   - No code changes required

4. **Decommissioned Services**
   - Set commitment state to "Retired"
   - Existing incident data preserved for historical reporting

**Scalability Considerations:**

- **Performance**: Query on indexed fields (consumer, state, dates) - scales well to thousands of commitments
- **100 Customers × 10 Services = 1,000 commitments** - No performance issues
- **1,000 Customers × 50 Services = 50,000 commitments** - Still performant with proper indexing
- **Optimization**: Consider caching customer offerings if query performance becomes an issue

**Best Practices:**
- Create Business Rule on `cmdb_ci_service_commitment` to invalidate cache on insert/update
- Set up scheduled job to deactivate expired commitments (daily)
- Configure notifications for expiring contracts (30-day warning)
- Implement approval workflow for new commitment creation (governance)

---

## Option C: Category-Based Filtering

### 1. Conceptual Overview

**Core Concept:** Categorize Business Services and create mappings that determine which Service Offerings are available for each category.

**Underlying Logic:**
Business Services fall into natural groups (e.g., "Infrastructure", "Applications", "Security Services"). By assigning a category to each Business Service, we can create rules like:
- Infrastructure Business Services → Show "Infrastructure and Cloud Management", "Backup and Disaster Recovery"
- Application Business Services → Show "24/7 Help Desk Support", "Application Support"
- Security Business Services → Show "Security Monitoring", "Compliance Auditing"

When an incident references a Business Service, we:
1. Read the Business Service's category
2. Look up which Service Offerings are mapped to that category
3. Filter the dropdown to show only those offerings

**Benefits of Simplicity:**
- Minimal data entry (one category per Business Service)
- No per-customer configuration required
- Easy to understand and explain
- Aligns services by technical domain

---

### 2. Step-by-Step Implementation

#### Phase 1: Category Design

**Step 1: Define Service Categories**

Create a choice list for Business Service categories. Navigate to **System Definition > Choice Lists**.

Table: `cmdb_ci_business_service`
Field: `u_service_category` (create if doesn't exist)

**Choice Values:**
- `infrastructure` - Infrastructure Services
- `application` - Business Applications
- `database` - Database Services
- `network` - Network Services
- `security` - Security Services
- `collaboration` - Collaboration Tools
- `backup_dr` - Backup and Disaster Recovery
- `general` - General Support

**Step 2: Categorize Existing Business Services**

```javascript
// Background Script: Categorize Business Services
// This is a one-time or periodic script to assign categories

(function categorizeBusinessServices() {
    // Define categorization rules
    var categorizationRules = [
        {
            pattern: /tsheet|timesheet|accounting|erp|crm|salesforce/i,
            category: 'application'
        },
        {
            pattern: /infrastructure|vmware|hyper-v|host|server farm/i,
            category: 'infrastructure'
        },
        {
            pattern: /sql|database|mysql|postgres|oracle/i,
            category: 'database'
        },
        {
            pattern: /network|firewall|switch|router|vpn/i,
            category: 'network'
        },
        {
            pattern: /security|ids|ips|antivirus|endpoint/i,
            category: 'security'
        },
        {
            pattern: /backup|disaster|recovery|replication/i,
            category: 'backup_dr'
        },
        {
            pattern: /email|exchange|office 365|teams|sharepoint/i,
            category: 'collaboration'
        }
    ];

    var bs = new GlideRecord('cmdb_ci_business_service');
    bs.addNullQuery('u_service_category'); // Only uncategorized services
    bs.query();

    var categorized = 0;
    var uncategorized = 0;

    while (bs.next()) {
        var serviceName = bs.name.toString().toLowerCase();
        var serviceDescription = bs.short_description.toString().toLowerCase();
        var matched = false;

        for (var i = 0; i < categorizationRules.length; i++) {
            var rule = categorizationRules[i];
            if (rule.pattern.test(serviceName) || rule.pattern.test(serviceDescription)) {
                bs.u_service_category = rule.category;
                bs.update();
                categorized++;
                matched = true;
                gs.info('Categorized: ' + bs.name + ' -> ' + rule.category);
                break;
            }
        }

        if (!matched) {
            // Default to 'general' if no pattern matches
            bs.u_service_category = 'general';
            bs.update();
            uncategorized++;
            gs.warn('Default categorization: ' + bs.name + ' -> general');
        }
    }

    gs.info('Categorization complete:');
    gs.info('- Matched to specific categories: ' + categorized);
    gs.info('- Defaulted to general: ' + uncategorized);
})();
```

**Step 3: Create Category-to-Offering Mapping Table**

Create a custom table: `u_service_category_mapping`

**Fields:**
- `u_service_category` (String, Choice List - reuse choices from Business Service)
- `u_service_offering` (Reference to service_offering)
- `u_active` (Boolean, default: true)
- `u_priority` (Integer) - Optional, for ordering offerings in dropdown

Navigate to **System Definition > Tables** and create:

**Table Structure:**
```
Table: u_service_category_mapping
Label: Service Category Mapping
Extends: None (standalone table)
```

**Step 4: Populate Mapping Table**

```javascript
// Background Script: Create Category-to-Offering Mappings

(function createCategoryMappings() {
    // Define which Service Offerings apply to which categories
    var mappings = {
        'infrastructure': [
            'Infrastructure and Cloud Management',
            'Backup and Disaster Recovery',
            'Security Monitoring',
            'Vendor Management'
        ],
        'application': [
            '24/7 Help Desk Support',
            'Application Support',
            'Infrastructure and Cloud Management'
        ],
        'database': [
            'Infrastructure and Cloud Management',
            'Backup and Disaster Recovery',
            'Database Administration'
        ],
        'network': [
            'Infrastructure and Cloud Management',
            'Network Operations',
            'Security Monitoring'
        ],
        'security': [
            'Security Monitoring',
            'Compliance Auditing',
            'Incident Response'
        ],
        'collaboration': [
            '24/7 Help Desk Support',
            'Application Support',
            'Email and Collaboration Support'
        ],
        'backup_dr': [
            'Backup and Disaster Recovery',
            'Infrastructure and Cloud Management'
        ],
        'general': [
            '24/7 Help Desk Support',
            'Infrastructure and Cloud Management',
            'Vendor Management'
        ]
    };

    // Get Service Offering sys_ids by name
    function getOfferingSysId(offeringName) {
        var offering = new GlideRecord('service_offering');
        offering.addQuery('name', offeringName);
        offering.query();
        if (offering.next()) {
            return offering.sys_id.toString();
        }
        return null;
    }

    var createdCount = 0;

    for (var category in mappings) {
        var offerings = mappings[category];

        for (var i = 0; i < offerings.length; i++) {
            var offeringSysId = getOfferingSysId(offerings[i]);

            if (offeringSysId) {
                // Check if mapping already exists
                var existing = new GlideRecord('u_service_category_mapping');
                existing.addQuery('u_service_category', category);
                existing.addQuery('u_service_offering', offeringSysId);
                existing.query();

                if (!existing.hasNext()) {
                    var mapping = new GlideRecord('u_service_category_mapping');
                    mapping.initialize();
                    mapping.u_service_category = category;
                    mapping.u_service_offering = offeringSysId;
                    mapping.u_active = true;
                    mapping.u_priority = (i + 1) * 10; // 10, 20, 30, etc.
                    mapping.insert();
                    createdCount++;
                    gs.info('Created mapping: ' + category + ' -> ' + offerings[i]);
                } else {
                    gs.info('Mapping already exists: ' + category + ' -> ' + offerings[i]);
                }
            } else {
                gs.error('Service Offering not found: ' + offerings[i]);
            }
        }
    }

    gs.info('Created ' + createdCount + ' new mappings');
})();
```

#### Phase 2: Reference Qualifier Implementation

**Step 5: Create Reference Qualifier Script Include**

```javascript
// Script Include: ServiceOfferingCategoryFilter
// Application: Global
// Client callable: false
// Description: Filter Service Offerings based on Business Service category

var ServiceOfferingCategoryFilter = Class.create();
ServiceOfferingCategoryFilter.prototype = {
    initialize: function() {},

    /**
     * Generate reference qualifier for Service Offering field
     * @param {GlideRecord} current - The current incident record
     * @returns {String} - Encoded query for service_offering table
     */
    getQualifier: function(current) {
        // If no business service selected, show all offerings
        if (gs.nil(current.business_service)) {
            return 'sys_id!=NULL'; // Shows all records
        }

        // Get category from Business Service
        var category = this._getBusinessServiceCategory(current.business_service.toString());

        if (gs.nil(category)) {
            gs.warn('ServiceOfferingCategoryFilter: No category found for Business Service: ' +
                current.business_service.getDisplayValue());
            // Fallback: show offerings mapped to 'general' category
            category = 'general';
        }

        // Get Service Offerings for this category
        var offeringIds = this._getOfferingsForCategory(category);

        if (offeringIds.length === 0) {
            gs.warn('ServiceOfferingCategoryFilter: No offerings mapped to category: ' + category);
            return 'sys_idISEMPTY'; // Shows no records
        }

        // Build query: sys_id IN (offering1, offering2, offering3)
        return 'sys_idIN' + offeringIds.join(',');
    },

    /**
     * Get category of a Business Service
     * @param {String} businessServiceSysId - sys_id of Business Service
     * @returns {String} - Category value or null
     */
    _getBusinessServiceCategory: function(businessServiceSysId) {
        var bs = new GlideRecord('cmdb_ci_business_service');
        if (bs.get(businessServiceSysId)) {
            return bs.u_service_category.toString();
        }
        return null;
    },

    /**
     * Get Service Offerings mapped to a category
     * @param {String} category - Category value
     * @returns {Array} - Array of service offering sys_ids
     */
    _getOfferingsForCategory: function(category) {
        var offeringIds = [];

        var mapping = new GlideRecord('u_service_category_mapping');
        mapping.addQuery('u_service_category', category);
        mapping.addQuery('u_active', true);
        mapping.orderBy('u_priority');
        mapping.query();

        while (mapping.next()) {
            if (!gs.nil(mapping.u_service_offering)) {
                var offeringId = mapping.u_service_offering.toString();
                if (offeringIds.indexOf(offeringId) === -1) {
                    offeringIds.push(offeringId);
                }
            }
        }

        return offeringIds;
    },

    type: 'ServiceOfferingCategoryFilter'
};
```

**Step 6: Update Dictionary Entry**

Navigate to **System Definition > Dictionary** and find the `service_offering` field on the `incident` table.

Set the **Reference Qualifier** to:
```javascript
javascript:new ServiceOfferingCategoryFilter().getQualifier(current);
```

#### Phase 3: Testing and Validation

**Step 7: Test Script**

```javascript
// Background Script: Test Category-Based Filter

(function testCategoryFilter() {
    var testIncidentNumber = 'INC0167770';

    var inc = new GlideRecord('incident');
    if (!inc.get('number', testIncidentNumber)) {
        gs.error('Test incident not found: ' + testIncidentNumber);
        return;
    }

    gs.info('=== Testing Category-Based Filter ===');
    gs.info('Incident: ' + inc.number);
    gs.info('Business Service: ' + inc.business_service.getDisplayValue());

    // Get Business Service category
    var bs = new GlideRecord('cmdb_ci_business_service');
    if (bs.get(inc.business_service)) {
        gs.info('Business Service Category: ' + bs.u_service_category.getDisplayValue());
    }

    // Simulate the filter
    var filter = new ServiceOfferingCategoryFilter();
    var qualifier = filter.getQualifier(inc);

    gs.info('Generated Qualifier: ' + qualifier);

    // Execute the query to see results
    var offerings = new GlideRecord('service_offering');
    offerings.addEncodedQuery(qualifier);
    offerings.query();

    gs.info('--- Available Service Offerings ---');
    var count = 0;
    while (offerings.next()) {
        count++;
        gs.info(count + '. ' + offerings.name + ' (' + offerings.sys_id + ')');
    }

    if (count === 0) {
        gs.error('No service offerings returned! Check category mappings.');
    } else {
        gs.info('SUCCESS: ' + count + ' service offerings available');
    }
})();
```

---

### 3. Real-World Example Walkthrough

**Scenario:**
- Incident: INC0167770
- Business Service: "Altus Health - TSheet Account" (sys_id: abc123)
- Business Service Category: `application` (because "TSheet" is an application)
- Category Mappings:
  - application → 24/7 Help Desk Support (off001)
  - application → Application Support (off002)
  - application → Infrastructure and Cloud Management (off003)

**Step-by-Step Execution:**

1. **User opens INC0167770 and clicks Service Offering field**
   - System triggers reference qualifier: `javascript:new ServiceOfferingCategoryFilter().getQualifier(current);`

2. **ServiceOfferingCategoryFilter.getQualifier() executes**
   - Input: `current.business_service = "Altus Health - TSheet Account" (abc123)`
   - Calls: `_getBusinessServiceCategory(abc123)`
   - Result: Returns `'application'`

3. **_getOfferingsForCategory('application') queries mappings**
   ```sql
   SELECT u_service_offering
   FROM u_service_category_mapping
   WHERE u_service_category = 'application'
     AND u_active = true
   ORDER BY u_priority
   ```
   - Result: Returns array `['off001', 'off002', 'off003']`

4. **Builds encoded query**
   - Returns: `sys_idINoff001,off002,off003`

5. **Service Offering dropdown renders**
   - Shows only:
     - 24/7 Help Desk Support
     - Application Support
     - Infrastructure and Cloud Management
   - DOES NOT show: Backup and Disaster Recovery, Security Monitoring, etc.

6. **User selects "24/7 Help Desk Support"**
   - Selection saved to `incident.service_offering = off001`
   - Makes sense because this is an application-related incident

**Alternative Scenario:**
- If Business Service was "Altus Infrastructure" (category: `infrastructure`)
- Mappings would return different offerings:
  - Infrastructure and Cloud Management
  - Backup and Disaster Recovery
  - Security Monitoring
  - Vendor Management

---

### 4. Pros and Cons

**Pros:**
- **Simplicity**: Easy to understand and implement
- **Minimal Data Entry**: Only need to categorize each Business Service once
- **No Per-Customer Config**: Works the same for all customers
- **Low Maintenance**: Changes only when adding new categories or offerings
- **Fast Performance**: Simple query on mapping table
- **Self-Service**: Support staff can update categories without admin access
- **Logical Grouping**: Aligns services by technical domain
- **Flexible**: Easy to adjust mappings as service definitions evolve

**Cons:**
- **Less Granular**: Cannot handle customer-specific service variations
- **Oversimplification**: Assumes all customers have access to all services in a category
- **No Contract Tracking**: Doesn't reflect actual purchased services
- **No SLA Integration**: Can't tie to contract terms or service levels
- **Categorization Challenges**: Some services may fit multiple categories
- **No Audit Trail**: Doesn't track when customers start/stop having access to services
- **Scalability Limits**: As service portfolio grows, category management becomes complex
- **Reporting Gaps**: Can't report on which customers actually purchased which services

---

### 5. Maintenance and Scalability

**Ongoing Maintenance:**

1. **New Business Services** (Frequency: Weekly/Monthly)
   - Assign category when creating/discovering Business Service
   - Can be automated with Business Rule or Discovery pattern

   ```javascript
   // Business Rule on cmdb_ci_business_service: Before Insert
   (function executeRule(current, previous) {
       // Auto-categorize based on name pattern
       if (gs.nil(current.u_service_category)) {
           current.u_service_category = categorizeByName(current.name);
       }

       function categorizeByName(name) {
           name = name.toLowerCase();
           if (/tsheet|app|application|erp|crm/.test(name)) return 'application';
           if (/infrastructure|vmware|host/.test(name)) return 'infrastructure';
           if (/database|sql|oracle/.test(name)) return 'database';
           // ... other patterns
           return 'general'; // default
       }
   })(current, previous);
   ```

2. **New Service Offerings** (Frequency: Quarterly)
   - Add new offering to relevant category mappings
   - Update mapping table with new relationships

3. **Category Refinement** (Frequency: Annually)
   - Review Business Services with 'general' category
   - Split categories if they become too broad
   - Consolidate categories if they're too granular

4. **Mapping Updates** (Frequency: As needed)
   - Adjust which offerings apply to which categories
   - Can be done by service managers without developer involvement

**Scalability Considerations:**

- **Performance**: Very fast - single query on mapping table with category filter
- **10 Categories × 50 Offerings = 500 mappings maximum** - Highly performant
- **1,000 Business Services × 1 category each = 1,000 rows** - No performance issues
- **Data Volume**: Scales linearly with number of Business Services

**Best Practices:**
- Keep number of categories manageable (5-15 categories)
- Document category definitions clearly
- Create UI Action on Business Service form for quick re-categorization
- Set up data quality report for uncategorized Business Services
- Implement periodic review of 'general' category assignments

---

## Comparison: When to Choose Each Option

### Choose Option B (Contract-Based) When:

1. **Strong SPM Requirements**
   - Your organization is implementing or already using Service Portfolio Management
   - You need to track service contracts and entitlements
   - You want to tie services to SLAs and pricing

2. **Customer-Specific Services**
   - Different customers have purchased different service packages
   - You need to prevent selection of services customers don't have
   - You have tiered service offerings (Bronze/Silver/Gold)

3. **Compliance and Governance**
   - You need audit trails for service access
   - You require formal contract lifecycle management
   - You want to report on service utilization by customer

4. **MSP Best Practices**
   - You want to align with ServiceNow MSP framework
   - You plan to grow into full SPM implementation
   - You need integration with contract management

5. **Data Integrity Priority**
   - Absolutely must prevent users from selecting services customers don't have
   - Need to ensure billing matches service delivery

### Choose Option C (Category-Based) When:

1. **Simplicity Priority**
   - You want the simplest possible solution
   - You don't need customer-specific variations
   - Your team has limited ServiceNow experience

2. **All Customers Get All Services**
   - Every customer has access to the full service portfolio
   - Service variations are minimal across customers
   - You're more concerned with logical grouping than access control

3. **Limited Resources**
   - Small support team without dedicated ServiceNow admin
   - Limited time for initial setup and ongoing maintenance
   - No formal contract management process

4. **Technical Categorization Focus**
   - Primary goal is grouping services by technical domain
   - Want to guide users to appropriate service based on issue type
   - Don't need to track actual purchased services

5. **Rapid Implementation**
   - Need solution deployed in days, not weeks
   - Can't wait for contract data to be migrated
   - Want to iterate and refine over time

### Hybrid Approach

Consider combining both methods:
1. Use Category-Based for initial filtering (narrow the list)
2. Then apply Contract-Based to show only purchased services
3. Provides best of both worlds: logical grouping + access control

```javascript
// Hybrid Script Include
getQualifier: function(current) {
    // Step 1: Get category-filtered offerings
    var category = this._getBusinessServiceCategory(current.business_service);
    var categoryOfferingIds = this._getOfferingsForCategory(category);

    // Step 2: Get customer-purchased offerings
    var customerId = this._getCustomerId(current.business_service);
    var purchasedOfferingIds = this._getCustomerServiceOfferings(customerId);

    // Step 3: Intersection of both sets
    var finalOfferingIds = categoryOfferingIds.filter(function(id) {
        return purchasedOfferingIds.indexOf(id) !== -1;
    });

    return 'sys_idIN' + finalOfferingIds.join(',');
}
```

---

## Implementation Roadmap

### Quick Start (Option C - Category-Based)
**Timeline: 1-2 weeks**
- Week 1: Create categories, categorize Business Services, create mapping table
- Week 2: Implement Script Include, test, deploy

### Enterprise Implementation (Option B - Contract-Based)
**Timeline: 4-6 weeks**
- Week 1-2: Design data model, identify customer relationships
- Week 3-4: Create service commitments, implement Script Include
- Week 5: Testing in sub-production
- Week 6: Production deployment and training

### Recommended Phased Approach
1. **Phase 1** (Immediate): Implement Option C for quick win
2. **Phase 2** (Month 2-3): Begin collecting contract data in background
3. **Phase 3** (Month 4): Migrate to Option B or hybrid approach
4. **Phase 4** (Month 5+): Integrate with SLA, reporting, and contract management

---

## Conclusion

Both options solve the core problem of filtering Service Offerings based on the incident's Business Service. The choice depends on your organization's maturity, resources, and long-term ServiceNow strategy.

**Quick Decision Matrix:**

| Factor | Option B | Option C |
|--------|----------|----------|
| Implementation Time | 4-6 weeks | 1-2 weeks |
| Ongoing Maintenance | Medium | Low |
| Data Integrity | High | Medium |
| Scalability | Excellent | Good |
| SPM Alignment | Excellent | None |
| Complexity | Medium-High | Low |
| Contract Tracking | Yes | No |
| Best for | Enterprise MSPs | Small-Medium MSPs |

**My Recommendation:** Start with Option C to get immediate value, then evolve to Option B as your SPM maturity increases. This provides quick wins while building toward a more robust long-term solution.

---

## Additional Resources

**ServiceNow Documentation:**
- Service Portfolio Management: https://docs.servicenow.com/bundle/vancouver-it-business-management/page/product/service-portfolio-management/concept/service-portfolio-management.html
- Service Commitments: https://docs.servicenow.com/bundle/vancouver-it-business-management/page/product/service-portfolio-management/concept/c_ServiceCommitments.html
- Reference Qualifiers: https://docs.servicenow.com/bundle/vancouver-platform-administration/page/administer/reference-pages/concept/c_ReferenceQualifiers.html

**Contact Information:**
For questions or implementation assistance, contact your ServiceNow Technical Account Manager or engage ServiceNow Professional Services.

---

**Document Version:** 1.0
**Last Updated:** 2025-10-21
**Author:** ServiceNow Senior Architect
