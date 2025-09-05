import WebSocket from 'ws';

class FileMessage {
    filename: string;
    type: 'json' | 'text' | 'binary';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    length: number;

    constructor(message: WebSocket.RawData, isBinary: boolean, filename: string) {
        this.filename = filename;

        if (!isBinary) {
            this.length = message.toString().length;
            if (filename.match(/\.json$/)) {
                this.type = 'json';
                this.data = JSON.parse(message.toString());
            } else {
                this.type = 'text';
                this.data = message.toString();
            }
        } else {
            this.type = 'binary';
            this.data = message as Buffer;
            this.length = Buffer.byteLength(this.data);
        }
    }

    toString(): string {
        return `filename: ${this.filename}, type: ${this.type}, length: ${this.length} bytes`;
    }
}

export default FileMessage;
