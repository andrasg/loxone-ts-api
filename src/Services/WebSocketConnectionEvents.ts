import type LoxoneDayTimerEvent from "../LoxoneEvents/LoxoneDayTimerEvent.js";
import type LoxoneTextEvent from "../LoxoneEvents/LoxoneTextEvent.js";
import type LoxoneValueEvent from "../LoxoneEvents/LoxoneValueEvent.js";
import type LoxoneWeatherEvent from "../LoxoneEvents/LoxoneWeatherEvent.js";
import type FileMessage from "../WebSocketMessages/FileMessage.js";
import type ParsedHeader from "../WebSocketMessages/ParsedHeader.js";
import type TextMessage from "../WebSocketMessages/TextMessage.js";

interface WebSocketConnectionEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (err: Error) => void;
  header: (header: ParsedHeader) => void;
  keepalive: (header: ParsedHeader) => void;
  text_message: (text: TextMessage) => void;
  file_message: (file: FileMessage) => void;
  event_table_values: (eventTable: LoxoneValueEvent[]) => void;
  event_table_text: (eventTable: LoxoneTextEvent[]) => void;
  event_table_day_timer: (eventTable: LoxoneDayTimerEvent[]) => void;
  event_table_weather: (eventTable: LoxoneWeatherEvent[]) => void;
}

export default WebSocketConnectionEvents;
