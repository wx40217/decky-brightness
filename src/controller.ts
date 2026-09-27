import type { BackendAPI, BackendState, DisplayAPI, SystemSettingsAPI, SystemSettingsData } from "./types";
import { adaptiveBrightnessUpdate } from "./system-settings";

// Smaller than a 0.01 percentage point adjustment; allows native float rounding.
const confirmationTolerance = 0.00002;

export function brightness(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("亮度值无效，应在 0 到 1 之间。");
  }
  return value;
}

export function clampBrightness(value: unknown, minimum: number): number {
  return Math.max(brightness(value), brightness(minimum));
}

function nativeFloorRequest(target: number, minimum: number): number {
  // Steam serializes brightness as float32. E.g. 0.44 rounds just below 0.44;
  // use the next float only when rounding would cross the saved floor.
  const rounded = Math.fround(target);
  if (rounded >= minimum) return target;
  const value = new Float32Array([rounded]);
  const bits = new Uint32Array(value.buffer);
  bits[0]++;
  return value[0];
}

export interface State {
  current: number | null;
  minimum: number | null;
  requested: number | null;
  adaptiveEnabled: boolean | null;
  adaptiveError: string | null;
  connected: boolean;
  busy: boolean;
  backend: BackendState | null;
  error: string | null;
  message: string | null;
}

export class BrightnessController {
  private state: State = {
    current: null, minimum: null, requested: null, adaptiveEnabled: null, adaptiveError: null,
    connected: false, busy: false, backend: null, error: null, message: null,
  };
  private subscribers = new Set<() => void>();
  private registration: { unregister(): void } | null = null;
  private settingsRegistration: { unregister(): void } | null = null;
  private settingsRevision = 0;
  private poll: ReturnType<typeof setInterval> | null = null;
  private confirmation: { target: number; minimum: number; resolve: () => void; reject: (e: Error) => void } | null = null;
  private confirmationTimer: ReturnType<typeof setTimeout> | null = null;
  private queued: number | null = null;
  private disposed = false;
  private running = false;
  private refreshing: Promise<boolean> | null = null;
  private deadlines = new Set<() => void>();

  constructor(private display: DisplayAPI | undefined, private api: BackendAPI,
              private system: SystemSettingsAPI | undefined,
              private timeout = 2500, private pollInterval = 5000, private rpcTimeout = 8000) {}

