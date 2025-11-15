// Simulate the extractKeyPhrases function logic
function extractKeyPhrases(content) {
  if (!content) return [];

  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);

  const commonWords = new Set([
    "summary", "current", "state", "status", "latest", "activity", "context", "references",
    "about", "there", "their", "which", "would", "should", "could", "system", "this", "that",
    "with", "from", "have", "been", "were", "when", "case", "open", "work", "progress",
  ]);

  const distinctiveWords = words.filter((word) => !commonWords.has(word));
  return Array.from(new Set(distinctiveWords)).slice(0, 15);
}

const summary = `Summary

Email server connectivity problems affecting Finance department users across multiple locations with Exchange Online authentication failures causing critical business impact.

Current State

Status: Open
Priority: Critical

Latest Activity

• Oct 28, 14:23 – Team investigated the issue
• Oct 28, 15:00 – Escalated to Microsoft Support`;

const response = `The email server connectivity is causing problems for Finance department users in multiple locations. This is related to Exchange Online authentication failures which are creating critical business impact. The status is currently open with critical priority. The team investigated this issue earlier today and it has been escalated to Microsoft Support for further assistance.`;

const keyPhrases = extractKeyPhrases(summary);
console.log('Key phrases:', keyPhrases);
console.log('Key phrases count:', keyPhrases.length);

// Check matches
const matches = keyPhrases.filter(phrase => {
  const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return regex.test(response);
});

console.log('Matches:', matches);
console.log('Match count:', matches.length);

const threshold = 0.2; // overview threshold
const requiredMatches = Math.ceil(keyPhrases.length * threshold);
console.log('Required matches:', requiredMatches);
console.log('Should fail:', matches.length < requiredMatches);