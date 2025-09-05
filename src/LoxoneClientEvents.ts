import LoxoneClientState from './LoxoneClientState.js';
import LoxoneTextEvent from './LoxoneEvents/LoxoneTextEvent.js';
import LoxoneValueEvent from './LoxoneEvents/LoxoneValueEvent.js';
import FileMessage from './WebSocketMessages/FileMessage.js';
import TextMessage from './WebSocketMessages/TextMessage.js';

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
}

export default LoxoneClientEvents;
