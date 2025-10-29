/**
 * ApplicationServiceFilter Script Include
 *
 * Purpose: Provide reference qualifier for business_service field that:
 * 1. Excludes service_offering class
 * 2. Includes services from current company
 * 3. Includes services from parent company hierarchy
 *
 * Usage: Set reference qualifier on incident.business_service to:
 * javascript:new ApplicationServiceFilter().getQualifier(current);
 *
 * Tables: incident, task (any table with company + business_service fields)
 *
 * Author: ServiceNow Architecture Team
 * Date: 2025-10-25
 * Related: INC0167957
 */

var ApplicationServiceFilter = Class.create();
ApplicationServiceFilter.prototype = {
    initialize: function() {
        // Maximum depth to traverse company hierarchy (prevent infinite loops)
        this.MAX_HIERARCHY_DEPTH = 10;

        // Cache for company hierarchy to improve performance
        this._hierarchyCache = {};
    },

    /**
     * Get reference qualifier for business_service field
     *
     * @param {GlideRecord} current - Current incident/task record
     * @return {String} Encoded query string for reference qualifier
     *
     * @example
     * // Returns: sys_class_name!=service_offering^company=abc123^ORcompany=xyz789
     */
    getQualifier: function(current) {
        // Base qualifier: exclude service_offering class
        var qualifier = 'sys_class_name!=service_offering';

        // Validate current record
        if (!this._isValidRecord(current)) {
            gs.debug('ApplicationServiceFilter: Invalid or missing current record, using class filter only');
            return qualifier;
        }

        // Get company from current record
        var companySysId = this._getCompanySysId(current);
        if (!companySysId) {
            gs.debug('ApplicationServiceFilter: No company on current record, using class filter only');
            return qualifier;
        }

        // Get all companies in hierarchy (current + parents)
        var companySysIds = this._getCompanyHierarchy(companySysId);

        if (companySysIds.length > 0) {
            // Build OR condition for all companies in hierarchy
            var companyQuery = this._buildCompanyQuery(companySysIds);
            qualifier += '^' + companyQuery;

            if (gs.getProperty('com.snc.application_service_filter.debug', 'false') === 'true') {
                gs.info('ApplicationServiceFilter: Qualifier = ' + qualifier);
                gs.info('ApplicationServiceFilter: Companies = ' + companySysIds.join(', '));
            }
        }

        return qualifier;
    },

    /**
     * Get reference qualifier including services with NULL company (shared services)
     *
     * @param {GlideRecord} current - Current incident/task record
     * @return {String} Encoded query string
     *
     * @example
     * // Returns: sys_class_name!=service_offering^companyISEMPTY^ORcompany=abc^ORcompany=xyz
     */
    getQualifierWithSharedServices: function(current) {
        var qualifier = 'sys_class_name!=service_offering';

        if (!this._isValidRecord(current)) {
            return qualifier;
        }

        var companySysId = this._getCompanySysId(current);
        if (!companySysId) {
            // No company on incident - show all services except service_offerings
            return qualifier;
        }

        var companySysIds = this._getCompanyHierarchy(companySysId);

        if (companySysIds.length > 0) {
            // Include: matching companies OR NULL company (shared services)
            var companyQuery = 'companyISEMPTY^OR' + this._buildCompanyQuery(companySysIds);
            qualifier += '^' + companyQuery;
        }

        return qualifier;
    },

    /**
     * Validate current record exists and has required fields
     *
     * @param {GlideRecord} current - Record to validate
     * @return {Boolean} True if valid
     * @private
     */
    _isValidRecord: function(current) {
        if (!current) {
            return false;
        }

        // Check if record has company field
        if (!current.isValidField('company')) {
            gs.warn('ApplicationServiceFilter: Current record does not have company field');
            return false;
        }

        return true;
    },

    /**
     * Get company sys_id from current record
     *
     * @param {GlideRecord} current - Current record
     * @return {String} Company sys_id or empty string
     * @private
     */
    _getCompanySysId: function(current) {
        if (!current.company || current.company.nil()) {
            return '';
        }

        return current.company.toString();
    },

    /**
     * Get all company sys_ids in hierarchy (current + all parents)
     *
     * @param {String} companySysId - Starting company sys_id
     * @return {Array<String>} Array of company sys_ids (child first, then parents)
     * @private
     */
    _getCompanyHierarchy: function(companySysId) {
        // Check cache first
        if (this._hierarchyCache[companySysId]) {
            return this._hierarchyCache[companySysId];
        }

        var companies = [];
        var currentCompany = companySysId;
        var depth = 0;

        // Start with the current company
        companies.push(currentCompany);

        // Traverse up the parent hierarchy
        while (depth < this.MAX_HIERARCHY_DEPTH) {
            var companyGr = new GlideRecord('core_company');

            // Get current company record
            if (!companyGr.get(currentCompany)) {
                gs.debug('ApplicationServiceFilter: Company not found: ' + currentCompany);
                break;
            }

            // Check if company is active (optional - comment out if you want inactive parents)
            if (!companyGr.active) {
                gs.debug('ApplicationServiceFilter: Inactive company encountered: ' + companyGr.name);
                // Continue anyway - include inactive parents
            }

            // Check for parent company
            if (companyGr.parent && !companyGr.parent.nil()) {
                var parentSysId = companyGr.parent.toString();

                // Prevent circular references
                if (companies.indexOf(parentSysId) !== -1) {
                    gs.warn('ApplicationServiceFilter: Circular reference detected in company hierarchy at ' + companyGr.name);
                    break;
                }

                companies.push(parentSysId);
                currentCompany = parentSysId;
                depth++;
            } else {
                // No more parents - reached root
                break;
            }
        }

        if (depth >= this.MAX_HIERARCHY_DEPTH) {
            gs.warn('ApplicationServiceFilter: Max hierarchy depth reached. Possible circular reference or very deep hierarchy.');
        }

        // Cache the result
        this._hierarchyCache[companySysId] = companies;

        return companies;
    },

    /**
     * Build company query string from array of sys_ids
     *
     * @param {Array<String>} companySysIds - Array of company sys_ids
     * @return {String} Query string like "company=abc^ORcompany=xyz"
     * @private
     */
    _buildCompanyQuery: function(companySysIds) {
        if (!companySysIds || companySysIds.length === 0) {
            return '';
        }

        var queryParts = [];
        for (var i = 0; i < companySysIds.length; i++) {
            queryParts.push('company=' + companySysIds[i]);
        }

        return queryParts.join('^OR');
    },

    /**
     * Clear hierarchy cache (useful for testing)
     *
     * @public
     */
    clearCache: function() {
        this._hierarchyCache = {};
    },

    /**
     * Test method to verify company hierarchy traversal
     *
     * @param {String} companySysId - Company sys_id to test
     * @return {Array<Object>} Array of company objects with name and sys_id
     * @public
     */
    testHierarchy: function(companySysId) {
        var companySysIds = this._getCompanyHierarchy(companySysId);
        var result = [];

        for (var i = 0; i < companySysIds.length; i++) {
            var companyGr = new GlideRecord('core_company');
            if (companyGr.get(companySysIds[i])) {
                result.push({
                    sys_id: companyGr.sys_id.toString(),
                    name: companyGr.name.toString(),
                    active: companyGr.active.toString()
                });
            }
        }

        return result;
    },

    type: 'ApplicationServiceFilter'
};
