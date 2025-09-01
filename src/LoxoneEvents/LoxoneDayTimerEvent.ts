import UUID from '../WebSocketMessages/UUID.js';
import { LoxoneEvent } from './LoxoneEvent.js';
import LoxoneEventName from './LoxoneEventName.js';

class LoxoneDayTimerEvent extends LoxoneEvent {
    static eventName: LoxoneEventName = 'event_table_day_timer';
    defValue: number;
    entries: number;
    entry: any[];

    constructor(binaryData: Buffer, offset: number) {
        super(binaryData, offset);

        let offset_add = offset;
        this.uuid = new UUID(binaryData, offset_add);
        offset_add += this.uuid.data_length;
        this.defValue = binaryData.readDoubleLE(offset_add);
        offset_add += 8;
        this.entries = binaryData.readInt32LE(offset_add);
        offset_add += 4;

        this.entry = [];

        for (let i = 0; i < this.entries; i++) {
            this.entry.push({
                'mode': binaryData.readInt32LE(offset_add),
                'from': binaryData.readInt32LE(offset_add + 4),
                'to': binaryData.readInt32LE(offset_add + 8),
                'needActivate': binaryData.readInt32LE(offset_add + 12),
                'value': binaryData.readDoubleLE(offset_add + 16),
            });
            offset_add += 24;
        }
    }

    override data_length(): number {
        return this.uuid.data_length + 8 + 4 + this.entries * 24;
    }

    override eventName(): LoxoneEventName {
        return LoxoneDayTimerEvent.eventName;
    }
}

export default LoxoneDayTimerEvent;
