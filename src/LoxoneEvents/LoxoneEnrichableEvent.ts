import Control from '../Structure/Control.js';
import Room from '../Structure/Room.js';
import State from '../Structure/State.js';
import { LoxoneEvent } from './LoxoneEvent.js';

abstract class LoxoneEnrichableEvent extends LoxoneEvent {
    room: Room | undefined;
    control: Control | undefined;
    state: State | undefined;
    abstract toPath(): string;
    isEnriched: boolean | undefined;
}

export default LoxoneEnrichableEvent;
