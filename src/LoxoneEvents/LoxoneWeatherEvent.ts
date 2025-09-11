import UUID from '../WebSocketMessages/UUID.js';
import { LoxoneEvent } from './LoxoneEvent.js';

class LoxoneWeatherEvent extends LoxoneEvent {
    typeName = LoxoneWeatherEvent.name;
    lastUpdate: number;
    entries: number;
    entry: {
        timestamp: number;
        weatherType: number;
        windDirection: number;
        solarRadiation: number;
        relativeHumidity: number;
        temperature: number;
        perceivedTemperature: number;
        dewPoint: number;
        precipitation: number;
        windSpeed: number;
        barometricPressure: number;
    }[];

    constructor(binaryData: Buffer, offset: number) {
        super(binaryData, offset);

        let offset_add = offset;
        this.uuid = new UUID(binaryData, offset_add);
        offset_add += this.uuid.data_length;
        this.lastUpdate = binaryData.readUInt32LE(offset_add);
        offset_add += 4;
        this.entries = binaryData.readInt32LE(offset_add);
        offset_add += 4;

        this.entry = [];

        for (let i = 0; i < this.entries; i++) {
            this.entry.push({
                'timestamp': binaryData.readInt32LE(offset_add),
                'weatherType': binaryData.readInt32LE(offset_add + 4),
                'windDirection': binaryData.readInt32LE(offset_add + 8),
                'solarRadiation': binaryData.readInt32LE(offset_add + 12),
                'relativeHumidity': binaryData.readInt32LE(offset_add + 16),
                'temperature': binaryData.readDoubleLE(offset_add + 20),
                'perceivedTemperature': binaryData.readDoubleLE(offset_add + 28),
                'dewPoint': binaryData.readDoubleLE(offset_add + 36),
                'precipitation': binaryData.readDoubleLE(offset_add + 44),
                'windSpeed': binaryData.readDoubleLE(offset_add + 52),
                'barometricPressure': binaryData.readDoubleLE(offset_add + 60),
            });
            offset_add += 68;
        }
    }

    override data_length(): number {
        return this.uuid.data_length + 4 + 4 + this.entries * 68;
    }

    override toPath(): string {
        return this.uuid.stringValue;
    }
}

export default LoxoneWeatherEvent;
