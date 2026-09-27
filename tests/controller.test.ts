import assert from "node:assert/strict";
import { test } from "node:test";
import { BrightnessController, brightness, clampBrightness } from "../src/controller";
import type { BackendState, DisplayAPI } from "../src/types";

const initial = (): BackendState => ({
  minimum_brightness: 0.2345678912345, settings_error: null,
  environment: { allowed: true, reason: "", model: "Galileo", steamos_version: "test", kernel: "test" },
});

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
async function idle(controller: BrightnessController): Promise<void> {
  for (let i = 0; i < 100 && controller.getSnapshot().busy; i++) await tick();
  assert.equal(controller.getSnapshot().busy, false, "controller did not become idle");
}

async function harness(options: { initialEvent?: number | null; floor?: number | null; timeout?: number } = {}) {
  const backend = initial();
  if (options.floor !== undefined) backend.minimum_brightness = options.floor;
  let notify: (data: { flBrightness: number }) => void = () => {};
  let removed = 0;
  let rejectSave = false;
  let rejectRead = false;
  const writes: number[] = [];
  let writer: (value: number) => unknown = value => { queueMicrotask(() => notify({ flBrightness: value })); };
  const initialEvent = options.initialEvent === undefined ? 0.5 : options.initialEvent;
  const display: DisplayAPI = {
    RegisterForBrightnessChanges(callback) {
      notify = callback;
      if (initialEvent !== null) callback({ flBrightness: initialEvent });
      return { unregister() { removed++; } };
    },
    SetBrightness(value) { writes.push(value); return writer(value); },
  };
  const controller = new BrightnessController(display, {
    async getState() { if (rejectRead) throw new Error("offline"); return structuredClone(backend); },
    async saveMinimum(value) {
      if (rejectSave) throw new Error("disk full");
      backend.minimum_brightness = value;
      return { minimum_brightness: value, settings_error: null };
    },
  }, options.timeout ?? 20, 60_000);
  await controller.start();
  return { controller, backend, writes, notify: (value: number) => notify({ flBrightness: value }),
    removed: () => removed,
    writeWith: (value: (value: number) => unknown) => { writer = value; },
    failSave: () => { rejectSave = true; }, failRead: () => { rejectRead = true; } };
}

test("brightness validation and floor keep exact calibration at all boundaries", () => {
  for (const value of [NaN, Infinity, -0.001, 1.001, null, "0.5", true]) {
    assert.throws(() => brightness(value));
  }
  const floor = 0.2345678912345;
  assert.equal(clampBrightness(0, floor), floor);
  assert.equal(clampBrightness(floor, floor), floor);
  assert.equal(clampBrightness(0.8, floor), 0.8);
  assert.equal(clampBrightness(1, floor), 1);
  assert.equal(clampBrightness(0, 0), 0);
  assert.equal(clampBrightness(0, 1), 1);
});

test("missing current brightness blocks calibration writes instead of inventing a value", async t => {
  const h = await harness({ floor: null, initialEvent: null }); t.after(() => h.controller.dispose());
  assert.equal(h.controller.getSnapshot().current, null);
  await h.controller.saveCurrentMinimum();
  assert.match(h.controller.getSnapshot().error!, /尚未取得/);
  h.controller.confirmManual(true);
  h.controller.setBrightness(0.5);
  h.controller.adjustBrightness(0.0001);
  assert.deepEqual(h.writes, []);
});

test("unconfigured calibration supports fine changes and the full normalized range", async t => {
  const h = await harness({ floor: null }); t.after(() => h.controller.dispose());
  h.controller.setBrightness(0.4);
  assert.deepEqual(h.writes, [], "manual confirmation is still required");
  h.controller.confirmManual(true);
  h.controller.adjustBrightness(-0.0001);
  await idle(h.controller);
  assert.deepEqual(h.writes, [0.4999]);
  assert.equal(h.controller.getSnapshot().minimum, null);
  for (const target of [0, 1]) {
    h.controller.setBrightness(target);
    await idle(h.controller);
    assert.equal(h.controller.getSnapshot().current, target);
    assert.equal(h.controller.getSnapshot().error, null);
  }
});

