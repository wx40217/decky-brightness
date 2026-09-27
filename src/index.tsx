import { ButtonItem, DialogButton, Focusable, PanelSection, PanelSectionRow, SliderField, staticClasses } from "@decky/ui";
import { callable, definePlugin } from "@decky/api";
import { useSyncExternalStore } from "react";
import { FaSun } from "react-icons/fa";
import { BrightnessController } from "./controller";
import type { BackendState, DisplayAPI, SettingsState, SystemSettingsAPI } from "./types";

const getState = callable<[], BackendState>("get_state");
const saveMinimum = callable<[value: number], SettingsState>("save_minimum");
const fontFamily = '"Noto Sans CJK SC", "Noto Sans SC", "Noto Sans CJK JP", sans-serif';
const panelStyles = `
[data-brightness-floor], [data-brightness-floor] * {
  font-family: ${fontFamily} !important;
  font-stretch: normal !important;
  font-feature-settings: normal !important;
}
`;

function percentage(value: number | null): string {
  return value === null ? "尚未取得" : `${(value * 100).toFixed(2)}%`;
}

function Content({ controller }: { controller: BrightnessController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const allowed = state.connected && state.backend?.environment.allowed === true;
  const canAdjust = allowed && state.adaptiveEnabled === false && state.current !== null &&
    !(state.busy && state.requested === null);
  const minimum = state.minimum ?? 0;
  const value = state.requested ?? state.current ?? state.minimum ?? 0;
  const reason = state.backend?.environment.reason;
  const status = state.error || reason || state.backend?.settings_error || state.adaptiveError ||
    (state.adaptiveEnabled === true ? "请关闭系统自适应后调光。" :
      state.adaptiveEnabled === null ? "正在读取系统自适应状态…" :
      state.current === null ? "尚未取得亮度，请在系统中略微调亮。" :
      state.busy ? "正在调节…" :
      state.minimum !== null && state.current < state.minimum ? "当前亮度低于下限，可点击“回到最低亮度”。" : null);
  const needsRefresh = !!state.error || !!state.adaptiveError || !state.backend || state.current === null;

  return <div data-brightness-floor lang="zh-CN">
    <style>{panelStyles}</style>
    <PanelSection>
      <PanelSectionRow>
        <div style={{ lineHeight: 1.6 }}>
          <div style={{ fontSize: 20, fontWeight: 500 }}>当前亮度 {percentage(state.current)}</div>
          <div style={{ fontSize: 14, color: "#b8bcbf" }}>
            下限 {percentage(state.minimum)}{state.backend?.minimum_is_default && " · 默认"}
            <br />自适应：{state.adaptiveEnabled === null ? "读取中" : state.adaptiveEnabled ? "开启" : "关闭"}
          </div>
        </div>
      </PanelSectionRow>
      {minimum < 1 && <PanelSectionRow>
        <SliderField label="亮度"
          min={minimum * 100} max={100} step={0.01} minimumDpadGranularity={0.01}
          notchTicksVisible={false}
          value={Math.max(minimum * 100, Math.min(100, value * 100))}
          showValue={false} disabled={!canAdjust}
          onChange={value => controller.setBrightness(value / 100)} />
      </PanelSectionRow>}
      <PanelSectionRow>
        <Focusable style={{ display: "flex", gap: 4 }} flow-children="row">
          {[-0.001, -0.0001, 0.0001, 0.001].map(delta =>
            <DialogButton key={delta}
              style={{ minWidth: 0, padding: "8px 2px", flex: 1, fontSize: 14, whiteSpace: "nowrap" }}
              disabled={!canAdjust ||
                (delta < 0 ? value <= minimum : value >= 1)}
              onClick={() => controller.adjustBrightness(delta)}>
              {delta < 0 ? "−" : "+"}{Math.abs(delta * 100).toFixed(delta === -0.001 || delta === 0.001 ? 1 : 2)}%
            </DialogButton>)}
        </Focusable>
      </PanelSectionRow>
      {state.minimum === 1 && <PanelSectionRow>
        <div style={{ fontSize: 14 }}>下限已设为最大亮度。</div>
      </PanelSectionRow>}
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={!canAdjust || state.minimum === null || state.busy}
          onClick={() => { if (state.minimum !== null) controller.setBrightness(state.minimum); }}>
          回到最低亮度
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={!canAdjust || state.busy}
          onClick={() => void controller.saveCurrentMinimum()}>
          将当前亮度设为下限
        </ButtonItem>
      </PanelSectionRow>
      {status && <PanelSectionRow>
        <div role="status" style={{ fontSize: 14, lineHeight: 1.5, color: "#ffb86b" }}>{status}</div>
      </PanelSectionRow>}
      {needsRefresh && <PanelSectionRow>
        <ButtonItem layout="below" disabled={state.busy} onClick={() => void controller.refresh()}>
          重新读取状态
        </ButtonItem>
      </PanelSectionRow>}
      <PanelSectionRow>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: "#b8bcbf" }}>
          下限仅作用于插件内调光。
        </div>
      </PanelSectionRow>
    </PanelSection>
  </div>;
}

export default definePlugin(() => {
  const host = window as unknown as { SteamClient?: { System?: SystemSettingsAPI & { Display?: DisplayAPI } } };
  const controller = new BrightnessController(host.SteamClient?.System?.Display, { getState, saveMinimum }, host.SteamClient?.System);
  void controller.start();
  return {
    name: "亮度下限",
    titleView: <div className={staticClasses.Title} lang="zh-CN" style={{ fontFamily }}>亮度下限</div>,
    content: <Content controller={controller} />,
    icon: <FaSun />,
    onDismount() { controller.dispose(); },
  };
});
