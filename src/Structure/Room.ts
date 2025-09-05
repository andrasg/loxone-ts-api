import UUID from '../WebSocketMessages/UUID.js';

class Room {
    uuid: UUID;
    name: string;

    constructor(uuid: UUID, name: string) {
        this.uuid = uuid;
        this.name = name;
    }
}

export default Room;
