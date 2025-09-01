import UUID from '../WebSocketMessages/UUID.js';
import LoxoneEventName from './LoxoneEventName.js';

abstract class LoxoneEvent {
    uuid: UUID;

    constructor(binaryData: Buffer, offset: number) {
        this.uuid = new UUID(binaryData, offset);
    }

    abstract data_length(): number;
    abstract eventName(): LoxoneEventName;
}

type LoxoneEventCtor<T extends LoxoneEvent> = new (binaryData: Buffer, offset: number) => T;

export { LoxoneEvent, LoxoneEventCtor };
