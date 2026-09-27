import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptiveBrightnessUpdate } from "../src/system-settings";

test("read native adaptive state from buffers, views and base64", () => {
  const off = new Uint8Array([13, 0, 0, 150, 67, 48, 1, 56, 0, 80, 0]);
  assert.equal(adaptiveBrightnessUpdate(off.buffer), false);
  assert.equal(adaptiveBrightnessUpdate(new DataView(off.buffer)), false);
  assert.equal(adaptiveBrightnessUpdate(Buffer.from(off).toString("base64")), false);
  const surrounded = new Uint8Array([255, ...off, 255]);
  assert.equal(adaptiveBrightnessUpdate(surrounded.subarray(1, -1)), false);
  assert.equal(adaptiveBrightnessUpdate(new Uint8Array([56, 1])), true);
});

test("missing fields in partial updates remain unknown and other wire types are skipped", () => {
  assert.equal(adaptiveBrightnessUpdate(new Uint8Array()), null);
  assert.equal(adaptiveBrightnessUpdate(new Uint8Array([48, 1])), null);
  const bytes = new Uint8Array([9, 0, 0, 0, 0, 0, 0, 0, 0, 18, 2, 7, 8, 56, 0]);
  assert.equal(adaptiveBrightnessUpdate(bytes), false);
});

test("malformed settings never become a false disabled state", () => {
  for (const bytes of [[56], [56, 2], [61, 0, 0, 0, 0], [0], [18, 99], [13, 0], [8, ...Array(10).fill(128)]]) {
    assert.throws(() => adaptiveBrightnessUpdate(new Uint8Array(bytes)));
  }
  assert.throws(() => adaptiveBrightnessUpdate("%invalid%"));
});
