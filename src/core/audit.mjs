import { appendFile, mkdir, readFile } from "node:fs/promises";
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

export async function listAuditEvents(filePath, { limit = 50 } = {}) {
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    })
    .sort((first, second) => String(second.timestamp).localeCompare(String(first.timestamp)))
    .slice(0, Math.max(1, Math.min(200, limit)));
}
