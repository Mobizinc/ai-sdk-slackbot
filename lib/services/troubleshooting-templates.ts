/**
 * Troubleshooting Templates - Standard checklists for common IT issues
 * Provides structured troubleshooting steps based on issue type
 */

export interface TroubleshootingStep {
  description: string;
  priority: "high" | "medium" | "low";
}

export interface TroubleshootingTemplate {
  name: string;
  steps: TroubleshootingStep[];
  commonCauses?: string[];
}

export const troubleshootingTemplates: Record<string, TroubleshootingTemplate> = {
  file_share_access: {
    name: "File Share Access Issues",
    steps: [
      { description: "Can user ping the file server?", priority: "high" },
      { description: "What's the exact error message shown?", priority: "high" },
      { description: "Try accessing with UNC path directly (\\\\server\\share)", priority: "high" },
      { description: "Verify user's AD group memberships", priority: "medium" },
      { description: "Check NTFS and share permissions on the server", priority: "medium" },
      { description: "Confirm mapped drive letter is not in use", priority: "low" },
      { description: "Test from a different computer/network", priority: "low" },
    ],
    commonCauses: [
      "Incorrect permissions",
      "Network connectivity issue",
      "DNS resolution failure",
      "Cached credentials",
      "Drive letter conflict",
    ],
  },

  network_connectivity: {
    name: "Network Connectivity Issues",
    steps: [
      { description: "Can you ping the target server/device?", priority: "high" },
      { description: "Run traceroute to identify where packets are dropping", priority: "high" },
      { description: "Check DNS resolution (nslookup)", priority: "high" },
      { description: "Verify firewall rules allow traffic", priority: "medium" },
      { description: "Test from different network segment/VLAN", priority: "medium" },
      { description: "Check physical network cable/Wi-Fi connection", priority: "medium" },
      { description: "Restart network adapter/switch port", priority: "low" },
    ],
    commonCauses: [
      "Firewall blocking traffic",
      "Incorrect subnet/VLAN configuration",
      "DNS misconfiguration",
      "Physical connectivity issue",
      "Routing problem",
    ],
  },

  application_not_working: {
    name: "Application Not Working",
    steps: [
      { description: "What specific error message appears?", priority: "high" },
      { description: "Check application logs for errors", priority: "high" },
      { description: "Verify service/process is running", priority: "high" },
      { description: "Has anything changed recently (updates, config)?", priority: "high" },
      { description: "Check resource usage (CPU, memory, disk)", priority: "medium" },
      { description: "Test database connectivity if applicable", priority: "medium" },
      { description: "Try restarting the application/service", priority: "low" },
    ],
    commonCauses: [
      "Service not running",
      "Configuration error",
      "Resource exhaustion",
      "Database connection failure",
      "Recent update/change",
    ],
  },

  login_authentication: {
    name: "Login/Authentication Issues",
    steps: [
      { description: "Is the account locked out?", priority: "high" },
      { description: "Has the password expired?", priority: "high" },
      { description: "Is the account enabled in AD?", priority: "high" },
      { description: "Check user is in required security groups", priority: "medium" },
      { description: "Verify MFA/2FA device is working", priority: "medium" },
      { description: "Test login from different device/network", priority: "medium" },
      { description: "Clear cached credentials", priority: "low" },
    ],
    commonCauses: [
      "Account locked",
      "Expired password",
      "Missing group membership",
      "MFA device issue",
      "Cached credentials",
    ],
  },

  email_issues: {
    name: "Email Issues",
    steps: [
      { description: "Can user send/receive test email?", priority: "high" },
      { description: "Check mailbox quota/storage", priority: "high" },
      { description: "Verify email client settings (server, ports)", priority: "high" },
      { description: "Test webmail access", priority: "medium" },
      { description: "Check spam/junk folders", priority: "medium" },
      { description: "Verify email forwarding rules", priority: "low" },
      { description: "Check for transport rules blocking emails", priority: "low" },
    ],
    commonCauses: [
      "Mailbox full",
      "Incorrect client configuration",
      "Spam filter blocking",
      "Mail flow rules",
      "Authentication failure",
    ],
  },

  vpn_connection: {
    name: "VPN Connection Issues",
    steps: [
      { description: "What's the exact VPN error code/message?", priority: "high" },
      { description: "Can user access internet without VPN?", priority: "high" },
      { description: "Verify VPN credentials are current", priority: "high" },
      { description: "Check if VPN client is up to date", priority: "medium" },
      { description: "Test from different network (home vs mobile)", priority: "medium" },
      { description: "Verify firewall allows VPN ports (UDP 500, 4500)", priority: "medium" },
      { description: "Try reinstalling VPN client", priority: "low" },
    ],
    commonCauses: [
      "Incorrect credentials",
      "Firewall blocking VPN ports",
      "Outdated VPN client",
      "Network restrictions",
      "Certificate expired",
    ],
  },

  printer_issues: {
    name: "Printer Issues",
    steps: [
      { description: "Can you ping the printer IP address?", priority: "high" },
      { description: "Is there a specific error on printer display?", priority: "high" },
      { description: "Check printer queue for stuck jobs", priority: "high" },
      { description: "Verify printer driver is installed correctly", priority: "medium" },
      { description: "Test printing from different computer", priority: "medium" },
      { description: "Check paper, toner, and printer status", priority: "medium" },
      { description: "Power cycle the printer", priority: "low" },
    ],
    commonCauses: [
      "Network connectivity",
      "Driver issue",
      "Print queue stuck",
      "Out of paper/toner",
      "Printer offline",
    ],
  },

  slow_performance: {
    name: "Slow Performance Issues",
    steps: [
      { description: "Check CPU and memory usage (Task Manager/top)", priority: "high" },
      { description: "Verify disk space availability", priority: "high" },
      { description: "Check network bandwidth/latency", priority: "high" },
      { description: "Review running processes for unusual activity", priority: "medium" },
      { description: "Check for recent updates or changes", priority: "medium" },
      { description: "Test from different network/computer", priority: "medium" },
      { description: "Clear browser cache/temporary files", priority: "low" },
    ],
    commonCauses: [
      "High resource usage",
      "Disk space full",
      "Network congestion",
      "Malware/virus",
      "Background updates",
    ],
  },
};

