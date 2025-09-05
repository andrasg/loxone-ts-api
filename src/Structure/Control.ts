import UUID from '../WebSocketMessages/UUID.js';
import Room from './Room.js';

class Control {
    uuid: UUID;
    subcontrol: string | undefined;
    key: string;
    name: string;
    room: Room;
    parent: Control | undefined;

    constructor(uuid: string, name: string, room: Room, parent: Control | undefined = undefined) {
        this.parent = parent;
        this.key = uuid;
        if (uuid.includes('/')) {
            this.subcontrol = uuid.split('/')[1];
            this.uuid = UUID.fromString(uuid.split('/')[0]);
        } else {
            this.subcontrol = undefined;
            this.uuid = UUID.fromString(uuid);
        }
        this.name = name;
        this.room = room;
    }
}

export default Control;
