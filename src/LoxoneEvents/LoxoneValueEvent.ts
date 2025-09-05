import { GREY, YELLOW } from 'node-ansi-logger';
import LoxoneEnrichableEvent from './LoxoneEnrichableEvent.js';

class LoxoneValueEvent extends LoxoneEnrichableEvent {
    value: number;

    constructor(binaryData: Buffer, offset: number) {
        super(binaryData, offset);

        this.value = binaryData.readDoubleLE(offset + this.uuid.data_length);
    }

    override data_length(): number {
        return 8 + this.uuid.data_length; // should always be 24
    }

    override toPath(): string {
        const control = this.control?.parent ? `${this.control.parent.name}${GREY}/${YELLOW}${this.control.name}` : this.control?.name;
        return this.isEnriched ? `${YELLOW}${this.room?.name}${GREY}/${YELLOW}${control}${GREY}/${YELLOW}${this.state?.name}${GREY}` : this.uuid.stringValue;
    }

    override toString(): string {
        return `${YELLOW}${this.toPath()}${GREY} = ${YELLOW}${this.value}`;
    }
}

export default LoxoneValueEvent;