  getSnapshot = (): State => this.state;

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  };

  private update(patch: Partial<State>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.subscribers.forEach(callback => callback());
  }

  private bounded<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (error: Error | null, value?: T): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.deadlines.delete(cancel);
        if (error) reject(error); else resolve(value as T);
      };
      const cancel = (): void => finish(new Error("插件已卸载。"));
      const timer = setTimeout(() => finish(new Error("后端响应超时，请重新检查状态。")), this.rpcTimeout);
      this.deadlines.add(cancel);
      operation.then(value => finish(null, value), () => finish(new Error("后端操作失败，请重试。")));
    });
  }

  async start(): Promise<void> {
    if (this.disposed || this.registration) return;
    if (!this.display || typeof this.display.SetBrightness !== "function" ||
        typeof this.display.RegisterForBrightnessChanges !== "function") {
      this.update({ error: "Steam 亮度接口不可用，无法调光。" });
      return;
    }
    try {
      const registration = this.display.RegisterForBrightnessChanges(data => this.observe(data));
      if (!registration || typeof registration.unregister !== "function") {
        throw new Error("亮度监听接口不兼容。");
      }
      this.registration = registration;
      this.update({ connected: true });
    } catch {
      this.update({ error: "无法监听系统亮度，亮度控制已停用。" });
      return;
    }
    this.watchSettings();
    await this.refresh();
    if (!this.disposed) this.poll = setInterval(() => { void this.refresh(); }, this.pollInterval);
  }

  private observe(data: { flBrightness: number }): void {
    if (this.disposed) return;
    let current: number;
    try { current = brightness(data?.flBrightness); }
    catch {
      this.update({ current: null, error: "系统返回了无法识别的亮度值，无法确认当前亮度。" });
      this.confirmation?.reject(new Error("系统亮度回报无效。"));
      return;
    }
    this.update({ current });
    const pending = this.confirmation;
    if (pending && current >= pending.minimum &&
        Math.abs(current - pending.target) <= confirmationTolerance) {
      pending.resolve();
    }
    // Deliberately never correct events after the fact: adaptive support is unverified.
  }

  refresh(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.refreshing) return this.refreshing;
    if (!this.settingsRegistration) this.watchSettings();
    this.refreshing = Promise.all([this.readBackend(), this.readAdaptive()])
      .then(([allowed, adaptiveOff]) => !this.disposed && allowed && adaptiveOff && this.state.adaptiveEnabled === false)
      .finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async readBackend(): Promise<boolean> {
    try {
      const backend = await this.bounded(this.api.getState());
      if (this.disposed) return false;
      const minimum = backend.minimum_brightness === null ? null : brightness(backend.minimum_brightness);
      const wasAllowed = this.state.backend?.environment.allowed;
      this.update({ backend, minimum, ...(this.state.backend === null ? { error: null } : {}) });
      if (!backend.environment.allowed) {
        this.queued = null;
        this.update({ current: null });
        this.confirmation?.reject(new Error(backend.environment.reason));
      } else if (wasAllowed === false) {
        // A value observed while docked/asleep is not a fresh internal-panel reading.
        this.update({ current: null });
      }
      return !this.disposed && backend.environment.allowed;
    } catch {
      this.queued = null;
      this.update({ backend: null, error: "无法读取配置或设备状态，请重试。" });
      return false;
    }
  }

  private adaptiveState(value: boolean | null, error: string | null = null): void {
    this.settingsRevision++;
    this.update({ adaptiveEnabled: value, adaptiveError: error });
    if (value !== false) {
      this.queued = null;
      this.update({ message: null });
      this.confirmation?.reject(new Error(this.adaptiveReason()));
    } else if (this.state.error === "系统自适应已开启，插件调光已暂停。" ||
               this.state.error === "无法确认系统自适应状态，插件调光已暂停。") {
      this.update({ error: null });
    }
  }

  private adaptiveReason(): string {
    return this.state.adaptiveEnabled === true ? "系统自适应已开启，插件调光已暂停。" :
      "无法确认系统自适应状态，插件调光已暂停。";
  }

  private watchSettings(): void {
    if (this.disposed || this.settingsRegistration) return;
    try {
      if (typeof this.system?.RegisterForSettingsChanges !== "function") throw new Error();
      const registration = this.system.RegisterForSettingsChanges(data => {
        if (this.disposed) return;
        try {
          const value = adaptiveBrightnessUpdate(data);
          if (value !== null) this.adaptiveState(value);
        } catch { this.adaptiveState(null, "系统设置回报无效，请重新检查状态。"); }
      });
      if (!registration || typeof registration.unregister !== "function") throw new Error();
      this.settingsRegistration = registration;
    } catch { this.adaptiveState(null, "系统自适应读取接口不可用。"); }
  }

  private readAdaptive(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return new Promise(resolve => {
      let registration: { unregister(): void } | undefined;
      let settled = false;
      const finish = (error: string | null, value: boolean | null = null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.deadlines.delete(cancel);
        try { registration?.unregister(); } catch { /* Steam may be shutting down. */ }
        this.adaptiveState(value, error);
        resolve(!this.disposed && !error && value === false);
      };
      const cancel = (): void => finish("插件已卸载。");
      const timer = setTimeout(() => finish("读取系统自适应状态超时，请重新检查状态。"), Math.min(this.rpcTimeout, 1000));
      this.deadlines.add(cancel);
      try {
        if (!this.settingsRegistration || typeof this.system?.RegisterForSettingsChanges !== "function") throw new Error();
        registration = this.system.RegisterForSettingsChanges((data: SystemSettingsData) => {
          try {
            const value = adaptiveBrightnessUpdate(data);
            if (value !== null) {
              const revision = this.settingsRevision;
              queueMicrotask(() => revision === this.settingsRevision ? finish(null, value) :
                finish(this.state.adaptiveError, this.state.adaptiveEnabled));
            }
          } catch { finish("系统设置回报无效，请重新检查状态。"); }
        });
        if (!registration || typeof registration.unregister !== "function") throw new Error();
        if (settled) registration.unregister();
      } catch { finish("系统自适应读取接口不可用。"); }
    });
  }

  private blockedReason(): string {
    return this.state.backend?.environment.reason ||
      (this.state.adaptiveEnabled !== false ? this.adaptiveReason() : this.state.error) || "无法确认设备状态。";
  }

  async saveCurrentMinimum(): Promise<void> {
    if (this.disposed || this.state.busy) return;
    const current = this.state.current;
    if (current === null) {
      this.update({ error: "尚未取得当前亮度。请先在系统中略微调亮，再调到确认可接受的位置。" });
      return;
    }
    this.update({ busy: true, error: null, message: null });
    try {
      if (!await this.refresh()) throw new Error(this.blockedReason());
      if (this.disposed) return;
      // Use the latest reported value, never a rounded percentage or slider position.
      const latest = this.state.current;
      if (latest === null) throw new Error("当前亮度已失效，请重新调整系统亮度。" );
      const saved = await this.bounded(this.api.saveMinimum(latest));
      if (saved.minimum_brightness === null || brightness(saved.minimum_brightness) !== latest) {
        throw new Error("保存结果不一致，未确认下限保存成功。");
      }
      this.update({ minimum: saved.minimum_brightness, message: "下限已保存。", backend:
        this.state.backend ? { ...this.state.backend, ...saved } : null });
    } catch (error) { this.update({ error: error instanceof Error ? error.message : "下限保存失败，请重试。" }); }
    finally { this.update({ busy: false }); }
  }

  setBrightness(value: number): void {
    if (this.disposed) return;
    try {
      if (this.state.busy && !this.running) throw new Error("正在保存下限，请稍候。");
      if (!this.state.connected || !this.state.backend?.environment.allowed) throw new Error("当前无法控制内置屏幕亮度。");
      if (this.state.adaptiveEnabled !== false) throw new Error(this.adaptiveReason());
      if (this.state.current === null) throw new Error("尚未取得当前亮度，请先重新检查状态。" );
      const target = clampBrightness(value, this.state.minimum ?? 0);
      this.queued = target;
      this.update({ requested: target, error: null, message: null });
      if (!this.running) void this.drain();
    } catch (error) { this.update({ error: error instanceof Error ? error.message : "亮度值无效。" }); }
  }

  adjustBrightness(delta: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(delta)) {
      this.update({ error: "微调步长无效。" });
      return;
    }
    const current = this.state.requested ?? this.state.current;
    if (current === null) {
      this.update({ error: "尚未取得当前亮度，无法微调。" });
      return;
    }
    this.setBrightness(Math.max(0, Math.min(1, current + delta)));
  }

  private async drain(): Promise<void> {
    this.running = true;
    this.update({ busy: true });
    try {
      while (this.queued !== null && !this.disposed) {
        if (!await this.refresh()) throw new Error(this.blockedReason());
        if (this.disposed || this.queued === null || this.state.adaptiveEnabled !== false) break;
        const minimum = this.state.minimum ?? 0;
        const target = nativeFloorRequest(clampBrightness(this.queued, minimum), minimum);
        this.queued = null;
        if (this.state.current === target) {
          this.update({ message: "系统回报已处于目标亮度。" });
          continue;
        }
        await this.writeAndConfirm(target, minimum);
        if (this.queued === null) this.update({ message: "系统已确认亮度。" });
      }
    } catch (error) {
      this.queued = null;
      this.update({ error: error instanceof Error ? error.message : "设置亮度失败。", message: null });
    } finally {
      this.running = false;
      this.update({ busy: false, requested: null });
    }
  }

  private writeAndConfirm(target: number, minimum: number): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("插件已卸载。"));
    return new Promise<void>((resolve, reject) => {
      let observed = false;
      let accepted = false;
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        if (this.confirmationTimer) clearTimeout(this.confirmationTimer);
        this.confirmationTimer = null;
        this.confirmation = null;
        if (error) reject(error); else resolve();
      };
      this.confirmation = { target, minimum, resolve: () => {
        observed = true;
        if (accepted) finish();
      }, reject: error => finish(error) };
      this.confirmationTimer = setTimeout(() => finish(new Error("未收到目标亮度的系统确认，请检查当前亮度后重试。")), this.timeout);
      // Register before writing; some Steam versions can notify synchronously.
      try {
        Promise.resolve(this.display!.SetBrightness(target)).then(result => {
          if (result === false) finish(new Error("Steam 拒绝了亮度设置，请重试。"));
          else {
            accepted = true;
            if (observed) finish();
          }
        }, () => finish(new Error("Steam 亮度设置失败，请重试。")));
      } catch { finish(new Error("Steam 亮度设置失败，请重试。")); }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.queued = null;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    this.confirmation?.reject(new Error("插件已卸载。"));
    for (const cancel of this.deadlines) cancel();
    try { this.registration?.unregister(); } catch { /* Steam may already be shutting down. */ }
    this.registration = null;
    try { this.settingsRegistration?.unregister(); } catch { /* Steam may already be shutting down. */ }
    this.settingsRegistration = null;
    this.subscribers.clear();
  }
}