test("saving calibration changes every subsequent adjustment to respect the exact floor", async t => {
  const h = await harness({ floor: null }); t.after(() => h.controller.dispose());
  h.controller.confirmManual(true);
  h.controller.adjustBrightness(0.0001);
  await idle(h.controller);
  await h.controller.saveCurrentMinimum();
  const floor = h.controller.getSnapshot().minimum!;
  assert.equal(floor, 0.5001);
  h.controller.adjustBrightness(-0.001);
  await idle(h.controller);
  h.controller.setBrightness(0.8);
  await idle(h.controller);
  h.controller.setBrightness(0);
  await idle(h.controller);
  assert.deepEqual(h.writes, [floor, 0.8, floor]);
});

test("rapid micro adjustments accumulate from the requested value without dropping clicks", async t => {
  const h = await harness({ floor: null }); t.after(() => h.controller.dispose());
  h.controller.confirmManual(true);
  h.writeWith(() => undefined);
  h.controller.adjustBrightness(0.0001);
  await tick();
  h.controller.adjustBrightness(0.0001);
  h.controller.adjustBrightness(0.0001);
  h.writeWith(value => queueMicrotask(() => h.notify(value)));
  h.notify(0.5001);
  await idle(h.controller);
  assert.equal(h.writes.length, 2);
  assert(Math.abs(h.writes[1] - 0.5003) < 1e-12);
  h.controller.adjustBrightness(NaN);
  assert.equal(h.writes.length, 2);
});

test("an unchanged brightness report cannot confirm a fine adjustment", async t => {
  const h = await harness({ floor: null }); t.after(() => h.controller.dispose());
  h.controller.confirmManual(true);
  h.writeWith(() => h.notify(0.5));
  h.controller.adjustBrightness(0.0001);
  await idle(h.controller);
  assert.match(h.controller.getSnapshot().error!, /未收到/);
  assert.equal(h.controller.getSnapshot().message, null);
});

test("calibration survives panel subscriptions, uses unrounded latest observation", async t => {
  const h = await harness({ floor: null, initialEvent: 0.456789123456 });
  t.after(() => h.controller.dispose());
  const unsubscribe = h.controller.subscribe(() => {});
  unsubscribe(); // Closing the QAM must not dispose the controller.
  await h.controller.saveCurrentMinimum();
  assert.equal(h.backend.minimum_brightness, 0.456789123456);
  h.notify(0.8123456789);
  assert.equal(h.controller.getSnapshot().current, 0.8123456789);
  h.controller.confirmManual(true);
  h.controller.setBrightness(0);
  await idle(h.controller);
  assert.deepEqual(h.writes, [0.456789123456]);
  assert.equal(h.controller.getSnapshot().current, 0.456789123456);
});

test("save failure preserves existing floor", async t => {
  const h = await harness({ initialEvent: 0.5 }); t.after(() => h.controller.dispose());
  h.failSave(); await h.controller.saveCurrentMinimum();
  assert.equal(h.controller.getSnapshot().minimum, initial().minimum_brightness);
  assert.match(h.controller.getSnapshot().error!, /后端操作失败/);
});

test("manual confirmation is required and invalid targets never reach Steam", async t => {
  const h = await harness(); t.after(() => h.controller.dispose());
  h.controller.setBrightness(0.8);
  assert.deepEqual(h.writes, []);
  h.controller.confirmManual(true);
  for (const value of [NaN, Infinity, -1, 2]) h.controller.setBrightness(value);
  assert.deepEqual(h.writes, []);
});

test("returning to an already reported target is a no-op, not a spurious timeout", async t => {
  const h = await harness({ initialEvent: initial().minimum_brightness! });
  t.after(() => h.controller.dispose());
  h.writeWith(() => undefined);
  h.controller.confirmManual(true);
  h.controller.setBrightness(0);
  await idle(h.controller);
  assert.deepEqual(h.writes, []);
  assert.equal(h.controller.getSnapshot().error, null);
  assert.match(h.controller.getSnapshot().message!, /已处于/);
});

test("rapid changes merge queued targets and every write respects floor", async t => {
  const h = await harness(); t.after(() => h.controller.dispose());
  h.writeWith(() => undefined);
  h.controller.confirmManual(true);
  h.controller.setBrightness(0.8);
  await tick();
  h.controller.setBrightness(0.7);
  h.controller.setBrightness(0);
  h.controller.setBrightness(0.1);
  assert.deepEqual(h.writes, [0.8]);
  h.writeWith(value => queueMicrotask(() => h.notify(value)));
  h.notify(0.8);
  await idle(h.controller);
  assert.deepEqual(h.writes, [0.8, initial().minimum_brightness]);
  assert(h.writes.every(value => value >= initial().minimum_brightness!));
});

