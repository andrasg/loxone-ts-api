import type State from "../Structure/State.js";
import { LoxoneEvent } from "./LoxoneEvent.js";

abstract class LoxoneEnrichableEvent extends LoxoneEvent {
  state: State | undefined;
  abstract override toPath(): string;
  isEnriched: boolean | undefined;
}

export default LoxoneEnrichableEvent;
