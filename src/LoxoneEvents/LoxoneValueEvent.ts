import { GREY, YELLOW } from 'node-ansi-logger';
import LoxoneEnrichableEvent from './LoxoneEnrichableEvent.js';

class LoxoneValueEvent extends LoxoneEnrichableEvent {
    typeName = LoxoneValueEvent.name;
    value: number;

    constructor(binaryData: Buffer, offset: number) {
        super(binaryData, offset);

        this.value = binaryData.readDoubleLE(offset + this.uuid.data_length);
    }

    override data_length(): number {
        return 8 + this.uuid.data_length; // should always be 24
    }

    override toPath(): string {
        const parentControl = this.state?.parentControl;
        const controlString = parentControl ? `${parentControl.name}${GREY}/${YELLOW}${parentControl.name}` : 'unknown';
        const roomString = parentControl?.room.name ?? 'unknown';
        return this.isEnriched ? `${YELLOW}${roomString}${GREY}/${YELLOW}${controlString}${GREY}/${YELLOW}${this.state?.name}${GREY}` : this.uuid.stringValue;
    }

    override toString(): string {
        return `${YELLOW}${this.toPath()}${GREY} = ${YELLOW}${this.value}`;
    }
}

export default LoxoneValueEvent;
