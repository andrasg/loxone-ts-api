import UUID from '../WebSocketMessages/UUID.js';
import { LoxoneEvent } from './LoxoneEvent.js';
import LoxoneEventName from './LoxoneEventName.js';

class LoxoneTextEvent extends LoxoneEvent {
    uuidIcon: UUID;
    textLength: number;
    text: string;
    type = 'text';
    static eventName: LoxoneEventName = 'event_table_text';

    constructor(binaryData: Buffer, offset: number) {
        super(binaryData, offset);

        let offset_add = offset;
        offset_add += this.uuid.data_length;
        this.uuidIcon = new UUID(binaryData, offset_add);
        offset_add += this.uuidIcon.data_length;
        this.textLength = binaryData.readUInt32LE(offset_add);
        offset_add += 4;
        this.text = binaryData.toString('utf8', offset_add, offset_add + this.textLength);
    }

    override data_length(): number {
        return (Math.floor((4 + this.textLength + this.uuid.data_length + this.uuidIcon.data_length - 1) / 4) + 1) * 4;
    }

    override eventName(): LoxoneEventName {
        return LoxoneTextEvent.eventName;
    }
}

export default LoxoneTextEvent;
