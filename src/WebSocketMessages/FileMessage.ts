import type { WebSocket } from "ws";
import { rawDataToBuffer } from "../Utils/RawData.js";

class FileMessage {
  filename: string;
  type: "json" | "text" | "binary";
  // oxlint-disable-next-line typescript/no-explicit-any
  data: any;
  length: number;

  constructor(message: WebSocket.RawData, isBinary: boolean, filename: string) {
    this.filename = filename;
    const buffer = rawDataToBuffer(message);

    if (isBinary) {
      this.type = "binary";
      this.data = buffer;
      this.length = buffer.byteLength;
    } else {
      const text = buffer.toString("utf8");
      this.length = text.length;
      if (filename.match(/\.json$/)) {
        this.type = "json";
        this.data = JSON.parse(text);
      } else {
        this.type = "text";
        this.data = text;
      }
    }
  }

  toString(): string {
    return `filename: ${this.filename}, type: ${this.type}, length: ${this.length} bytes`;
  }
}

export default FileMessage;
