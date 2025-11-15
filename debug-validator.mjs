import { extractKeyPhrases } from './lib/utils/response-validator.js';

const summary = `Summary

Email server connectivity problems affecting Finance department users across multiple locations with Exchange Online authentication failures causing critical business impact.

Current State

Status: Open
Priority: Critical

Latest Activity

• Oct 28, 14:23 – Team investigated the issue
• Oct 28, 15:00 – Escalated to Microsoft Support`;

const response = `The email server connectivity is causing problems for Finance department users in multiple locations. This is related to Exchange Online authentication failures which are creating critical business impact. The status is currently open with critical priority. The team investigated this issue earlier today and it has been escalated to Microsoft Support for further assistance.`;

console.log('Summary:', summary);
console.log('Response:', response);
console.log('Key phrases:', extractKeyPhrases(summary));