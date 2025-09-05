/**
 * Represents the packed WebSocket binary header (WsBinHdr) from the C struct:
 *
 * typedef struct {
 *   BYTE cBinType;    // fix 0x03
 *   BYTE cIdentifier; // 8-Bit Unsigned Integer (little endian)
 *   BYTE cInfo;       // Info
 *   BYTE cReserved;   // reserved
 *   UINT nLen;        // 32-Bit Unsigned Integer (little endian)
 * } PACKED WsBinHdr;
 *
 * This class can parse the header from a Buffer and serialize it back.
 */
class WsBinHdr {
    static readonly SIZE = 8; // total bytes in the packed struct

    cBinType: number; // 1 byte
    cIdentifier: number; // 1 byte
    cInfo: number; // 1 byte
    cReserved: number; // 1 byte
    nLen: number; // 4 bytes (uint32 little-endian)

    constructor(cBinType = 0x03, cIdentifier = 0, cInfo = 0, cReserved = 0, nLen = 0) {
        this.cBinType = cBinType;
        this.cIdentifier = cIdentifier;
        this.cInfo = cInfo;
        this.cReserved = cReserved;
        this.nLen = nLen >>> 0;
    }
}

export default WsBinHdr;
