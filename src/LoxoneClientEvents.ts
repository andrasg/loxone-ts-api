import type LoxoneClientState from "./LoxoneClientState.js";
import type LoxoneTextEvent from "./LoxoneEvents/LoxoneTextEvent.js";
import type LoxoneValueEvent from "./LoxoneEvents/LoxoneValueEvent.js";
import type LoxoneDayTimerEvent from "./LoxoneEvents/LoxoneDayTimerEvent.js";
import type LoxoneWeatherEvent from "./LoxoneEvents/LoxoneWeatherEvent.js";
import type FileMessage from "./WebSocketMessages/FileMessage.js";
import type TextMessage from "./WebSocketMessages/TextMessage.js";

interface LoxoneClientEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  authenticated: () => void;
  ready: () => void;
  error: (err: Error) => void;
  text_message: (text: TextMessage) => void;
  file_message: (file: FileMessage) => void;
  stateChanged: (newState: LoxoneClientState) => void;
  event_value: (event: LoxoneValueEvent) => void;
  event_text: (event: LoxoneTextEvent) => void;
  event_daytimer: (event: LoxoneDayTimerEvent) => void;
  event_weather: (event: LoxoneWeatherEvent) => void;
}

export default LoxoneClientEvents;
