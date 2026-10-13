import type { StaffSession } from "./types";
import { SESSION_KEY, resolveSessionStorage, resolveStorage, type StorageLike } from "./storage";

export const SESSION_HOURS = 12;
export const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;
export const DEMO_ACCOUNT = {
  username: "admin_demo",
  password: "AdminDemo123!",
  nickname: "演示值班员",
  userId: "staff-demo",
};

export function readSession(backend: StorageLike | null = resolveSessionStorage()): StaffSession | null {
  if (!backend) return null;
  let raw: string | null = null;
  try {
    raw = backend.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StaffSession;
    if (!parsed || parsed.demo !== true || parsed.userId !== DEMO_ACCOUNT.userId || parsed.username !== DEMO_ACCOUNT.username ||
        typeof parsed.nickname !== "string" || !Number.isFinite(parsed.startedAt) || !Number.isFinite(parsed.expiresAt) ||
        parsed.startedAt > Date.now() || parsed.expiresAt - parsed.startedAt !== SESSION_MS || parsed.expiresAt <= Date.now()) {
      backend.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** 会话写入真实到期时间（12 个真实小时）；不保存密码。 */
export function createSession(username: string, nickname: string, userId: string, now = Date.now()): StaffSession {
  return {
    userId,
    username,
    nickname,
    startedAt: now,
    expiresAt: now + SESSION_MS,
    demo: true,
  };
}

export function writeSession(session: StaffSession, backend: StorageLike | null = resolveSessionStorage()): boolean {
  if (!backend) return false;
  try {
    backend.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(backend: StorageLike | null = resolveSessionStorage()): void {
  if (!backend) return;
  try {
    backend.removeItem(SESSION_KEY);
  } catch {
    /* 忽略 */
  }
}

export function sessionExpiredMessage(hours = SESSION_HOURS): string {
  return `模拟会话已超过 ${hours} 小时有效期，请重新登录；已保存的业务数据不会丢失。`;
}
