import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
assert(source.includes("export { index as default };"));
const floor = 0.2345678912345;
let notify;
let unregisters = 0;
let intervals = 0;
let clears = 0;
const writes = [];
let adaptive = false;
const settingsListeners = new Set();
function setAdaptive(value) {
  adaptive = value;
  for (const callback of [...settingsListeners]) callback(new Uint8Array([56, adaptive ? 1 : 0]));
}
const backend = {
  minimum_brightness: floor, minimum_is_default: false, settings_error: null,
  environment: { allowed: true, reason: "", model: "Galileo", steamos_version: "test", kernel: "test" },
};
const jsx = (type, props) => ({ type, props });
const context = {
  console, setTimeout, clearTimeout, queueMicrotask,
  setInterval() { intervals++; return intervals; },
  clearInterval() { clears++; },
  window: {
    __DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit: {
      connect(version, name) {
        assert.equal(version, 2);
        assert.equal(name, "亮度下限");
        return { _version: 2, callable: route => async value => {
          if (route === "get_state") return structuredClone(backend);
          assert.equal(route, "save_minimum");
          backend.minimum_brightness = value;
          backend.minimum_is_default = false;
          return { minimum_brightness: value, minimum_is_default: false, settings_error: null };
        } };
      },
    },
    SteamClient: { System: {
      RegisterForSettingsChanges(callback) {
        settingsListeners.add(callback);
        callback(new Uint8Array([56, adaptive ? 1 : 0]));
        return { unregister() { settingsListeners.delete(callback); } };
      }, Display: {
      RegisterForBrightnessChanges(callback) {
        notify = callback;
        callback({ flBrightness: 0.7 });
        return { unregister() { unregisters++; } };
      },
      SetBrightness(value) { writes.push(value); notify({ flBrightness: value }); },
    } } },
  },
  SP_REACT: {
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
    createElement: jsx,
  },
  SP_JSX: { jsx, jsxs: jsx, Fragment: Symbol("fragment") },
  DFL: Object.fromEntries(["PanelSection", "PanelSectionRow", "ButtonItem", "ToggleField", "SliderField", "DialogButton", "Focusable"]
    .map(name => [name, name])),
};
context.DFL.staticClasses = { Title: "title" };
vm.runInNewContext(source.replace("export { index as default };", "globalThis.pluginFactory = index;"), context);
const plugin = context.pluginFactory();
const wait = () => new Promise(resolve => setTimeout(resolve, 0));
await wait();
assert.equal(plugin.name, "亮度下限");

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
function panel(target = plugin) { return nodes(target.content.type(target.content.props)); }
let content = panel();
let slider = content.find(node => node.type === "SliderField");
assert.equal(slider.props.min, floor * 100);
assert.equal(slider.props.disabled, false);
assert(!content.some(node => node.type === "ToggleField"), "manual acknowledgement must be removed");
setAdaptive(true);
content = panel();
assert.equal(content.find(node => node.type === "SliderField").props.disabled, true);
setAdaptive(false);
content = panel();
slider = content.find(node => node.type === "SliderField");
assert.equal(slider.props.disabled, false);
slider.props.onChange(0);
await wait();
assert.deepEqual(writes, [floor]);
content = panel();
content.find(node => node.type === "ButtonItem" && node.props.children === "回到最低亮度").props.onClick();
await wait();
assert.deepEqual(writes, [floor], "already-at-floor button should avoid an unnecessary write");
plugin.onDismount();
plugin.onDismount();
assert.equal(unregisters, 1);
assert.equal(intervals, 1);
assert.equal(clears, 1);
assert.equal(settingsListeners.size, 0);

backend.minimum_brightness = 0.44;
backend.minimum_is_default = true;
const calibration = context.pluginFactory();
await wait();
content = panel(calibration);
slider = content.find(node => node.type === "SliderField");
assert.equal(slider.props.min, 44);
assert.equal(slider.props.step, 0.01);
assert.equal(slider.props.minimumDpadGranularity, 0.01);
assert.equal(slider.props.disabled, false);
content = panel(calibration);
assert.equal(content.find(node => node.type === "SliderField").props.disabled, false);
const microButton = content.find(node => node.type === "DialogButton" &&
  node.props.children.join("") === "−0.01%");
assert.equal(microButton.props.disabled, false);
microButton.props.onClick();
await wait();
assert.equal(writes.at(-1), 0.6999);
assert.equal(content.find(node => node.type === "ButtonItem" && node.props.children === "回到最低亮度").props.disabled, false);
content = panel(calibration);
content.find(node => node.type === "ButtonItem" && node.props.children === "将当前亮度保存为下限").props.onClick();
await wait();
content = panel(calibration);
assert.equal(content.find(node => node.type === "SliderField").props.min, 69.99);
assert.equal(content.find(node => node.type === "DialogButton" && node.props.children.join("") === "−0.01%").props.disabled, true);
calibration.onDismount();
assert.equal(unregisters, 2);
assert.equal(intervals, 2);
assert.equal(clears, 2);
assert.equal(settingsListeners.size, 0);
console.log("Compiled plugin uses the default floor, reads system adaptive state, gates controls automatically, micro-adjusts, preserves custom floors and cleans up listeners (mock Steam/Decky).");
