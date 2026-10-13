import assert from "node:assert/strict";
const base = "http://127.0.0.1:9787/api/v1";
async function call(user, path, body, expected = 200) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(user
        ? { Authorization: "Bearer " + user.token, "X-Run-Id": user.runId }
        : {}),
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  assert.equal(r.status, expected, JSON.stringify(v));
  return v.data;
}
const admin = await call(null, "/auth/login", {
    username: "admin01",
    password: "123456",
  }),
  staff = await call(null, "/auth/login", {
    username: "staff01",
    password: "123456",
  }),
  visitor = await call(null, "/auth/login", {
    username: "visitor01",
    password: "123456",
  });
const suffix = Date.now().toString(36),
  newUser = await call(admin, "/admin/people", {
    username: "accept_" + suffix,
    name: "验收账号",
    role: "visitor",
  });
let newAuth = await call(null, "/auth/login", {
  username: "accept_" + suffix,
  password: newUser.temporaryPassword,
});
assert.equal(newAuth.user.mustChangePassword, true);
await call(newAuth, "/orders", undefined, 403);
newAuth = {
  ...(await call(newAuth, "/auth/password", { password: "Acceptance8!" })),
  runId: admin.runId,
};
assert.equal(newAuth.user.mustChangePassword, false);
const ctrl = await call(admin, "/admin/chat-control");
const old = ctrl.controls.find((r) => r.id === "lobby");
await call(admin, "/admin/chat-control/rooms", {
  id: "lobby",
  expectedVersion: old?.version || 0,
  closed: true,
  reason: "验收关闭",
});
await call(visitor, "/chat/messages", { roomId: "lobby", text: "应拒绝" }, 403);
assert(
  !(await call(visitor, "/chat/rooms")).items.some((r) => r.id === "lobby"),
);
assert.equal(
  (await call(visitor, "/chat/messages?roomId=lobby")).items.length,
  0,
);
await call(admin, "/admin/chat-control/rooms", {
  id: "lobby",
  expectedVersion: (old?.version || 0) + 1,
  closed: false,
});
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG7sAAAAASUVORK5CYII=",
  "base64",
);
const uploaded = await fetch(base + "/attachments", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + staff.token,
    "X-Run-Id": staff.runId,
    "Content-Type": "image/png",
  },
  body: png,
});
assert.equal(uploaded.status, 201);
const photo = (await uploaded.json()).data;
const req = await call(staff, "/facility-requests", {
  kind: "closure",
  facilityId: "creek",
  reason: "验收：护栏破损",
  photoIds: [photo.id],
});
const approved = await call(
  admin,
  "/facility-requests/" + req.id + "/approve",
  { expectedVersion: 1, reason: "现场核实", createWorkOrder: true },
);
assert.equal(
  (await call(null, "/public/snapshot")).points.creek.availability,
  "closed",
);
let w = (await call(admin, "/workflow/workspace")).workOrders.find(
  (w) => w.id === approved.workOrderId,
);
async function act(user, action, extra = {}) {
  w = await call(user, "/work-orders/" + w.id + "/" + action, {
    expectedVersion: w.version,
    reason: "验收流程说明",
    ...extra,
  });
}
await act(admin, "dispatch", { assigneeId: staff.user.id });
await act(staff, "accept");
await act(staff, "start");
await act(admin, "escalate");
assert(
  (await call(null, "/screens/ops")).public.announcements.some(
    (n) => n.id === "work-emergency-" + w.id,
  ),
);
assert(
  !(await call(null, "/public/snapshot")).announcements.some(
    (n) => n.id === "work-emergency-" + w.id,
  ),
);
await act(staff, "block");
assert.equal(w.status, "suspended");
await act(admin, "resources");
await act(admin, "resume");
await act(staff, "submit");
await act(admin, "reject");
await act(staff, "submit");
await act(admin, "approve");
assert.equal(w.status, "completed");
assert(
  !(await call(null, "/screens/ops")).public.announcements.some(
    (n) => n.id === "work-emergency-" + w.id,
  ),
);
assert.equal(
  (await call(null, "/public/snapshot")).points.creek.availability,
  "closed",
);
await call(admin, "/admin/facilities/creek", {
  availability: "open",
  reason: "验收后管理员确认恢复",
});
assert.equal(
  (await call(null, "/public/snapshot")).points.creek.availability,
  "open",
);
const readPhoto = await fetch(base + "/attachments/" + photo.id, {
  headers: { Authorization: "Bearer " + admin.token, "X-Run-Id": admin.runId },
});
assert.equal(readPhoto.status, 200);
assert.equal((await readPhoto.arrayBuffer()).byteLength, png.length);
const target = (await call(admin, "/admin/people")).items.find(
  (p) => p.id === newUser.id,
);
await call(admin, "/admin/people/" + newUser.id + "/archive", {
  expectedVersion: target.version,
});
await call(newAuth, "/orders", undefined, 401);
console.log(
  "通过：首次改密、账号归档、聊天室关闭、照片上传、设施关闭与恢复、工单挂起与验收驳回。",
);
