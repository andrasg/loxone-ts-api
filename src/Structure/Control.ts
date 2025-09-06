import Room from './Room.js';
import State from './State.js';

class Control {
    uuid: string;
    name: string;
    room: Room;
    parent: Control | undefined;
    structureSection: any;
    type: string;
    uuidAction: string;
    statesByName: Map<string, State> = new Map<string, State>();
    statesByUuid: Map<string, State> = new Map<string, State>();

    constructor(uuid: string, structureSection: any, room: Room, parent: Control | undefined = undefined) {
        this.uuid = uuid;
        this.structureSection = structureSection;
        this.name = structureSection.name;
        this.type = structureSection.type;
        this.uuidAction = structureSection.uuidAction;

        this.parent = parent;
        this.room = room;
    }

    addState(state: State) {
        this.statesByName.set(state.name, state);
        this.statesByUuid.set(state.uuid.stringValue, state);
    }
}

export default Control;
