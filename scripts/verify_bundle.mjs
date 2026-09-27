import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
assert(source.includes("export { index as default };"));
for (const language of ["schinese", "english"]) {
const label = (chinese, english) => language === "schinese" ? chinese : english;
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
  navigator: { languages: ["zh-CN"] },
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
    SteamClient: { Settings: { async GetCurrentLanguage() { return language; } }, System: {
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
assert.equal(plugin.content.props.localization.getSnapshot(), label("zh-CN", "en"));
assert.equal(plugin.titleView.type(plugin.titleView.props).props.children, label("亮度下限", "Brightness Floor"));
assert.equal(content[0].props.lang, label("zh-CN", "en"));
let slider = content.find(node => node.type === "SliderField");
assert.equal(slider.props.label, label("亮度", "Brightness"));
assert.equal(slider.props.min, floor * 100);
assert.equal(slider.props.disabled, false);
assert(!content.some(node => node.type === "ToggleField"), "manual acknowledgement must be removed");
setAdaptive(true);
content = panel();
assert.equal(content.find(node => node.type === "SliderField").props.disabled, true);
assert.equal(content.find(node => node.props?.role === "status").props.children,
  label("请关闭系统自适应后调光。", "Turn off system adaptive brightness to adjust."));
setAdaptive(false);
content = panel();
slider = content.find(node => node.type === "SliderField");
assert.equal(slider.props.disabled, false);
slider.props.onChange(0);
await wait();
assert.deepEqual(writes, [floor]);
content = panel();
content.find(node => node.type === "ButtonItem" && node.props.children === label("回到最低亮度", "Return to minimum")).props.onClick();
await wait();
assert.deepEqual(writes, [floor], "already-at-floor button should avoid an unnecessary write");
backend.environment.allowed = false;
backend.environment.reason = "检测到外接显示器，插件调光已暂停。";
await plugin.content.props.controller.refresh();
assert.equal(panel().find(node => node.props?.role === "status").props.children,
  label(backend.environment.reason, "An external display is connected. Plugin brightness control is paused."));
backend.environment.allowed = true;
backend.environment.reason = "";
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
assert.equal(content.find(node => node.type === "ButtonItem" && node.props.children === label("回到最低亮度", "Return to minimum")).props.disabled, false);
content = panel(calibration);
content.find(node => node.type === "ButtonItem" && node.props.children === label("将当前亮度设为下限", "Save current as minimum")).props.onClick();
await wait();
content = panel(calibration);
assert.equal(content.find(node => node.type === "SliderField").props.min, 69.99);
assert.equal(content.find(node => node.type === "DialogButton" && node.props.children.join("") === "−0.01%").props.disabled, true);
notify({ flBrightness: NaN });
content = panel(calibration);
assert.equal(content.find(node => node.props?.role === "status").props.children,
  label("系统返回了无法识别的亮度值，无法确认当前亮度。", "Steam returned an invalid brightness value. Current brightness cannot be confirmed."));
calibration.onDismount();
assert.equal(unregisters, 2);
assert.equal(intervals, 2);
assert.equal(clears, 2);
assert.equal(settingsListeners.size, 0);
console.log(`Compiled plugin verified in ${language}: localized UI and errors, exact floors, fine adjustments, adaptive gating and listener cleanup (mock Steam/Decky).`);
}
