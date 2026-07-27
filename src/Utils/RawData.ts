import type { WebSocket } from "ws";

// WebSocket.RawData is Buffer | ArrayBuffer | Buffer[], normalize it to a single Buffer
export function rawDataToBuffer(raw: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw);
  return Buffer.from(raw);
}

export function rawDataToString(raw: WebSocket.RawData, encoding: BufferEncoding = "utf8"): string {
  return rawDataToBuffer(raw).toString(encoding);
}
