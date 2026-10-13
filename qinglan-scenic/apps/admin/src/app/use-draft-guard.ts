import { onBeforeUnmount } from "vue";
import { askConfirm, registerUnsavedGuard } from "./state";

/** 页面离开与局部关闭使用同一份草稿判定，卸载时自动释放守卫。 */
export function useDraftGuard(isDirty: () => boolean, message: string, isBusy: () => boolean = () => false) {
  const unregister = registerUnsavedGuard(() => isBusy() ? "操作正在保存，请等待完成。" : isDirty() ? message : null);
  onBeforeUnmount(unregister);
  let confirming = false;
  return async function discard(): Promise<boolean> {
    if (isBusy() || confirming) return false;
    if (!isDirty()) return true;
    confirming = true;
    try {
      return await askConfirm({ title: "有未保存的修改", message, confirmText: "放弃修改", danger: true });
    } finally {
      confirming = false;
    }
  };
}
