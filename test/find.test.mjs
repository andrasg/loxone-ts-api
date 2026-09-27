import assert from "node:assert/strict";
import { test } from "node:test";
import { AnsiLogger, LogLevel } from "node-ansi-logger";
import LoxoneClient from "../dist/LoxoneClient.js";
import LoxoneClientState from "../dist/LoxoneClientState.js";
import Auth from "../dist/Services/Auth.js";
import WebSocketConnection from "../dist/Services/WebSocketConnection.js";

const kitchen = "00000001-0000-0000-0000000000000000";
const office = "00000002-0000-0000-0000000000000000";
const light = "00000003-0000-0000-0000000000000000";
const dimmer = "00000004-0000-0000-0000000000000000";
const heater = "00000005-0000-0000-0000000000000000";
const unassigned = "00000006-0000-0000-0000000000000000";
const active = "00000007-0000-0000-0000000000000000";
const brightness = "00000008-0000-0000-0000000000000000";
const temperature = "00000009-0000-0000-0000000000000000";

function structureFile() {
  return {
    cats: { lighting: { name: "Lighting" }, heating: { name: "Heating" } },
    rooms: { [kitchen]: { name: "Kitchen" }, [office]: { name: "Office" } },
    controls: {
      [light]: {
        name: "Ceiling",
        type: "LightControllerV2",
        uuidAction: light,
        room: kitchen,
        cat: "lighting",
        states: { active },
        subControls: {
          [dimmer]: {
            name: "Dimmer",
            type: "Dimmer",
            uuidAction: dimmer,
            states: { brightness },
          },
        },
      },
      [heater]: {
        name: "Radiator",
        type: "IRoomControllerV2",
        uuidAction: heater,
        room: office,
        cat: "heating",
        states: { temperature },
      },
      [unassigned]: { name: "Unassigned", type: "Switch", uuidAction: unassigned },
    },
  };
}

function createClient() {
  return new LoxoneClient("127.0.0.1", "user", "pass", { logLevel: LogLevel.NONE });
}

function captureTable(t) {
  return t.mock.method(console, "table", () => null);
}

function mockNetwork(t, data = structureFile()) {
  t.mock.method(LoxoneClient.prototype, "checkVersion", async () => Promise.resolve());
  const connect = t.mock.method(WebSocketConnection.prototype, "connect", async function () {
    this.emit("connected");
    return Promise.resolve();
  });
  const authenticate = t.mock.method(Auth.prototype, "authenticate", async () => Promise.resolve());
  t.mock.method(WebSocketConnection.prototype, "enableKeepAlive", () => null);
  const fetch = t.mock.method(
    WebSocketConnection.prototype,
    "sendUnencryptedFileCommand",
    async () => Promise.resolve({ data }),
  );
  return { connect, authenticate, fetch };
}

/** @type {Array<[string, string[], string[]]>} */
const searchCases = [
  ["cEiL", [light, dimmer], [active, brightness]],
  ["KITchen", [light, dimmer], [active, brightness]],
  ["lIgHtInG", [light, dimmer], [active, brightness]],
  ["dimmer", [dimmer], [brightness]],
  ["BRIGHT", [], [brightness]],
  ["HEATING", [heater], [temperature]],
  ["<N/A>", [unassigned], []],
  ["", [light, dimmer, heater, unassigned], [active, brightness, temperature]],
  ["*", [light, dimmer, heater, unassigned], [active, brightness, temperature]],
  ["missing", [], []],
  ["Ceil*", [], []],
  [".*", [], []],
];

for (const [query, controlIds, stateIds] of searchCases) {
  void test(`find(${JSON.stringify(query)}) returns matching original objects and prints their UUIDs`, async (t) => {
    const table = captureTable(t);
    const client = createClient();
    client.structureFile = structureFile();
    const connect = t.mock.method(client, "connect");
    const disconnect = t.mock.method(client, "disconnect");
    const result = await client.find(query);

    assert.deepEqual(Object.keys(result).toSorted(), ["controls", "states"]);
    assert.deepEqual(
      result.controls,
      controlIds.map((id) => client.controls.get(id)),
    );
    assert.deepEqual(
      result.states,
      stateIds.map((id) => client.states.get(id)),
    );
    for (const control of result.controls) {
      assert.strictEqual(control, client.controls.get(control.uuid));
    }
    for (const state of result.states) {
      assert.strictEqual(state, client.states.get(state.uuid.stringValue));
    }
    assert.equal(table.mock.callCount(), 1);
    assert.deepEqual(
      table.mock.calls[0].arguments[0].map((row) => row.uuid),
      [...controlIds, ...stateIds],
    );
    assert.equal(connect.mock.callCount(), 0);
    assert.equal(disconnect.mock.callCount(), 0);
  });
}

