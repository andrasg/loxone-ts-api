class UUID {
    data_length: number;
    private data1: Buffer;
    private data2: Buffer;
    private data3: Buffer;
    private data4: Buffer;
    stringValue: string;
    static empty: UUID = new UUID(Buffer.alloc(16), 0);

    constructor(binaryData: Buffer, offset: number) {
        this.data1 = Buffer.from(binaryData.subarray(offset + 0, offset + 4));
        this.data2 = Buffer.from(binaryData.subarray(offset + 4, offset + 6));
        this.data3 = Buffer.from(binaryData.subarray(offset + 6, offset + 8));
        this.data4 = Buffer.from(binaryData.subarray(offset + 8, offset + 16));

        UUID._swap_32(this.data1);
        UUID._swap_16(this.data2);
        UUID._swap_16(this.data3);

        this.data_length = 16;

        this.stringValue = this.data1.toString('hex') + '-' + this.data2.toString('hex') + '-' + this.data3.toString('hex') + '-' + this.data4.toString('hex');
    }

    toString(): string {
        return this.stringValue;
    }

    private static _swap_16(data: Buffer) {
        const t = data[0];
        data[0] = data[1];
        data[1] = t;
    }

    private static _swap_32(data: Buffer) {
        let t = data[0];
        data[0] = data[3];
        data[3] = t;
        t = data[1];
        data[1] = data[2];
        data[2] = t;
    }

    static fromString(uuidString: string): UUID {
        let parts = uuidString.split('-');
        if (parts.length === 5) {
            parts[3] = parts[3] + parts[4];
            parts = parts.splice(4, 1);
        } else if (parts.length !== 4) {
            throw new Error('Invalid UUID string');
        }
        if (parts[0].length !== 8 || parts[1].length !== 4 || parts[2].length !== 4 || parts[3].length !== 16) {
            throw new Error('Invalid UUID string');
        }

        const data1 = Buffer.from(parts[0], 'hex');
        UUID._swap_32(data1);
        const data2 = Buffer.from(parts[1], 'hex');
        UUID._swap_16(data2);
        const data3 = Buffer.from(parts[2], 'hex');
        UUID._swap_16(data3);
        const data4 = Buffer.from(parts[3], 'hex');

        const buffer = Buffer.concat([data1, data2, data3, data4]);
        return new UUID(buffer, 0);
    }
}

export default UUID;
