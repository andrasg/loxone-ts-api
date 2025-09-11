import UUID from '../WebSocketMessages/UUID.js';

abstract class LoxoneEvent {
    uuid: UUID;
    date: Date;
    abstract typeName: string;

    constructor(binaryData: Buffer, offset: number) {
        this.uuid = new UUID(binaryData, offset);
        this.date = new Date();
    }

    abstract data_length(): number;
    abstract toPath(): string;
}

type LoxoneEventCtor<T extends LoxoneEvent> = new (binaryData: Buffer, offset: number) => T;

export { LoxoneEvent, LoxoneEventCtor };
