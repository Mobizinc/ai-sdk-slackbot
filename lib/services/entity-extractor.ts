/**
 * Technical Entity Extractor
 * Extracts technical entities from case text using regex patterns
 */

export interface TechnicalEntities {
  ip_addresses: string[];
  systems: string[];
  users: string[];
  software: string[];
  error_codes: string[];
}

/**
 * Extract technical entities from text using regex patterns
 */
export function extractTechnicalEntities(text: string): TechnicalEntities {
  // IP addresses: regex for IPv4
  const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  
  // IPv6 addresses (basic pattern)
  const ipv6Regex = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g;
  
  // Hostnames: words with dots/dashes, more comprehensive
  const hostnameRegex = /\b[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+\b/g;
  
  // Usernames: email-like or domain\user format
  const usernameRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b|\b[a-zA-Z0-9]+\\[a-zA-Z0-9.]+\b/g;
  
  // Error codes: common patterns (e.g., 0x80070005, ERR_CONNECTION_REFUSED)
  const errorCodeRegex = /\b(?:0x[0-9A-Fa-f]+|ERR_[A-Z_]+|[A-Z]{2,}_\d+)\b/g;
  
  // Software names: common software patterns
  const softwarePatterns = [
    /\b(?:Windows|Office|Outlook|Teams|SharePoint|Exchange|Azure|AWS|SQL|Oracle|MySQL|PostgreSQL|MongoDB|Redis|Apache|Nginx|IIS|Docker|Kubernetes|VMware|Hyper-V|Citrix|Cisco|Fortinet|Palo Alto|SonicWall|Juniper|Linux|Ubuntu|CentOS|Red Hat|Debian|macOS|iOS|Android|Java|Python|\.NET|Node\.js|PHP|Ruby|Go|Rust|JavaScript|TypeScript|React|Angular|Vue|jQuery|Bootstrap|WordPress|Drupal|Joomla|Magento|Shopify|Salesforce|ServiceNow|Jira|Confluence|Slack|Zoom|Teams|Webex|Skype|OneDrive|Dropbox|Google Drive|Box|Adobe|Acrobat|Reader|Flash|Java|JRE|JDK|Node\.js|npm|yarn|pip|conda|git|svn|mercurial|Terraform|Ansible|Puppet|Chef|SaltStack|Nagios|Zabbix|Prometheus|Grafana|ELK|Splunk|Logstash|Kibana|Elasticsearch|Apache|Tomcat|JBoss|WebSphere|WebLogic|IIS|Nginx|HAProxy|F5|Big-IP|Citrix|Netscaler|VMware|vSphere|ESXi|vCenter|Hyper-V|VirtualBox|KVM|Xen|Docker|Kubernetes|OpenShift|Rancher|Helm|Istio|Envoy|Linkerd|Consul|Vault|Nomad|Packer|Vagrant|Terraform|CloudFormation|ARM|Terraform|Ansible|Puppet|Chef|SaltStack|PowerShell|Bash|Python|Perl|Ruby|Go|Rust|C\+\+|C#|Java|JavaScript|TypeScript|PHP|Node\.js|Express|Spring|Django|Flask|Rails|Laravel|Symfony|CodeIgniter|CakePHP|Zend|Lumen|Slim|Phalcon|Yii|Cake|FuelPHP|Aura|Laminas|Zend|Symfony|Laravel|Rails|Django|Flask|Express|FastAPI|NestJS|Next\.js|Nuxt\.js|Gatsby|Svelte|Vue|React|Angular|jQuery|Bootstrap|Tailwind|Bulma|Foundation|Material|UI|Ant|Design|Material-UI|Chakra|UI|Semantic|UI|Prime|React|Material|Bootstrap|Foundation|Bulma|Tailwind|CSS|SASS|SCSS|LESS|Stylus|PostCSS|CSS-in-JS|Styled|Components|Emotion|JSS|CSS|Modules|BEM|OOCSS|SMACSS|Atomic|CSS|Utility|First|CSS|Functional|CSS|Component|Driven|CSS)\b/gi
  ];

  // Extract IP addresses (both IPv4 and IPv6)
  const ipv4Matches = text.match(ipv4Regex) || [];
  const ipv6Matches = text.match(ipv6Regex) || [];
  const allIpMatches = [...ipv4Matches, ...ipv6Matches];
  
  // Filter out invalid IPs (like 0.0.0.0 or 255.255.255.255 unless they're actually valid in context)
  const validIpAddresses = Array.from(new Set(allIpMatches)).filter(ip => {
    // Basic validation - exclude obvious invalid IPs
    if (ip === '0.0.0.0' || ip === '255.255.255.255') return false;
    // Check if it's a reasonable IP
    const parts = ip.split('.');
    if (parts.length === 4) {
      return parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
    }
    return true; // Assume IPv6 is valid if matched
  });

  // Extract hostnames (filter out emails and other false positives)
  const hostnameMatches = text.match(hostnameRegex) || [];
  const hostnames = Array.from(new Set(hostnameMatches)).filter(hostname => {
    // Exclude emails
    if (hostname.includes('@')) return false;
    // Exclude obvious non-hostnames
    if (hostname.length < 4) return false;
    // Exclude common words that might match the pattern
    const excludeWords = ['www', 'http', 'https', 'ftp', 'mail', 'web', 'api', 'admin', 'test', 'dev', 'staging', 'prod'];
    if (excludeWords.includes(hostname.toLowerCase())) return false;
    // Should have at least one dot
    if (!hostname.includes('.')) return false;
    return true;
  });

  // Extract usernames/emails
  const userMatches = text.match(usernameRegex) || [];
  const users = Array.from(new Set(userMatches));

  // Extract error codes
  const errorMatches = text.match(errorCodeRegex) || [];
  const errorCodes = Array.from(new Set(errorMatches));

  // Extract software names
  let softwareMatches: string[] = [];
  softwarePatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    softwareMatches = [...softwareMatches, ...matches];
  });
  
  // Additional software detection from context
  const softwareKeywords = [
    'database', 'server', 'application', 'service', 'daemon', 'process',
    'firewall', 'antivirus', 'backup', 'restore', 'migration', 'upgrade',
    'installation', 'configuration', 'deployment', 'monitoring', 'logging'
  ];
  
  softwareKeywords.forEach(keyword => {
    if (text.toLowerCase().includes(keyword)) {
      softwareMatches.push(keyword);
    }
  });

  const software = Array.from(new Set(softwareMatches.map(s => s.trim()))).filter(s => s.length > 2);

  return {
    ip_addresses: validIpAddresses,
    systems: hostnames,
    users,
    software,
    error_codes: errorCodes,
  };
}

