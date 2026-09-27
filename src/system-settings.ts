import type { SystemSettingsData } from "./types";

// CMsgSystemManagerSettings, field 7: display_adaptive_brightness_enabled.
// Settings notifications may contain only changed fields; absence is not false.
export function adaptiveBrightnessUpdate(data: SystemSettingsData): boolean | null {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
  } else if (ArrayBuffer.isView(data)) {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    throw new Error("系统设置格式不兼容。");
  }
  let position = 0;
  let enabled: boolean | null = null;
  const varint = (): number => {
    let value = 0;
    for (let i = 0; i < 10; i++) {
      if (position >= bytes.length) throw new Error("系统设置消息不完整。");
      const byte = bytes[position++];
      value += (byte & 127) * 2 ** (7 * i);
      if (!(byte & 128)) return value;
    }
    throw new Error("系统设置整数无效。");
  };
  const skip = (length: number): void => {
    if (!Number.isSafeInteger(length) || length < 0 || position + length > bytes.length) {
      throw new Error("系统设置消息不完整。");
    }
    position += length;
  };
  while (position < bytes.length) {
    const tag = varint();
    if (!Number.isSafeInteger(tag) || tag < 8 || tag > 0xffffffff) throw new Error("系统设置字段无效。");
    const field = Math.floor(tag / 8), wire = tag % 8;
    if (field === 7 && wire !== 0) throw new Error("系统自适应字段格式不兼容。");
    switch (wire) {
      case 0: {
        const value = varint();
        if (field === 7) {
          if (value !== 0 && value !== 1) throw new Error("系统自适应状态无效。");
          enabled = value === 1;
        }
        break;
      }
      case 1: skip(8); break;
      case 2: skip(varint()); break;
      case 5: skip(4); break;
      default: throw new Error("系统设置字段格式不兼容。");
    }
  }
  return enabled;
}
