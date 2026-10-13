import { fail, ok, type ApiResult } from "../core/result";
import { createSession, clearSession, DEMO_ACCOUNT, writeSession } from "../core/session";
import type { StaffSession } from "../core/types";
import { currentSession, noteSessionPersistWarning, sessionStoreBackend, setSession } from "./store";

export interface LoginInput {
  username: string;
  password: string;
}

const ACCOUNT_MAX = { username: 64, password: 128 };

async function settle<T>(value: T, ms = 160): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}

export async function staffLogin(input: LoginInput): Promise<ApiResult<StaffSession>> {
  const username = (input.username ?? "").trim();
  const password = input.password ?? "";
  const errors: Array<{ field: string; message: string }> = [];
  if (!username) errors.push({ field: "username", message: "账号不能为空" });
  else if ([...username].length > ACCOUNT_MAX.username) errors.push({ field: "username", message: `账号不超过 ${ACCOUNT_MAX.username} 字` });
  if (!password) errors.push({ field: "password", message: "密码不能为空" });
  else if ([...password].length > ACCOUNT_MAX.password) errors.push({ field: "password", message: `密码不超过 ${ACCOUNT_MAX.password} 字` });
  if (errors.length) {
    return settle(fail("VALIDATION_ERROR", "请填写账号与密码。", { fieldErrors: errors }));
  }
  if (username !== DEMO_ACCOUNT.username || password !== DEMO_ACCOUNT.password) {
    return settle(fail("AUTH_REQUIRED", "账号或密码不正确，请使用登录页说明的本地演示账号。"));
  }
  const session = createSession(DEMO_ACCOUNT.username, DEMO_ACCOUNT.nickname, DEMO_ACCOUNT.userId);
  const saved = writeSession(session, sessionStoreBackend());
  setSession(session);
  noteSessionPersistWarning(saved ? null : "本标签无法保存模拟会话，刷新后需要重新登录。");
  return settle(ok(session));
}

export async function getMe(): Promise<ApiResult<StaffSession>> {
  const session = currentSession();
  if (!session) return fail("AUTH_REQUIRED", "未登录或模拟会话已过期。");
  return settle(ok(session));
}

export async function logout(): Promise<ApiResult<{ loggedOut: true }>> {
  clearSession(sessionStoreBackend());
  setSession(null);
  return settle(ok({ loggedOut: true as const }));
}
