import {sync,captureVersions} from "./store";
import {writeOnline} from "./online-write";
import { businessNow, formatDateTime } from "../core/time";
import type { AdminUser, Order } from "../core/types";
import { fail, ok, type ApiResult } from "../core/result";
import { getRun, getStore, mutate, requireStaff } from "./store";
import { matchKeyword, paginate, type ListQuery, type ListResult } from "./list";

async function settle<T>(value: T, ms = 130): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}

export interface UserQuery extends ListQuery {
  keyword?: string;
  identity?: AdminUser["identity"] | "all";
  disabled?: boolean | "all";
}

export interface UserView extends AdminUser {
  createdAtText: string;
  liveOrderCount: number;
}

function buildUserView(user: AdminUser, orders: Order[]): UserView {
  return {
    ...user,
    createdAtText: user.createdAt ? formatDateTime(Date.parse(`${user.createdAt.replace(" ", "T")}:00+08:00`)) : "—",
    liveOrderCount: orders.filter(
      (order) =>
        order.reservationStatus === "confirmed" &&
        (order.contactName === user.nickname || order.id.includes(user.id)),
    ).length,
  };
}

export async function adminListUsers(query: UserQuery = {}): Promise<ApiResult<ListResult<UserView>>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const orders = getRun().orders;
  const items = getStore()
    .global.users.filter((user) => {
      if (query.identity && query.identity !== "all" && user.identity !== query.identity) return false;
      if (typeof query.disabled === "boolean" && user.disabled !== query.disabled) return false;
      return matchKeyword(query.keyword, [user.nickname, user.id]);
    })
    .map((user) => buildUserView(user, orders))
    .sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : b.createdAt.localeCompare(a.createdAt)));
  return settle(ok(paginate(items, query)));
}

export interface UserDetail {
  user: UserView;
  orders: Array<{ id: string; type: Order["type"]; slotLabel: string; status: string }>;
}

export async function adminGetUser(id: string): Promise<ApiResult<UserDetail>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const user = getStore().global.users.find((item) => item.id === id);
  if (!user) return settle(fail("NOT_FOUND", "没有找到对应的账号。"));
  const orders = getRun().orders.filter((order) => order.contactName === user.nickname);
  return settle(
    ok({
      user: buildUserView(user, getRun().orders),
      orders: orders.map((order) => ({
        id: order.id,
        type: order.type,
        slotLabel: `${order.slotDate} ${order.slotStart}—${order.slotEnd}`,
        status: order.reservationStatus,
      })),
    }),
  );
}

export async function setUserDisabled(id: string, disabled: boolean): Promise<ApiResult<UserView>> {
 return writeOnline("setUserDisabled",[id,disabled],async id=>{const r=await adminGetUser(id);return r.ok?ok(r.data.user):r;});
}

export function userCreatedAt(createdAt: string): number {
  return Date.parse(`${createdAt.replace(" ", "T")}:00+08:00`);
}

export function businessNowForView(): number {
  return businessNow();
}
