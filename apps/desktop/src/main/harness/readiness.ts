const READINESS_LINE = /^dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)(?:\s|$)/;

export function parseReadinessUrl(line: string): string | undefined {
  const match = READINESS_LINE.exec(line.trim());
  if (!match) return undefined;
  const value = match[1];
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port) {
    return undefined;
  }
  return url.origin;
}