void test("prints category, room, parent/subcontrol path and state name", async (t) => {
  const table = captureTable(t);
  const client = createClient();
  client.structureFile = structureFile();

  await client.find("brightness");

  assert.deepEqual(table.mock.calls[0].arguments, [
    [
      {
        kind: "state",
        uuid: brightness,
        category: "Lighting",
        room: "Kitchen",
        control: "Ceiling/Dimmer",
        state: "brightness",
      },
    ],
  ]);
});

void test("a subcontrol's own category overrides its parent's category", async (t) => {
  captureTable(t);
  const client = createClient();
  client.structureFile = structureFile();
  client.structureFile.controls[light].subControls[dimmer].cat = "heating";

  const result = await client.find("heating");

  assert.deepEqual(
    result.controls.map((control) => control.uuid),
    [dimmer, heater],
  );
  assert.deepEqual(
    result.states.map((state) => state.uuid.stringValue),
    [brightness, temperature],
  );
});

void test("missing category definitions do not prevent other fields from matching", async (t) => {
  captureTable(t);
  const client = createClient();
  client.structureFile = structureFile();
  delete client.structureFile.cats;

  assert.equal((await client.find("kitchen")).controls.length, 2);
  assert.equal((await client.find("lighting")).controls.length, 0);
});

void test("fresh-client one-liner connects, fetches, authenticates and disconnects", async (t) => {
  captureTable(t);
  const network = mockNetwork(t);
  const disconnect = t.mock.method(LoxoneClient.prototype, "disconnect");

  const result = await new LoxoneClient("127.0.0.1", "user", "pass", {
    logLevel: LogLevel.NONE,
  }).find("ceiling");

  assert.deepEqual(
    result.controls.map((control) => control.uuid),
    [light, dimmer],
  );
  assert.equal(network.connect.mock.callCount(), 1);
  assert.equal(network.authenticate.mock.callCount(), 1);
  assert.equal(network.fetch.mock.callCount(), 1);
  assert.equal(network.fetch.mock.calls[0].arguments[0], "data/LoxAPP3.json");
  assert.equal(disconnect.mock.callCount(), 1);
  const client = disconnect.mock.calls[0].this;
  assert.equal(client.state, LoxoneClientState.disconnected);
  assert.equal(Reflect.get(client, "autoReconnect").autoReconnectEnabled, true);
});

void test("ready clients remain connected and reuse the parsed structure on subsequent finds", async (t) => {
  captureTable(t);
  const network = mockNetwork(t);
  const client = createClient();
  Reflect.set(client, "_state", LoxoneClientState.ready);
  const connect = t.mock.method(client, "connect");
  const disconnect = t.mock.method(client, "disconnect");
  const parse = t.mock.method(client, "parseStructureFile");

  const first = await client.find("ceiling");
  const second = await client.find("ceiling");

  assert.deepEqual(second, first);
  assert.strictEqual(second.controls[0], first.controls[0]);
  assert.equal(network.fetch.mock.callCount(), 1);
  assert.equal(parse.mock.callCount(), 1);
  assert.equal(connect.mock.callCount(), 0);
  assert.equal(disconnect.mock.callCount(), 0);
  assert.equal(client.state, LoxoneClientState.ready);
});

void test("cached results remain searchable after the one-shot connection closes", async (t) => {
  captureTable(t);
  const network = mockNetwork(t);
  const client = createClient();
  const disconnect = t.mock.method(client, "disconnect");

  await client.find("ceiling");
  await client.find("temperature");

  assert.equal(network.connect.mock.callCount(), 1);
  assert.equal(network.fetch.mock.callCount(), 1);
  assert.equal(disconnect.mock.callCount(), 1);
});

