/**
 * Detailed Audit of Altus Network Devices (READ-ONLY)
 *
 * Deep analysis of the 16 firewalls/switches to determine if they are:
 * - Properly configured in CMDB with correct fields
 * - OR just data dumps (name + IP only)
 *
 * Analyzes:
 * - Field population (which fields are used)
 * - CMDB best practices compliance
 * - Network configuration completeness
 * - Relationship mapping
 * - Data quality issues
 *
 * This script is READ-ONLY and makes no modifications.
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL: Production instance URL
 * - SERVICENOW_USERNAME: Production API username
 * - SERVICENOW_PASSWORD: Production API password
 *
 * Target: PRODUCTION only (where the network devices exist)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface FieldAnalysis {
  fieldName: string;
  displayName: string;
  populatedCount: number;
  emptyCount: number;
  sampleValues: string[];
  critical: boolean;
}

interface DeviceDetail {
  name: string;
  sys_id: string;
  allFields: Record<string, any>;
  populatedFields: number;
  totalFields: number;
  percentComplete: number;
  criticalFieldsMissing: string[];
  hasRelationships: boolean;
}

// Critical fields that should be populated for proper CMDB management
const CRITICAL_FIELDS = [
  'name',
  'ip_address',
  'company',
  'operational_status',
  'install_status',
  'asset_tag',
  'serial_number',
  'manufacturer',
  'model_id',
  'location',
  'support_group',
  'managed_by',
];

async function auditNetworkDevicesDetailed() {
  console.log('🔍 Detailed Audit: Altus Network Devices (Firewalls/Switches)');
  console.log('='.repeat(70));
  console.log('');

  // Get PROD credentials
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD ServiceNow credentials not configured');
    console.log('\nRequired variables:');
    console.log('  - SERVICENOW_URL');
    console.log('  - SERVICENOW_USERNAME');
    console.log('  - SERVICENOW_PASSWORD');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Environment: PRODUCTION`);
  console.log(`  URL: ${instanceUrl}`);
  console.log(`  Username: ${username}`);
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  try {
    // ========================================
    // Query All Altus Network Devices
    // ========================================
    console.log('Step 1: Querying Network Devices');
    console.log('─'.repeat(70));

    const query = encodeURIComponent(
      'nameLIKEAltus^ORhostnameLIKEAltus^ORdns_nameLIKEAltus'
    );
    const queryUrl = `${instanceUrl}/api/now/table/cmdb_ci_netgear?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=100`;

    const response = await fetch(queryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to query network devices: ${response.status}`);
    }

    const data = await response.json();
    const devices = data.result || [];

    console.log(`Found ${devices.length} network device(s)`);
    console.log('');

    if (devices.length === 0) {
      console.log('✅ No network devices found');
      process.exit(0);
    }

    // ========================================
    // Analyze Each Device
    // ========================================
    console.log('Step 2: Analyzing Device Configurations');
    console.log('─'.repeat(70));
    console.log('');

    const deviceDetails: DeviceDetail[] = [];
    const fieldStats: Map<string, FieldAnalysis> = new Map();

    for (const device of devices) {
      const name = typeof device.name === 'object' ? device.name.display_value : device.name;
      const sysId = typeof device.sys_id === 'object' ? device.sys_id.value : device.sys_id;

      // Extract all fields
      const allFields: Record<string, any> = {};
      let populatedCount = 0;
      let totalCount = 0;

      for (const [key, value] of Object.entries(device)) {
        // Skip system metadata fields
        if (key.startsWith('sys_') && key !== 'sys_id' && key !== 'sys_class_name') continue;

        totalCount++;
        let displayValue: any;
        let actualValue: any;

        if (typeof value === 'object' && value !== null) {
          displayValue = value.display_value || '';
          actualValue = value.value || value.link || '';
        } else {
          displayValue = value;
          actualValue = value;
        }

        allFields[key] = displayValue;

        // Check if populated (not empty, null, or just whitespace)
        const isPopulated = actualValue !== null &&
          actualValue !== undefined &&
          actualValue !== '' &&
          String(actualValue).trim() !== '';

        if (isPopulated) {
          populatedCount++;
        }

        // Track field statistics
        if (!fieldStats.has(key)) {
          fieldStats.set(key, {
            fieldName: key,
            displayName: key.replace(/_/g, ' ').toUpperCase(),
            populatedCount: 0,
            emptyCount: 0,
            sampleValues: [],
            critical: CRITICAL_FIELDS.includes(key),
          });
        }

        const fieldStat = fieldStats.get(key)!;
        if (isPopulated) {
          fieldStat.populatedCount++;
          if (fieldStat.sampleValues.length < 3 && String(displayValue).length < 100) {
            fieldStat.sampleValues.push(String(displayValue));
          }
        } else {
          fieldStat.emptyCount++;
        }
      }

      // Check for missing critical fields
      const criticalFieldsMissing = CRITICAL_FIELDS.filter(field => {
        const value = allFields[field];
        return !value || String(value).trim() === '';
      });

      // Check for relationships (simplified - just check if certain relationship fields exist)
      const hasRelationships = !!(
        allFields.parent ||
        allFields.managed_by ||
        allFields.support_group ||
        allFields.location
      );

      const percentComplete = totalCount > 0 ? Math.round((populatedCount / totalCount) * 100) : 0;

      deviceDetails.push({
        name,
        sys_id: sysId,
        allFields,
        populatedFields: populatedCount,
        totalFields: totalCount,
        percentComplete,
        criticalFieldsMissing,
        hasRelationships,
      });

      console.log(`  ${name}`);
      console.log(`    sys_id: ${sysId}`);
      console.log(`    Fields Populated: ${populatedCount}/${totalCount} (${percentComplete}%)`);
      console.log(`    Critical Fields Missing: ${criticalFieldsMissing.length}`);
      if (criticalFieldsMissing.length > 0) {
        console.log(`      - ${criticalFieldsMissing.join(', ')}`);
      }
      console.log(`    Has Relationships: ${hasRelationships ? 'Yes' : 'No'}`);
      console.log('');
    }

    // ========================================
    // Field Population Analysis
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 FIELD POPULATION ANALYSIS');
    console.log('─'.repeat(70));
    console.log('');

    // Sort fields by importance (critical first, then by population)
    const sortedFields = Array.from(fieldStats.values()).sort((a, b) => {
      if (a.critical && !b.critical) return -1;
      if (!a.critical && b.critical) return 1;
      return b.populatedCount - a.populatedCount;
    });

    console.log('Critical Fields:');
    console.log('');

    const criticalFields = sortedFields.filter(f => f.critical);
    for (const field of criticalFields) {
      const status = field.populatedCount === devices.length ? '✅' : '❌';
      console.log(`  ${status} ${field.displayName}`);
      console.log(`     Populated: ${field.populatedCount}/${devices.length} (${Math.round((field.populatedCount / devices.length) * 100)}%)`);
      if (field.sampleValues.length > 0) {
        console.log(`     Sample: ${field.sampleValues.slice(0, 2).join(', ')}`);
      }
      console.log('');
    }

    console.log('─'.repeat(70));
    console.log('Frequently Used Fields (>50% populated):');
    console.log('');

    const frequentFields = sortedFields
      .filter(f => !f.critical && (f.populatedCount / devices.length) > 0.5)
      .slice(0, 10);

    for (const field of frequentFields) {
      console.log(`  ${field.displayName}`);
      console.log(`    Populated: ${field.populatedCount}/${devices.length} (${Math.round((field.populatedCount / devices.length) * 100)}%)`);
      if (field.sampleValues.length > 0) {
        console.log(`    Sample: ${field.sampleValues.slice(0, 2).join(', ')}`);
      }
      console.log('');
    }

    // ========================================
    // Configuration Quality Assessment
    // ========================================
    console.log('─'.repeat(70));
    console.log('🎯 CONFIGURATION QUALITY ASSESSMENT');
    console.log('─'.repeat(70));
    console.log('');

    const avgPopulation = deviceDetails.reduce((sum, d) => sum + d.percentComplete, 0) / deviceDetails.length;
    const avgCriticalMissing = deviceDetails.reduce((sum, d) => sum + d.criticalFieldsMissing.length, 0) / deviceDetails.length;
    const devicesWithRelationships = deviceDetails.filter(d => d.hasRelationships).length;

    console.log('Overall Statistics:');
    console.log(`  Average Field Population: ${Math.round(avgPopulation)}%`);
    console.log(`  Devices with Relationships: ${devicesWithRelationships}/${devices.length} (${Math.round((devicesWithRelationships / devices.length) * 100)}%)`);
    console.log(`  Avg Critical Fields Missing: ${avgCriticalMissing.toFixed(1)}/${CRITICAL_FIELDS.length}`);
    console.log('');

    // Grade the configuration
    let grade: string;
    let verdict: string;

    if (avgPopulation >= 80 && avgCriticalMissing < 2) {
      grade = 'A';
      verdict = '✅ EXCELLENT - Well configured CIs';
    } else if (avgPopulation >= 60 && avgCriticalMissing < 4) {
      grade = 'B';
      verdict = '⚠️  GOOD - Minor improvements needed';
    } else if (avgPopulation >= 40 && avgCriticalMissing < 6) {
      grade = 'C';
      verdict = '⚠️  FAIR - Significant improvements needed';
    } else {
      grade = 'D';
      verdict = '❌ POOR - Major data quality issues (likely just data dumps)';
    }

    console.log(`Configuration Grade: ${grade}`);
    console.log(`${verdict}`);
    console.log('');

    // ========================================
    // Detailed Device Breakdown
    // ========================================
    console.log('─'.repeat(70));
    console.log('📋 DETAILED DEVICE BREAKDOWN');
    console.log('─'.repeat(70));
    console.log('');

    for (const detail of deviceDetails) {
      console.log(`${detail.name}`);
      console.log(`  sys_id: ${detail.sys_id}`);
      console.log(`  Completeness: ${detail.percentComplete}%`);
      console.log('');
      console.log('  Key Fields:');
      console.log(`    IP Address: ${detail.allFields.ip_address || '❌ MISSING'}`);
      console.log(`    Company: ${detail.allFields.company || '❌ MISSING'}`);
      console.log(`    Serial Number: ${detail.allFields.serial_number || '❌ MISSING'}`);
      console.log(`    Asset Tag: ${detail.allFields.asset_tag || '❌ MISSING'}`);
      console.log(`    Manufacturer: ${detail.allFields.manufacturer || '❌ MISSING'}`);
      console.log(`    Model: ${detail.allFields.model_id || detail.allFields.model_number || '❌ MISSING'}`);
      console.log(`    Location: ${detail.allFields.location || '❌ MISSING'}`);
      console.log(`    Support Group: ${detail.allFields.support_group || '❌ MISSING'}`);
      console.log(`    Managed By: ${detail.allFields.managed_by || '❌ MISSING'}`);
      console.log(`    Operational Status: ${detail.allFields.operational_status || '❌ MISSING'}`);
      console.log(`    Install Status: ${detail.allFields.install_status || '❌ MISSING'}`);
      console.log('');
      console.log('  Network Details:');
      console.log(`    Hostname: ${detail.allFields.host_name || detail.allFields.hostname || '❌ MISSING'}`);
      console.log(`    DNS Name: ${detail.allFields.dns_name || '❌ MISSING'}`);
      console.log(`    MAC Address: ${detail.allFields.mac_address || '❌ MISSING'}`);
      console.log('');
    }

    // ========================================
    // Recommendations
    // ========================================
    console.log('─'.repeat(70));
    console.log('💡 RECOMMENDATIONS');
    console.log('─'.repeat(70));
    console.log('');

    if (grade === 'D') {
      console.log('❌ CRITICAL ISSUES - Data appears to be just dumps (name + IP)');
      console.log('');
      console.log('Required Actions:');
      console.log('  1. Populate missing critical fields for all devices');
      console.log('  2. Add asset management data (serial numbers, asset tags)');
      console.log('  3. Establish relationships (support groups, locations)');
      console.log('  4. Add manufacturer and model information');
      console.log('  5. Set proper install and operational statuses');
    } else if (grade === 'C') {
      console.log('⚠️  SIGNIFICANT IMPROVEMENTS NEEDED');
      console.log('');
      console.log('Recommended Actions:');
      console.log('  1. Complete missing critical fields');
      console.log('  2. Add asset tracking information');
      console.log('  3. Establish CI relationships');
      console.log('  4. Standardize data entry');
    } else if (grade === 'B') {
      console.log('⚠️  MINOR IMPROVEMENTS NEEDED');
      console.log('');
      console.log('Recommended Actions:');
      console.log('  1. Fill in remaining critical fields');
      console.log('  2. Enhance relationship mapping');
      console.log('  3. Add additional metadata');
    } else {
      console.log('✅ WELL CONFIGURED');
      console.log('');
      console.log('Maintenance Actions:');
      console.log('  1. Keep data up-to-date');
      console.log('  2. Review and update relationships periodically');
      console.log('  3. Maintain accuracy of hardware information');
    }

    console.log('');
    console.log('Most Critical Missing Fields Across All Devices:');

    const criticalMissing = new Map<string, number>();
    for (const detail of deviceDetails) {
      for (const field of detail.criticalFieldsMissing) {
        criticalMissing.set(field, (criticalMissing.get(field) || 0) + 1);
      }
    }

    const sortedMissing = Array.from(criticalMissing.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [field, count] of sortedMissing) {
      console.log(`  ${field}: Missing in ${count}/${devices.length} devices`);
    }

    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Audit failed:');
    console.error(error);
    process.exit(1);
  }
}

auditNetworkDevicesDetailed()
  .catch(console.error)
  .finally(() => process.exit(0));
