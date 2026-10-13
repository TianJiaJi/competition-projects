import { ROLE } from "@scene/demo";
import {
  identityKey,
  matches,
  message,
  parseDemo,
  stageUrl,
  WORKBENCH_ORIGIN,
  type Context,
} from "@scene/demo/bridge";
export const demo = new URLSearchParams(location.search).has("caseId")
  ? { enabled: false, context: undefined, error: undefined, requestId: "" }
  : parseDemo(location.search, __TERMINAL__);
export function savedIdentity() {
  if (!demo.context || __TERMINAL__ !== "staff") return null;
  try {
    return sessionStorage.getItem(identityKey(demo.context.run)) === ROLE
      ? ROLE
      : null;
  } catch {
    return null;
  }
}
export function saveIdentity(identity: string | null) {
  if (!demo.context || __TERMINAL__ !== "staff") return;
  try {
    if (identity) sessionStorage.setItem(identityKey(demo.context.run), ROLE);
    else sessionStorage.removeItem(identityKey(demo.context.run));
  } catch {
    /* Current page remains usable if session storage is disabled. */
  }
}
export function connectDemo(isVisible: () => boolean) {
  let requestId = demo.requestId;
  const pageId = crypto.randomUUID();
  const announce = () => {
    if (demo.context && window.opener && isVisible())
      window.opener.postMessage(
        {
          ...message(
            new URLSearchParams(location.search).has("resetAck")
              ? "reset-done"
              : "ready",
            demo.context,
            requestId,
          ),
          pageId,
        },
        WORKBENCH_ORIGIN,
      );
  };
  const listener = (event: MessageEvent) => {
    if (
      !demo.context ||
      event.origin !== WORKBENCH_ORIGIN ||
      event.source !== window.opener ||
      !matches(event.data, demo.context)
    )
      return;
    if (event.data.type === "probe") {
      requestId = event.data.requestId;
      announce();
    }
    if (event.data.type === "reset") {
      const next = event.data.next as Context | undefined;
      if (
        !next ||
        !parseDemo(
          new URL(stageUrl(next, event.data.requestId)).search,
          __TERMINAL__,
        ).context
      )
        return;
      if (event.data.clearIdentity) {
        saveIdentity(null);
        try {
          sessionStorage.removeItem(identityKey(next.run));
        } catch {}
      }
      location.replace(stageUrl(next, event.data.requestId) + "&resetAck=1");
    }
  };
  window.addEventListener("message", listener);
  announce();
  return {
    announce,
    dispose: () => window.removeEventListener("message", listener),
  };
}
