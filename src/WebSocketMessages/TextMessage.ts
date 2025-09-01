import { GREEN, GREY, RED } from 'node-ansi-logger';
import WebSocketMessage from './WebSocketMessage.js';

class TextMessage extends WebSocketMessage {
    private json;
    type: 'json' | 'control' | 'text';
    data: string | undefined;
    control: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
    code: number | undefined;

    constructor(utf8Data: string) {
        super();
        try {
            this.json = JSON.parse(utf8Data);
            this.type = 'json';
            this.data = this.json;
            if (this.json.LL) {
                if (this.json.LL.code || this.json.LL.Code) this.code = parseInt(this.json.LL.Code ?? this.json.LL.code);

                if (this.json.LL.control) {
                    this.type = 'control';
                    this.control = this.json.LL.control;
                    this.value = this.json.LL.value;
                }
            }
        } catch {
            this.type = 'text';
            this.data = utf8Data;
        }
    }

    toString(): string {
        switch (this.type) {
            case 'text':
                return `${this.formatCode(this.code)} - ${this.data ?? ''}`;
            case 'json':
                return JSON.stringify(this.data ?? {});
            case 'control':
                return `${this.formatCode(this.code)} - ${this.control} = ${JSON.stringify(this.value)}`;
        }
    }

    private formatCode(code: number | undefined): string {
        let color = GREEN;
        if (!code || code !== 200) color = RED;
        return `${color}${code}${GREY}`;
    }
}

export default TextMessage;
