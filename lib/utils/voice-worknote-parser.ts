export interface ParsedVoiceWorkNote {
  sessionId: string;
  phoneNumber?: string;
  direction?: "inbound" | "outbound";
  endTime?: Date;
}

const sessionRegex = /Session ID[:\s]+([A-Za-z0-9-]+)/i;
const inboundRegex = /Call from\s+([+0-9()\-\s]+)/i;
const outboundRegex = /Call to\s+([+0-9()\-\s]+)/i;
const endRegex = /ended at\s+([0-9\-: ]+)/i;

export function parseVoiceWorkNote(note: string): ParsedVoiceWorkNote | null {
  const sessionMatch = note.match(sessionRegex);
  if (!sessionMatch) {
    return null;
  }

  let direction: "inbound" | "outbound" | undefined;
  let phoneNumber: string | undefined;

  const inboundMatch = note.match(inboundRegex);
  if (inboundMatch) {
    direction = "inbound";
    phoneNumber = inboundMatch[1].trim();
  }

  const outboundMatch = note.match(outboundRegex);
  if (!direction && outboundMatch) {
    direction = "outbound";
    phoneNumber = outboundMatch[1].trim();
  }

  const endMatch = note.match(endRegex);
  let endTime: Date | undefined;
  if (endMatch) {
    const timestamp = endMatch[1].trim();
    const isoCandidate = timestamp.replace(" ", "T") + "Z";
    const parsed = new Date(isoCandidate);
    if (!Number.isNaN(parsed.getTime())) {
      endTime = parsed;
    }
  }

  return {
    sessionId: sessionMatch[1].trim(),
    phoneNumber,
    direction,
    endTime,
  };
}
