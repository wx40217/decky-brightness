export type Locale = "zh-CN" | "en";

// Chinese source strings are message IDs, including messages from the backend.
// Translate at the UI boundary so language selection cannot change control logic.
export const english = {
  "亮度下限": "Brightness Floor",
  "尚未取得": "Unavailable",
  "当前亮度": "Current brightness",
  "下限": "Minimum",
  " · 默认": " · Default",
  "自适应：": "Adaptive: ",
  "读取中": "Reading",
  "开启": "On",
  "关闭": "Off",
  "亮度": "Brightness",
  "下限已设为最大亮度。": "The minimum is set to maximum brightness.",
  "回到最低亮度": "Return to minimum",
  "将当前亮度设为下限": "Save current as minimum",
  "重新读取状态": "Refresh status",
  "下限仅作用于插件内调光。": "The minimum applies only to this plugin's controls.",
  "请关闭系统自适应后调光。": "Turn off system adaptive brightness to adjust.",
  "正在读取系统自适应状态…": "Reading system adaptive brightness…",
  "尚未取得亮度，请在系统中略微调亮。": "Brightness is unavailable. Adjust the system brightness slightly.",
  "正在调节…": "Adjusting…",
  "当前亮度低于下限，可点击“回到最低亮度”。": "Brightness is below the minimum. Select Return to minimum.",
  "亮度值无效，应在 0 到 1 之间。": "Invalid brightness; expected a value between 0 and 1.",
  "插件已卸载。": "The plugin has been unloaded.",
  "后端响应超时，请重新检查状态。": "The backend timed out. Refresh status.",
  "后端操作失败，请重试。": "The backend operation failed. Try again.",
  "Steam 亮度接口不可用，无法调光。": "Steam's brightness API is unavailable. Brightness control is disabled.",
  "亮度监听接口不兼容。": "The brightness notification API is incompatible.",
  "无法监听系统亮度，亮度控制已停用。": "Cannot monitor system brightness. Brightness control is disabled.",
  "系统返回了无法识别的亮度值，无法确认当前亮度。": "Steam returned an invalid brightness value. Current brightness cannot be confirmed.",
  "系统亮度回报无效。": "Steam returned an invalid brightness value.",
  "无法读取配置或设备状态，请重试。": "Cannot read settings or device status. Try again.",
  "系统自适应已开启，插件调光已暂停。": "System adaptive brightness is on. Plugin brightness control is paused.",
  "无法确认系统自适应状态，插件调光已暂停。": "Cannot confirm the adaptive brightness state. Plugin brightness control is paused.",
  "系统设置回报无效，请重新检查状态。": "Steam returned invalid system settings. Refresh status.",
  "系统自适应读取接口不可用。": "The adaptive brightness status API is unavailable.",
  "读取系统自适应状态超时，请重新检查状态。": "Reading adaptive brightness timed out. Refresh status.",
  "无法确认设备状态。": "Cannot confirm device status.",
  "尚未取得当前亮度。请先在系统中略微调亮，再调到确认可接受的位置。": "Current brightness is unavailable. Adjust the system brightness slightly, then choose a level you have checked.",
  "当前亮度已失效，请重新调整系统亮度。": "Current brightness is no longer valid. Adjust the system brightness again.",
  "保存结果不一致，未确认下限保存成功。": "The saved value does not match. Saving the minimum could not be confirmed.",
  "下限已保存。": "Minimum saved.",
  "下限保存失败，请重试。": "Failed to save the minimum. Try again.",
  "正在保存下限，请稍候。": "Saving the minimum. Please wait.",
  "当前无法控制内置屏幕亮度。": "Cannot control the internal display brightness right now.",
  "尚未取得当前亮度，请先重新检查状态。": "Current brightness is unavailable. Refresh status first.",
  "亮度值无效。": "Invalid brightness value.",
  "微调步长无效。": "Invalid fine adjustment step.",
  "尚未取得当前亮度，无法微调。": "Current brightness is unavailable. Fine adjustment is disabled.",
  "系统回报已处于目标亮度。": "Steam reports that brightness is already at the target.",
  "系统已确认亮度。": "Steam confirmed the brightness.",
  "设置亮度失败。": "Failed to set brightness.",
  "未收到目标亮度的系统确认，请检查当前亮度后重试。": "Steam did not confirm the target brightness. Check current brightness and try again.",
  "Steam 拒绝了亮度设置，请重试。": "Steam rejected the brightness request. Try again.",
  "Steam 亮度设置失败，请重试。": "Steam failed to set brightness. Try again.",
  "系统设置格式不兼容。": "The system settings format is incompatible.",
  "系统设置消息不完整。": "The system settings message is incomplete.",
  "系统设置整数无效。": "The system settings message contains an invalid integer.",
  "系统设置字段无效。": "The system settings message contains an invalid field.",
  "系统自适应字段格式不兼容。": "The adaptive brightness field format is incompatible.",
  "系统自适应状态无效。": "The adaptive brightness state is invalid.",
  "系统设置字段格式不兼容。": "The system settings field format is incompatible.",
  "无法读取已保存的下限，暂用默认 44%。原文件已保留，请重新校准并保存。": "Cannot read the saved minimum. Using the default 44% for now. The original file is preserved; recalibrate and save.",
  "仅支持 Steam Deck OLED 的 SteamOS 游戏模式。": "Only SteamOS Gaming Mode on Steam Deck OLED is supported.",
  "未识别为 Steam Deck OLED，亮度控制已停用。": "Steam Deck OLED was not detected. Brightness control is disabled.",
  "未检测到游戏模式，亮度控制已停用。": "Gaming Mode was not detected. Brightness control is disabled.",
  "检测到外接显示器，插件调光已暂停。": "An external display is connected. Plugin brightness control is paused.",
  "内置屏幕未启用或无法确认，插件调光已暂停。": "The internal display is inactive or unavailable. Plugin brightness control is paused.",
} as const;

