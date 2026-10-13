// Native-ready boundary. UI and domain code use uni APIs, never browser globals.
export function navigate(page: string, query = "") {
  uni.navigateTo({ url: `/pages/${page}/index${query ? "?" + query : ""}` });
}
export function home(page = "home") {
  uni.reLaunch({ url: `/pages/${page}/index` });
}
export function back() {
  if (getCurrentPages().length > 1) uni.navigateBack();
  else home();
}
export function notify(title: string) {
  uni.showToast({ title, icon: "none" });
}
export function choosePhoto(): Promise<string> {
  return new Promise((resolve, reject) =>
    uni.chooseImage({
      count: 1,
      success: (r) => resolve(r.tempFilePaths[0]),
      fail: reject,
    }),
  );
}

// #ifdef H5
// uni renders wrapper elements on H5; pass names through to native form controls.
export function enhanceH5Accessibility() {
  const update = () => {
    document
      .querySelectorAll<HTMLElement>(
        "uni-input[aria-label],uni-textarea[aria-label]",
      )
      .forEach((host) => {
        const input = host.querySelector("input,textarea");
        if (input)
          input.setAttribute(
            "aria-label",
            host.getAttribute("aria-label") || "",
          );
      });
    document
      .querySelectorAll<HTMLElement>('uni-button[role="button"]')
      .forEach((button) => {
        button.tabIndex = button.hasAttribute("disabled") ? -1 : 0;
      });
  };
  update();
  const observer = new MutationObserver(update);
  observer.observe(document.body, { childList: true, subtree: true });
  const keyboard = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "UNI-BUTTON" && ["Enter", " "].includes(e.key)) {
      e.preventDefault();
      el.click();
    }
  };
  document.addEventListener("keydown", keyboard);
  return () => {
    observer.disconnect();
    document.removeEventListener("keydown", keyboard);
  };
}
// #endif