/**
 * Extract entities with confidence scores
 */
export function extractTechnicalEntitiesWithConfidence(text: string): TechnicalEntities & { confidence_scores: Record<string, number> } {
  const entities = extractTechnicalEntities(text);
  
  // Calculate confidence scores based on pattern strength
  const confidence_scores: Record<string, number> = {};
  
  // IP addresses have high confidence if they match the pattern well
  confidence_scores.ip_addresses = entities.ip_addresses.length > 0 ? 0.9 : 0;
  
  // Hostnames have medium confidence (can have false positives)
  confidence_scores.systems = entities.systems.length > 0 ? 0.7 : 0;
  
  // Users have high confidence for emails, medium for domain\user
  confidence_scores.users = entities.users.length > 0 ? 0.8 : 0;
  
  // Software has lower confidence (more context-dependent)
  confidence_scores.software = entities.software.length > 0 ? 0.6 : 0;
  
  // Error codes have high confidence if they match specific patterns
  confidence_scores.error_codes = entities.error_codes.length > 0 ? 0.85 : 0;
  
  return {
    ...entities,
    confidence_scores,
  };
}

/**
 * Validate and normalize extracted entities
 */
export function normalizeTechnicalEntities(entities: TechnicalEntities): TechnicalEntities {
  return {
    ip_addresses: entities.ip_addresses.map(ip => ip.trim()).filter(ip => ip.length > 0),
    systems: entities.systems.map(sys => sys.trim().toLowerCase()).filter(sys => sys.length > 3),
    users: entities.users.map(user => user.trim()).filter(user => user.length > 0),
    software: entities.software.map(soft => soft.trim()).filter(soft => soft.length > 2),
    error_codes: entities.error_codes.map(code => code.trim()).filter(code => code.length > 0),
  };
}