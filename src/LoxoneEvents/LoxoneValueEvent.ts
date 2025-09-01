import { LoxoneEvent } from './LoxoneEvent.js';
import LoxoneEventName from './LoxoneEventName.js';

class LoxoneValueEvent extends LoxoneEvent {
    value: number;
    static eventName: LoxoneEventName = 'event_table_values';

    constructor(binaryData: Buffer, offset: number) {
        super(binaryData, offset);

        this.value = binaryData.readDoubleLE(offset + this.uuid.data_length);
    }

    override data_length(): number {
        return 8 + this.uuid.data_length; // should always be 24
    }

    override eventName(): LoxoneEventName {
        return LoxoneValueEvent.eventName;
    }
}

export default LoxoneValueEvent;
