/**
 * Test fixtures for Microsoft Learn API responses
 */

/**
 * Sample documentation search results
 */
export const sampleDocResults = [
  {
    title: "Reset Azure AD user password with PowerShell",
    url: "https://learn.microsoft.com/en-us/powershell/module/azuread/set-azureaduserpassword",
    content: "Use the Set-AzureADUserPassword cmdlet to reset a user's password in Azure Active Directory. This cmdlet requires Azure AD PowerShell module and appropriate permissions.",
  },
  {
    title: "Azure AD PowerShell cmdlet reference",
    url: "https://learn.microsoft.com/en-us/powershell/azure/active-directory/overview",
    content: "Complete reference for Azure Active Directory PowerShell module. Manage users, groups, and directory settings using PowerShell cmdlets.",
  },
  {
    title: "Troubleshoot Azure AD password reset",
    url: "https://learn.microsoft.com/en-us/azure/active-directory/authentication/troubleshoot-sspr",
    content: "Common issues and solutions when resetting passwords in Azure Active Directory. Learn about permission requirements, error codes, and best practices.",
  },
];

/**
 * Sample code samples
 */
export const sampleCodeSamples = [
  {
    title: "Reset Azure AD Password - PowerShell",
    url: "https://learn.microsoft.com/en-us/powershell/module/azuread/set-azureaduserpassword#examples",
    code: `# Connect to Azure AD
Connect-AzureAD

# Reset password for a user
$Password = Read-Host -AsSecureString
Set-AzureADUserPassword -ObjectId "user@domain.com" -Password $Password`,
    language: "powershell",
  },
  {
    title: "Get Azure AD User - PowerShell",
    url: "https://learn.microsoft.com/en-us/powershell/module/azuread/get-azureaduser#examples",
    code: `# Get all users
Get-AzureADUser

# Get specific user
Get-AzureADUser -ObjectId "user@domain.com"`,
    language: "powershell",
  },
];

/**
 * Sample full documentation
 */
export const sampleFullDoc = {
  title: "Set-AzureADUserPassword",
  content: "Use the Set-AzureADUserPassword cmdlet to reset a user's password in Azure Active Directory.",
  fullText: `# Set-AzureADUserPassword

## Synopsis
Resets the password for a user in Azure Active Directory.

## Syntax
\`\`\`powershell
Set-AzureADUserPassword
  -ObjectId <String>
  -Password <SecureString>
  [-ForceChangePasswordNextLogin <Boolean>]
\`\`\`

## Description
The Set-AzureADUserPassword cmdlet resets the password for a user in Azure Active Directory (Azure AD).

## Examples

### Example 1: Reset a user's password
\`\`\`powershell
$Password = Read-Host -AsSecureString
Set-AzureADUserPassword -ObjectId "user@contoso.com" -Password $Password
\`\`\`

This command resets the password for the specified user.

## Parameters

### -ObjectId
Specifies the ID of a user (as a UserPrincipalName or ObjectId) in Azure AD.

### -Password
Specifies the new password for the user as a SecureString object.

## Inputs
None

## Outputs
None`,
};

/**
 * Sample error responses
 */
export const sampleErrors = {
  networkError: new Error("Failed to connect to Microsoft Learn MCP server: Network timeout"),
  authError: new Error("MCP server authentication failed"),
  invalidUrl: new Error("URL must be from Microsoft Learn documentation"),
  parseError: new Error("Failed to parse MCP response"),
};

/**
 * Plain text response (non-JSON)
 */
export const samplePlainTextResponse = "Microsoft Learn provides documentation for Azure, Microsoft 365, and other Microsoft products.";
