import { ButtonItem, PanelSection, PanelSectionRow, SliderField, ToggleField, staticClasses } from "@decky/ui";
import { callable, definePlugin } from "@decky/api";
import { useSyncExternalStore } from "react";
import { FaSun } from "react-icons/fa";
import { BrightnessController } from "./controller";
import type { BackendState, DisplayAPI, SettingsState } from "./types";

const getState = callable<[], BackendState>("get_state");
const saveMinimum = callable<[value: number], SettingsState>("save_minimum");

function percentage(value: number | null): string {
  return value === null ? "尚未取得" : `${(value * 100).toFixed(2)}%`;
}

function Content({ controller }: { controller: BrightnessController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const allowed = state.connected && state.backend?.environment.allowed === true;
  const canAdjust = allowed && state.manualConfirmed && state.minimum !== null;
  const value = state.requested ?? state.current ?? state.minimum ?? 0;
  const reason = state.backend?.environment.reason;

  return <>
    <PanelSection title="最低可接受亮度">
      <PanelSectionRow>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          当前亮度：{percentage(state.current)}<br />
          已保存下限：{state.minimum === null ? "未设置" : percentage(state.minimum)}
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          {state.minimum === null
            ? "先关闭系统自适应，再用系统亮度调节找到你可接受的最低位置，然后保存。"
            : "调整下限时，请先用系统调节到确认可接受的位置，再重新保存。"}
          {state.current === null && " 尚未收到亮度回报时，请先在系统中略微调亮，再调到需要的位置。"}
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={!allowed || state.current === null || state.busy}
          onClick={() => void controller.saveCurrentMinimum()}>
          将当前亮度保存为下限
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
    <PanelSection title="插件内调光">
      <PanelSectionRow>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          本版本仅限制插件内的调节。请关闭系统自适应，并通过这里调光。
          系统滑块和亮度快捷键仍可能低于下限。
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField label="我已关闭系统自适应" checked={state.manualConfirmed}
          disabled={!allowed} onChange={value => controller.confirmManual(value)} />
      </PanelSectionRow>
      {state.minimum !== null && state.minimum < 1 && <PanelSectionRow>
        <SliderField label="调节亮度" min={state.minimum * 100} max={100} step={0.1}
          value={Math.max(state.minimum * 100, Math.min(100, value * 100))}
          showValue={false} disabled={!canAdjust}
          onChange={value => controller.setBrightness(value / 100)} />
      </PanelSectionRow>}
      {state.minimum === 1 && <PanelSectionRow>
        <div style={{ fontSize: 12 }}>下限已设为最大亮度，没有可调范围。</div>
      </PanelSectionRow>}
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={!canAdjust || state.busy}
          onClick={() => { if (state.minimum !== null) controller.setBrightness(state.minimum); }}>
          回到最低亮度
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <div role="status" style={{ fontSize: 12, lineHeight: 1.6 }}>
          {reason || state.error || state.backend?.settings_error ||
            (state.busy ? "正在处理，等待系统确认…" : state.message) || "仅管理游戏模式内置屏幕。"}
          {state.current !== null && state.minimum !== null && state.current < state.minimum &&
            <div style={{ color: "#ffb86b" }}>当前亮度低于已保存下限，请关闭自适应并点击“回到最低亮度”。</div>}
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={state.busy} onClick={() => void controller.refresh()}>
          重新检查设备状态
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
    <PanelSection title="兼容性">
      <PanelSectionRow>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          系统自适应下限：未验证，未开放。<br />
          SDR / HDR / 刷新率：待真机验证。<br />
          {state.backend && <>设备：{state.backend.environment.model}；SteamOS：{state.backend.environment.steamos_version}<br /></>}
          保存的百分比是系统控制值，界面显示精度不影响实际保存值。
        </div>
      </PanelSectionRow>
    </PanelSection>
  </>;
}

export default definePlugin(() => {
  const host = window as unknown as { SteamClient?: { System?: { Display?: DisplayAPI } } };
  const controller = new BrightnessController(host.SteamClient?.System?.Display, { getState, saveMinimum });
  void controller.start();
  return {
    name: "亮度下限",
    titleView: <div className={staticClasses.Title}>亮度下限</div>,
    content: <Content controller={controller} />,
    icon: <FaSun />,
    onDismount() { controller.dispose(); },
  };
});
