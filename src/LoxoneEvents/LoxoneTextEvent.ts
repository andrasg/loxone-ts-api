import { GREY, YELLOW } from 'node-ansi-logger';
import UUID from '../WebSocketMessages/UUID.js';
import LoxoneEnrichableEvent from './LoxoneEnrichableEvent.js';

class LoxoneTextEvent extends LoxoneEnrichableEvent {
    typeName = LoxoneTextEvent.name;
    uuidIcon: UUID;
    textLength: number;
    text: string;

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

    override toPath(): string {
        const parentControl = this.state?.parentControl;
        const controlString = parentControl ? `${parentControl.name}${GREY}/${YELLOW}${parentControl.name}` : 'unknown';
        const roomString = parentControl?.room.name ?? 'unknown';
        return this.isEnriched ? `${YELLOW}${roomString}${GREY}/${YELLOW}${controlString}${GREY}/${YELLOW}${this.state?.name}${GREY}` : this.uuid.stringValue;
    }

    override toString(): string {
        return `${YELLOW}${this.toPath()}${GREY} = ${YELLOW}${this.text}`;
    }
}

export default LoxoneTextEvent;
