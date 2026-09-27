import assert from "node:assert/strict";
import { test } from "node:test";
import { AnsiLogger, LogLevel } from "node-ansi-logger";
import LoxoneClient, { LoxoneControlError } from "../dist/LoxoneClient.js";
import LoxoneClientState from "../dist/LoxoneClientState.js";
import WebSocketConnection from "../dist/Services/WebSocketConnection.js";
import TextMessage from "../dist/WebSocketMessages/TextMessage.js";
import UUID from "../dist/WebSocketMessages/UUID.js";

const uuid = "90f7abe3-8772-476d-b1dda5c1c4cf1ed9";
const command = `jdev/sps/io/${uuid}/on`;

function createClient(ready = true, isGen2 = false) {
  const client = new LoxoneClient("localhost", "user", "pass", {
    logLevel: LogLevel.NONE,
    autoReconnectEnabled: false,
  });
  // Set connection state without opening a network connection in these unit tests.
  Reflect.set(client, "_state", ready ? LoxoneClientState.ready : LoxoneClientState.disconnected);
  Reflect.set(client, "isGen2", isGen2);
  return client;
}

function responseFor(code, value = "1") {
  return new TextMessage(JSON.stringify({ LL: { Code: code, control: command, value } }));
}

for (const isGen2 of [false, true]) {
  void test(`200 returns the original response and preserves Gen.${isGen2 ? 2 : 1} command options`, async (t) => {
    const response = responseFor("200");
    const send = t.mock.method(WebSocketConnection.prototype, "sendCommand", async () =>
      Promise.resolve(response),
    );
    const result = await createClient(true, isGen2).control(UUID.fromString(uuid), "on", 1234);

    assert.strictEqual(result, response);
    assert.equal(send.mock.callCount(), 1);
    assert.deepEqual(send.mock.calls[0].arguments, [command, !isGen2, 1234]);
  });
}

for (const code of [400, 401, 403, 404, 500, undefined]) {
  void test(`rejects response code ${code} and retains the original response`, async (t) => {
    const response = responseFor(code);
    const send = t.mock.method(WebSocketConnection.prototype, "sendCommand", async () =>
      Promise.resolve(response),
    );
    const log = t.mock.method(AnsiLogger.prototype, "error");

    await assert.rejects(createClient().control(uuid, "on"), (error) => {
      assert.ok(error instanceof Error);
      assert.ok(error instanceof LoxoneControlError);
      assert.equal(error.name, "LoxoneControlError");
      assert.strictEqual(error.response, response);
      assert.equal(error.response.code, code);
      assert.equal(error.response.value, "1");
      assert.equal(error.response.control, command);
      assert.ok(error.message.includes(`${uuid}/on`));
      assert.ok(error.message.includes(`response.code = ${code}`));
      if (code === 404) assert.match(error.message, /control not found/);
      assert.equal(log.mock.callCount(), 1);
      assert.strictEqual(log.mock.calls[0].arguments[1], error);
      return true;
    });
    assert.equal(send.mock.callCount(), 1);
  });
}

void test('200 with value "0" rejects as unsuccessful execution', async (t) => {
  const response = responseFor(200, "0");
  const send = t.mock.method(WebSocketConnection.prototype, "sendCommand", async () =>
    Promise.resolve(response),
  );
  const log = t.mock.method(AnsiLogger.prototype, "error");

  await assert.rejects(createClient().control(uuid, "on"), (error) => {
    assert.ok(error instanceof LoxoneControlError);
    assert.strictEqual(error.response, response);
    assert.match(error.message, /unsuccessful execution/);
    assert.match(error.message, /response.code = 200/);
    assert.match(error.message, /response.value = "0"/);
    assert.equal(log.mock.callCount(), 1);
    return true;
  });
  assert.equal(send.mock.callCount(), 1);
});

void test('non-200 takes precedence over value "0"', async (t) => {
  const response = responseFor(404, "0");
  t.mock.method(WebSocketConnection.prototype, "sendCommand", async () =>
    Promise.resolve(response),
  );

  await assert.rejects(createClient().control(uuid, "on"), (error) => {
    assert.ok(error instanceof LoxoneControlError);
    assert.strictEqual(error.response, response);
    assert.match(error.message, /control not found/);
    assert.match(error.message, /404/);
    return true;
  });
});

for (const value of [0, false, "", { result: "ok" }]) {
  void test(`200 with value ${JSON.stringify(value)} is not the string failure marker`, async (t) => {
    const response = responseFor(200, value);
    const send = t.mock.method(WebSocketConnection.prototype, "sendCommand", async () =>
      Promise.resolve(response),
    );

    assert.strictEqual(await createClient().control(uuid, "on"), response);
    assert.deepEqual(send.mock.calls[0].arguments, [command, true, 15000]);
  });
}

void test("transport rejection retains the original cause and command context", async (t) => {
  const cause = new Error("Connection closed");
  const send = t.mock.method(WebSocketConnection.prototype, "sendCommand", async () =>
    Promise.reject(cause),
  );
  const log = t.mock.method(AnsiLogger.prototype, "error");

  await assert.rejects(createClient().control(uuid, "on"), (error) => {
    assert.ok(error instanceof Error);
    assert.ok(!(error instanceof LoxoneControlError));
    assert.strictEqual(error.cause, cause);
    assert.ok(error.message.includes(`${uuid}/on`));
    assert.match(error.message, /Connection closed/);
    assert.equal(log.mock.callCount(), 1);
    assert.strictEqual(log.mock.calls[0].arguments[1], cause);
    return true;
  });
  assert.equal(send.mock.callCount(), 1);
});

void test("not-ready client still rejects without sending a command", async (t) => {
  const send = t.mock.method(WebSocketConnection.prototype, "sendCommand");

  await assert.rejects(createClient(false).control(uuid, "on"), (error) => {
    assert.ok(error instanceof Error);
    assert.ok(error.cause instanceof Error);
    assert.match(error.cause.message, /Not connected and authenticated/);
    return true;
  });
  assert.equal(send.mock.callCount(), 0);
});
