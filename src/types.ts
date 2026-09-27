export interface SettingsState {
  minimum_brightness: number | null;
  settings_error: string | null;
  minimum_is_default: boolean;
}

export interface EnvironmentState {
  allowed: boolean;
  reason: string;
  model: string;
  steamos_version: string;
  kernel: string;
}

export interface BackendState extends SettingsState {
  environment: EnvironmentState;
}

export interface DisplayAPI {
  SetBrightness(value: number): unknown;
  RegisterForBrightnessChanges(callback: (data: { flBrightness: number }) => void): {
    unregister(): void;
  };
}

export type SystemSettingsData = ArrayBuffer | ArrayBufferView | string;

export interface SystemSettingsAPI {
  RegisterForSettingsChanges(callback: (data: SystemSettingsData) => void): {
    unregister(): void;
  };
}

export interface BackendAPI {
  getState(): Promise<BackendState>;
  saveMinimum(value: number): Promise<SettingsState>;
}
