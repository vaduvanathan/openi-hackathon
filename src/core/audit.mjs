import { appendFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export async function appendAuditEvent(filePath, event) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const record = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}
