import LoxoneDayTimerEvent from './LoxoneEvents/LoxoneDayTimerEvent.js';
import LoxoneTextEvent from './LoxoneEvents/LoxoneTextEvent.js';
import LoxoneValueEvent from './LoxoneEvents/LoxoneValueEvent.js';
import LoxoneWeatherEvent from './LoxoneEvents/LoxoneWeatherEvent.js';
import ParsedHeader from './WebSocketMessages/ParsedHeader.js';
import FileMessage from './WebSocketMessages/FileMessage.js';
import TextMessage from './WebSocketMessages/TextMessage.js';

interface LoxoneClientEvents {
    connected: () => void;
    disconnected: (reason: string) => void;
    authenticated: () => void;
    ready: () => void;
    error: (err: Error) => void;
    header: (header: ParsedHeader) => void;
    keepalive: (header: ParsedHeader) => void;
    text_message: (text: TextMessage) => void;
    file_message: (file: FileMessage) => void;
    event_table_values: (eventTable: LoxoneValueEvent[]) => void;
    event_table_text: (eventTable: LoxoneTextEvent[]) => void;
    event_table_day_timer: (eventTable: LoxoneDayTimerEvent[]) => void;
    event_table_weather: (eventTable: LoxoneWeatherEvent[]) => void;
    stateChanged: (newState: string) => void;
    event_value: (event: LoxoneValueEvent) => void;
    event_text: (event: LoxoneTextEvent) => void;
}

export default LoxoneClientEvents;