export function translate(message: string, locale: Locale): string {
  return locale === "en" && Object.prototype.hasOwnProperty.call(english, message) ? english[message as keyof typeof english] : message;
}

function supportedLocale(language: string): Locale {
  return /^(?:s(?:implified)?chinese|tchinese|zh(?:[-_]|$))/i.test(language) ? "zh-CN" : "en";
}

export function resolveLocale(steamLanguage: unknown, browserLanguages: readonly string[] = []): Locale {
  // An unsupported Steam language falls back to English, not the browser language.
  if (typeof steamLanguage === "string" && steamLanguage.trim()) return supportedLocale(steamLanguage.trim());
  return supportedLocale(browserLanguages.find(language => language.trim())?.trim() ?? "en");
}

export interface LanguageAPI {
  GetCurrentLanguage(): unknown;
}

export class Localization {
  private locale: Locale;
  private subscribers = new Set<() => void>();
  private cancel: (() => void) | null = null;
  private disposed = false;

  constructor(private browserLanguages: readonly string[] = [], private timeout = 1000) {
    this.locale = resolveLocale(undefined, browserLanguages);
  }

  getSnapshot = (): Locale => this.locale;
  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  };

  async initialize(settings: LanguageAPI | undefined): Promise<void> {
    if (this.disposed || typeof settings?.GetCurrentLanguage !== "function") return;
    this.cancel?.();
    await new Promise<void>(resolve => {
      let settled = false;
      const finish = (language?: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.cancel = null;
        const locale = resolveLocale(language, this.browserLanguages);
        if (!this.disposed && locale !== this.locale) {
          this.locale = locale;
          this.subscribers.forEach(callback => callback());
        }
        resolve();
      };
      const timer = setTimeout(() => finish(), this.timeout);
      this.cancel = () => finish();
      Promise.resolve().then(() => settings.GetCurrentLanguage()).then(finish, () => finish());
    });
  }

  dispose(): void {
    this.disposed = true;
    this.cancel?.();
    this.subscribers.clear();
  }
}
