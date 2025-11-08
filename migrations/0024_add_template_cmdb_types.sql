-- Migration: Add support for std_change_template and cmdb_ci component types
-- This migration enhances change validation to support standard change templates and CMDB CIs

-- Remove the existing constraint if it exists (for idempotency)
ALTER TABLE change_validations
  DROP CONSTRAINT IF EXISTS valid_component_types;

-- Add check constraint for valid component types including new ones
ALTER TABLE change_validations
  ADD CONSTRAINT valid_component_types CHECK (
    component_type IN (
      'catalog_item',
      'ldap_server',
      'mid_server',
      'workflow',
      'std_change_template',  -- New: Standard Change Template
      'cmdb_ci'              -- New: CMDB Configuration Item
    )
  );

-- Create index for efficient queries on new component types
CREATE INDEX IF NOT EXISTS idx_change_validations_template_type
  ON change_validations(component_type, component_sys_id)
  WHERE component_type IN ('std_change_template', 'cmdb_ci');

-- Add comment to document the new types
COMMENT ON COLUMN change_validations.component_type IS
  'Type of ServiceNow component: catalog_item, ldap_server, mid_server, workflow, std_change_template (template version sys_id), cmdb_ci (CI sys_id)';

COMMENT ON COLUMN change_validations.component_sys_id IS
  'System ID of the component in ServiceNow. For templates, this is the template version sys_id. For CMDB CIs, this is the CI sys_id.';