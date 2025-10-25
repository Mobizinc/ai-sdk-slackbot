/**
 * Workflow Router Service
 * Mirrors Python workflow routing rules for case classification
 */

export interface WorkflowRoutingRule {
  assignmentGroup?: string;
  sysId?: string;
  workflowId: string;
  priority?: number;
  conditions?: {
    category?: string;
    subcategory?: string;
    priority?: string;
    state?: string;
  };
}

export interface WorkflowRoutingConfig {
  rules: WorkflowRoutingRule[];
  defaultWorkflowId: string;
  promptOverrides: Record<string, string>;
}

export interface RoutingContext {
  assignmentGroup?: string;
  assignedTo?: string;
  category?: string;
  subcategory?: string;
  priority?: string;
  state?: string;
  caseNumber?: string;
  description?: string;
}

export interface RoutingResult {
  workflowId: string;
  promptOverride?: string;
  ruleMatched?: boolean;
  matchedRule?: WorkflowRoutingRule;
}

import { config } from "../config";

export class WorkflowRouter {
  private config: WorkflowRoutingConfig;
  private configLoaded = false;

  constructor() {
    this.config = {
      rules: [],
      defaultWorkflowId: 'default',
      promptOverrides: {}
    };
  }

  /**
   * Load workflow routing configuration from environment
   */
  private loadConfig(): void {
    if (this.configLoaded) return;

    try {
      // Load workflow routing rules
      const routingConfig = config.caseWorkflowRouting;
      if (routingConfig) {
        const parsed = JSON.parse(routingConfig);
        if (parsed.rules && Array.isArray(parsed.rules)) {
          this.config.rules = parsed.rules;
        }
        if (parsed.defaultWorkflowId) {
          this.config.defaultWorkflowId = parsed.defaultWorkflowId;
        }
      }

      // Load prompt overrides
      const promptConfig = config.caseWorkflowPrompts;
      if (promptConfig) {
        this.config.promptOverrides = JSON.parse(promptConfig);
      }

      console.log(`[WorkflowRouter] Loaded ${this.config.rules.length} routing rules`);
      console.log(`[WorkflowRouter] Loaded ${Object.keys(this.config.promptOverrides).length} prompt overrides`);
      
      this.configLoaded = true;
    } catch (error) {
      console.error('[WorkflowRouter] Error loading configuration:', error);
      // Use default configuration
      this.configLoaded = true;
    }
  }

  /**
   * Determine workflow ID based on routing context
   */
  public determineWorkflow(context: RoutingContext): RoutingResult {
    this.loadConfig();

    // Sort rules by priority (higher priority first)
    const sortedRules = [...this.config.rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Find matching rule
    for (const rule of sortedRules) {
      if (this.matchesRule(rule, context)) {
        const promptOverride = this.config.promptOverrides[rule.workflowId];
        
        return {
          workflowId: rule.workflowId,
          promptOverride,
          ruleMatched: true,
          matchedRule: rule
        };
      }
    }

    // No rule matched, use default
    const defaultPromptOverride = this.config.promptOverrides[this.config.defaultWorkflowId];
    
    return {
      workflowId: this.config.defaultWorkflowId,
      promptOverride: defaultPromptOverride,
      ruleMatched: false
    };
  }

  /**
   * Check if context matches a routing rule
   */
  private matchesRule(rule: WorkflowRoutingRule, context: RoutingContext): boolean {
    // Check assignment group match
    if (rule.assignmentGroup && context.assignmentGroup) {
      if (!this.matchesPattern(rule.assignmentGroup, context.assignmentGroup)) {
        return false;
      }
    }

    // Check sys_id match
    if (rule.sysId && context.assignedTo) {
      if (!this.matchesPattern(rule.sysId, context.assignedTo)) {
        return false;
      }
    }

    // Check additional conditions
    if (rule.conditions) {
      const conditions = rule.conditions;

      if (conditions.category && context.category) {
        if (!this.matchesPattern(conditions.category, context.category)) {
          return false;
        }
      }

      if (conditions.subcategory && context.subcategory) {
        if (!this.matchesPattern(conditions.subcategory, context.subcategory)) {
          return false;
        }
      }

      if (conditions.priority && context.priority) {
        if (!this.matchesPattern(conditions.priority, context.priority)) {
          return false;
        }
      }

      if (conditions.state && context.state) {
        if (!this.matchesPattern(conditions.state, context.state)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Pattern matching with support for wildcards and regex
   */
  private matchesPattern(pattern: string, value: string): boolean {
    // Exact match
    if (pattern === value) {
      return true;
    }

    // Wildcard match
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(value);
    }

    // Case-insensitive contains match
    if (pattern.toLowerCase().includes(value.toLowerCase()) || 
        value.toLowerCase().includes(pattern.toLowerCase())) {
      return true;
    }

    return false;
  }

  /**
   * Get all available workflow IDs
   */
  public getAvailableWorkflows(): string[] {
    this.loadConfig();
    
    const workflowIds = new Set<string>();
    workflowIds.add(this.config.defaultWorkflowId);
    
    this.config.rules.forEach(rule => {
      workflowIds.add(rule.workflowId);
    });

    Object.keys(this.config.promptOverrides).forEach(workflowId => {
      workflowIds.add(workflowId);
    });

    return Array.from(workflowIds);
  }

  /**
   * Get prompt override for a workflow
   */
  public getPromptOverride(workflowId: string): string | undefined {
    this.loadConfig();
    return this.config.promptOverrides[workflowId];
  }

  /**
   * Validate routing configuration
   */
  public validateConfig(): { valid: boolean; errors: string[] } {
    this.loadConfig();
    
    const errors: string[] = [];

    // Check for duplicate workflow IDs in rules
    const workflowIds = new Set<string>();
    for (const rule of this.config.rules) {
      if (workflowIds.has(rule.workflowId)) {
        errors.push(`Duplicate workflow ID in rules: ${rule.workflowId}`);
      }
      workflowIds.add(rule.workflowId);
    }

    // Check if default workflow exists
    if (!this.config.defaultWorkflowId) {
      errors.push('Default workflow ID is required');
    }

    // Validate rule structure
    for (const rule of this.config.rules) {
      if (!rule.workflowId) {
        errors.push('Rule missing workflow ID');
      }
      
      if (!rule.assignmentGroup && !rule.sysId && !rule.conditions) {
        errors.push(`Rule ${rule.workflowId} has no matching criteria`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get routing statistics
   */
  public getRoutingStats(): {
    totalRules: number;
    defaultWorkflowId: string;
    promptOverridesCount: number;
    workflowIds: string[];
  } {
    this.loadConfig();
    
    return {
      totalRules: this.config.rules.length,
      defaultWorkflowId: this.config.defaultWorkflowId,
      promptOverridesCount: Object.keys(this.config.promptOverrides).length,
      workflowIds: this.getAvailableWorkflows()
    };
  }

  /**
   * Test routing with sample context
   */
  public testRouting(context: RoutingContext): RoutingResult & {
    allMatches: Array<{ rule: WorkflowRoutingRule; matched: boolean }>;
  } {
    this.loadConfig();
    
    const result = this.determineWorkflow(context);
    
    // Test all rules
    const allMatches = this.config.rules.map(rule => ({
      rule,
      matched: this.matchesRule(rule, context)
    }));

    return {
      ...result,
      allMatches
    };
  }
}

// Singleton instance
let workflowRouter: WorkflowRouter | null = null;

export function getWorkflowRouter(): WorkflowRouter {
  if (!workflowRouter) {
    workflowRouter = new WorkflowRouter();
  }
  return workflowRouter;
}
