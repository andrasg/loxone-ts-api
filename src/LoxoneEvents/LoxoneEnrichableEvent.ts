import State from '../Structure/State.js';
import { LoxoneEvent } from './LoxoneEvent.js';

abstract class LoxoneEnrichableEvent extends LoxoneEvent {
    state: State | undefined;
    abstract toPath(): string;
    isEnriched: boolean | undefined;
}

export default LoxoneEnrichableEvent;
