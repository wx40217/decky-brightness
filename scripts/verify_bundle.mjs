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
const backend = {
  minimum_brightness: floor, settings_error: null,
  environment: { allowed: true, reason: "", model: "Galileo", steamos_version: "test", kernel: "test" },
};
const jsx = (type, props) => ({ type, props });
const context = {
  console, setTimeout, clearTimeout,
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
          return { minimum_brightness: value, settings_error: null };
        } };
      },
    },
    SteamClient: { System: { Display: {
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
  DFL: Object.fromEntries(["PanelSection", "PanelSectionRow", "ButtonItem", "ToggleField", "SliderField"]
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
function panel() { return nodes(plugin.content.type(plugin.content.props)); }
let content = panel();
let slider = content.find(node => node.type === "SliderField");
assert.equal(slider.props.min, floor * 100);
assert.equal(slider.props.disabled, true);
content.find(node => node.type === "ToggleField").props.onChange(true);
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
console.log("Compiled plugin loads, restores calibration, clamps slider and button, and unloads cleanly (mock Steam/Decky).");
