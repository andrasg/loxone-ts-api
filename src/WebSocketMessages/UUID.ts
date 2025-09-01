class UUID {
    data_length: number;
    private data1: Buffer;
    private data2: Buffer;
    private data3: Buffer;
    private data4: Buffer;

    constructor(binaryData: Buffer, offset: number) {
        this.data1 = Buffer.from(binaryData.subarray(offset + 0, offset + 4));
        this.data2 = Buffer.from(binaryData.subarray(offset + 4, offset + 6));
        this.data3 = Buffer.from(binaryData.subarray(offset + 6, offset + 8));
        this.data4 = Buffer.from(binaryData.subarray(offset + 8, offset + 16));

        this._swap_32(this.data1);
        this._swap_16(this.data2);
        this._swap_16(this.data3);

        this.data_length = 16;
    }

    toString() {
        return this.data1.toString('hex') + '-' + this.data2.toString('hex') + '-' + this.data3.toString('hex') + '-' + this.data4.toString('hex');
    }

    private _swap_16(data: Buffer) {
        const t = data[0];
        data[0] = data[1];
        data[1] = t;
    }

    private _swap_32(data: Buffer) {
        let t = data[0];
        data[0] = data[3];
        data[3] = t;
        t = data[1];
        data[1] = data[2];
        data[2] = t;
    }
}

export default UUID;
