import WebSocket from 'ws';
import WebSocketMessage from './WebSocketMessage.js';

class FileMessage extends WebSocketMessage {
    filename: string;
    type: 'json' | 'text' | 'binary';
    data: any;

    constructor(message: WebSocket.RawData, isBinary: boolean, filename: string) {
        super();

        this.filename = filename;

        if (!isBinary) {
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
        }
    }
}

export default FileMessage;