for (const ready of [false, true]) {
  void test(`fetch failure rejects and closes only an owned connection (ready=${ready})`, async (t) => {
    const table = captureTable(t);
    const cause = new Error("Download failed");
    mockNetwork(t);
    const client = createClient();
    if (ready) Reflect.set(client, "_state", LoxoneClientState.ready);
    t.mock.method(client, "getStructureFile", async () => Promise.reject(cause));
    const disconnect = t.mock.method(client, "disconnect");

    await assert.rejects(client.find("*"), (error) => {
      assert.strictEqual(error.cause, cause);
      return true;
    });
    assert.equal(disconnect.mock.callCount(), ready ? 0 : 1);
    assert.equal(table.mock.callCount(), 0);
    assert.equal(client.state, ready ? LoxoneClientState.ready : LoxoneClientState.disconnected);
  });
}

void test("parse failure rejects and disconnects a one-shot connection", async (t) => {
  const table = captureTable(t);
  const data = structureFile();
  data.controls[light].room = "unknown-room";
  mockNetwork(t, data);
  const client = createClient();

  await assert.rejects(client.find("*"), /Could not find room/);

  assert.equal(table.mock.callCount(), 0);
  assert.equal(client.state, LoxoneClientState.disconnected);
});

for (const autoReconnectEnabled of [false, true]) {
  void test(`connection failure rejects without retry and restores autoReconnect=${autoReconnectEnabled}`, async (t) => {
    const table = captureTable(t);
    const network = mockNetwork(t);
    const cause = new Error("Connection refused");
    network.connect.mock.mockImplementation(async () => Promise.reject(cause));
    const client = new LoxoneClient("127.0.0.1", "user", "pass", {
      logLevel: LogLevel.NONE,
      autoReconnectEnabled,
    });

    await assert.rejects(client.find("*"), /Not connected and authenticated/);

    assert.equal(network.connect.mock.callCount(), 1);
    assert.equal(network.fetch.mock.callCount(), 0);
    assert.equal(table.mock.callCount(), 0);
    assert.equal(client.state, LoxoneClientState.disconnected);
    const reconnect = Reflect.get(client, "autoReconnect");
    assert.equal(reconnect.autoReconnectEnabled, autoReconnectEnabled);
    assert.equal(reconnect.reconnectTimeout, undefined);
    assert.equal(reconnect.autoReconnectingInProgress, false);
  });
}

for (const state of [LoxoneClientState.connecting, LoxoneClientState.reconnecting]) {
  void test(`does not interfere with a client that is ${state}`, async (t) => {
    captureTable(t);
    const client = createClient();
    Reflect.set(client, "_state", state);
    const connect = t.mock.method(client, "connect");
    const disconnect = t.mock.method(client, "disconnect");

    await assert.rejects(client.find("*"), /Cannot find while client is/);

    assert.equal(connect.mock.callCount(), 0);
    assert.equal(disconnect.mock.callCount(), 0);
    assert.equal(client.state, state);
  });
}

void test("disconnect still cleans up if token invalidation fails", async (t) => {
  captureTable(t);
  mockNetwork(t);
  const client = createClient();
  const cause = new Error("Token invalidation failed");
  t.mock.method(client.auth.tokenHandler, "killToken", async () => Promise.reject(cause));
  const cleanup = t.mock.method(WebSocketConnection.prototype, "cleanupAfterDisconnectOrError");
  const log = t.mock.method(AnsiLogger.prototype, "error", () => null);

  await client.find("*");

  assert.equal(cleanup.mock.callCount(), 1);
  assert.equal(log.mock.callCount(), 1);
  assert.strictEqual(log.mock.calls[0].arguments[1], cause);
  assert.equal(client.state, LoxoneClientState.disconnected);
});

void test("reusing a one-shot client keeps reconnect handlers wired", async (t) => {
  captureTable(t);
  mockNetwork(t);
  const client = createClient();
  await client.find("*");
  const reconnect = Reflect.get(client, "autoReconnect");
  const startReconnect = t.mock.method(reconnect, "startAutoReconnect", async () =>
    Promise.resolve(),
  );
  const connection = Reflect.get(client, "webSocketConnection");

  await client.connect();
  connection.emit("disconnected", "test");

  assert.equal(startReconnect.mock.callCount(), 1);
  assert.equal(reconnect.autoReconnectEnabled, true);
  await client.disconnect(true);
});