/**
 * Detect issue type from problem description
 */
export function detectIssueType(description: string): string | null {
  const descLower = description.toLowerCase();

  // File share keywords
  if (
    descLower.match(/\b(file share|shared (drive|folder)|network drive|mapped drive|l drive|unc path|\\\\|smb)\b/)
  ) {
    return "file_share_access";
  }

  // Network keywords
  if (
    descLower.match(/\b(can'?t ping|network (down|issue|problem)|connect|connectivity|unreachable)\b/) &&
    !descLower.match(/\b(vpn|share|drive)\b/)
  ) {
    return "network_connectivity";
  }

  // VPN keywords
  if (descLower.match(/\b(vpn|remote access|cisco anyconnect|GlobalProtect)\b/)) {
    return "vpn_connection";
  }

  // Login keywords
  if (descLower.match(/\b(can'?t (log ?in|sign in)|login (fail|issue)|auth|password|locked out)\b/)) {
    return "login_authentication";
  }

  // Email keywords
  if (descLower.match(/\b(email|outlook|exchange|smtp|inbox|mailbox)\b/)) {
    return "email_issues";
  }

  // Printer keywords
  if (descLower.match(/\b(print|printer|cannot print|print job)\b/)) {
    return "printer_issues";
  }

  // Performance keywords
  if (descLower.match(/\b(slow|performance|lagg|hang|freeze|unresponsive)\b/)) {
    return "slow_performance";
  }

  // Application keywords
  if (descLower.match(/\b(application|app|software|program|service).*(not work|crash|error|fail)\b/)) {
    return "application_not_working";
  }

  return null;
}

/**
 * Get troubleshooting template for issue type
 */
export function getTroubleshootingTemplate(issueType: string): TroubleshootingTemplate | null {
  return troubleshootingTemplates[issueType] || null;
}

/**
 * Format troubleshooting steps as Slack markdown
 */
export function formatTroubleshootingSteps(
  template: TroubleshootingTemplate,
  includeCommonCauses: boolean = true
): string {
  let output = `*Troubleshooting Checklist*\n`;

  // High priority items first
  const highPriority = template.steps.filter((s) => s.priority === "high");
  const mediumPriority = template.steps.filter((s) => s.priority === "medium");
  const lowPriority = template.steps.filter((s) => s.priority === "low");

  [...highPriority, ...mediumPriority, ...lowPriority].forEach((step, index) => {
    output += `${index + 1}. ${step.description}\n`;
  });

  if (includeCommonCauses && template.commonCauses && template.commonCauses.length > 0) {
    output += `\n*Common Root Causes*\n`;
    template.commonCauses.forEach((cause) => {
      output += `• ${cause}\n`;
    });
  }

  return output;
}
