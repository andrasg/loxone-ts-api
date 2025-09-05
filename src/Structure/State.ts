import UUID from '../WebSocketMessages/UUID.js';
import Control from './Control.js';
import Room from './Room.js';

class State {
    uuid: UUID;
    name: string;
    room: Room;
    control: Control;

    constructor(uuid: UUID, name: string, room: Room, control: Control) {
        this.uuid = uuid;
        this.name = name;
        this.room = room;
        this.control = control;
    }
}

export default State;