test("no confirmation or below-floor confirmation is reported as failure", async t => {
  const h = await harness(); t.after(() => h.controller.dispose());
  h.writeWith(() => { h.notify(initial().minimum_brightness! - 0.00001); });
  h.controller.confirmManual(true);
  h.controller.setBrightness(0);
  await idle(h.controller);
  assert.match(h.controller.getSnapshot().error!, /未收到/);
  assert.equal(h.controller.getSnapshot().message, null);
  assert.equal(h.writes.length, 1, "must not correct below-floor events after the fact");
});

test("sync notifications and async API rejection cannot produce false success", async t => {
  const h = await harness(); t.after(() => h.controller.dispose());
  h.writeWith(value => { h.notify(value); return Promise.reject(new Error("native failure")); });
  h.controller.confirmManual(true);
  h.controller.setBrightness(0.6);
  await idle(h.controller);
  assert.match(h.controller.getSnapshot().error!, /设置失败/);
  assert.equal(h.controller.getSnapshot().message, null);
});

test("explicit native rejection and invalid observation are failures", async t => {
  const h = await harness(); t.after(() => h.controller.dispose());
  h.writeWith(() => false);
  h.controller.confirmManual(true);
  h.controller.setBrightness(0.6);
  await idle(h.controller);
  assert.match(h.controller.getSnapshot().error!, /拒绝/);
  h.writeWith(() => h.notify(NaN));
  h.controller.setBrightness(0.7);
  await idle(h.controller);
  assert.equal(h.controller.getSnapshot().current, null);
  assert.match(h.controller.getSnapshot().error!, /无效/);
});

test("dock transitions and inaccessible backend block writes and invalidate current", async t => {
  const h = await harness({ initialEvent: 0.5 }); t.after(() => h.controller.dispose());
  h.controller.confirmManual(true);
  h.backend.environment.allowed = false;
  h.backend.environment.reason = "external display";
  h.controller.setBrightness(0.6);
  await idle(h.controller);
  assert.deepEqual(h.writes, []);
  assert.equal(h.controller.getSnapshot().current, null);
  assert.equal(h.controller.getSnapshot().manualConfirmed, false);
  h.backend.environment.allowed = true;
  await h.controller.refresh();
  h.controller.confirmManual(true);
  h.failRead();
  h.controller.setBrightness(0.7);
  await idle(h.controller);
  assert.deepEqual(h.writes, []);
});

test("disposing pending work unregisters once and stops queued writes and notifications", async () => {
  const h = await harness();
  h.writeWith(() => undefined);
  h.controller.confirmManual(true);
  h.controller.setBrightness(0.8);
  await tick();
  h.controller.setBrightness(0.5);
  h.controller.dispose(); h.controller.dispose();
  const snapshot = h.controller.getSnapshot();
  h.notify(0.8);
  h.controller.setBrightness(0.9);
  await tick();
  assert.deepEqual(h.writes, [0.8]);
  assert.equal(h.removed(), 1);
  assert.equal(h.controller.getSnapshot(), snapshot);
});

test("missing display API fails safely", async () => {
  const controller = new BrightnessController(undefined, {
    async getState() { return initial(); }, async saveMinimum(value) { return { minimum_brightness: value, settings_error: null }; },
  });
  await controller.start();
  assert.equal(controller.getSnapshot().connected, false);
  assert.match(controller.getSnapshot().error!, /接口不可用/);
  controller.dispose();
});

test("backend timeouts remain recoverable and unload cancels pending startup", async () => {
  let offline = true;
  const display: DisplayAPI = {
    SetBrightness() {}, RegisterForBrightnessChanges() { return { unregister() {} }; },
  };
  const controller = new BrightnessController(display, {
    async getState() { if (offline) return new Promise<BackendState>(() => {}); return initial(); },
    async saveMinimum(value) { return { minimum_brightness: value, settings_error: null }; },
  }, 20, 60_000, 10);
  await controller.start();
  assert.match(controller.getSnapshot().error!, /无法读取/);
  offline = false;
  await controller.refresh();
  assert.equal(controller.getSnapshot().error, null);
  offline = true;
  const pending = controller.refresh();
  controller.dispose();
  assert.equal(await pending, false);
});
