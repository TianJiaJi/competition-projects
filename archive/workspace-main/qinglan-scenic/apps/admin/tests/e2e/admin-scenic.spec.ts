import { expect, test, type Page } from "@playwright/test";
import { gotoPage, login } from "./helpers";
import type { ScenicSaveInput } from "../../src/services/content";

declare global {
  interface Window {
    __scenicTest?: { load?: "fail" | "throw"; save?: "throw"; delay?: number; saves?: number; profile?: Partial<ScenicSaveInput> };
    __scenicStorage?: { fail: boolean; writes: number };
  }
}

// 故障与延迟只在浏览器测试中注入，正常保存仍使用真实服务和持久化。
async function interceptScenic(page: Page): Promise<void> {
  await page.route(/\/src\/services\/content\.ts$/, route => route.fulfill({
    contentType: "application/javascript",
    body: `
      import { getScenic as read, saveScenic as save } from '/src/services/content.ts?scenic-test-original';
      export * from '/src/services/content.ts?scenic-test-original';
      export async function getScenic() {
        const state = window.__scenicTest ?? {};
        if (state.load === 'throw') throw new Error('读取异常');
        if (state.load === 'fail') return { ok: false, error: { code: 'MOCK_STORAGE_FAILED', message: '测试读取失败' } };
        const result = await read();
        return result.ok ? { ...result, data: { ...result.data, ...state.profile } } : result;
      }
      export async function saveScenic(input) {
        const state = window.__scenicTest ??= {};
        state.saves = (state.saves ?? 0) + 1;
        await new Promise(resolve => setTimeout(resolve, state.delay ?? 0));
        if (state.save === 'throw') throw new Error('保存异常');
        return save(input);
      }`,
  }));
}
async function openProfile(page: Page): Promise<void> {
  await login(page);
  await gotoPage(page, "/content/scenic", "景区资料");
}
const edit = (page: Page) => page.getByRole("button", { name: "编辑资料", exact: true });
const save = (page: Page) => page.getByRole("button", { name: "保存", exact: true });
const cancel = (page: Page) => page.getByRole("button", { name: "取消", exact: true });

test("独立草稿、无修改直接取消、有修改确认放弃并恢复焦点", async ({ page }) => {
  await openProfile(page);
  await expect(page.locator("#scenic-name")).toHaveText("青岚山境");
  await expect(page.locator(".scenic-profile input, .scenic-profile textarea")).toHaveCount(0);
  await edit(page).click();
  await expect(page.locator("#name")).toBeFocused();
  await expect(save(page)).toBeDisabled();
  await expect(page.getByText("未保存", { exact: true })).toHaveCount(0);
  await cancel(page).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(edit(page)).toBeFocused();
  await edit(page).click();
  await page.locator("#name").fill("独立的未保存草稿");
  await expect(page.getByText("未保存", { exact: true })).toBeVisible();
  await expect(page.locator("#scenic-name")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /预览/ })).toHaveCount(0);
  await cancel(page).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator("#name")).toHaveValue("独立的未保存草稿");
  await cancel(page).click();
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(page.locator("#scenic-name")).toHaveText("青岚山境");
  await edit(page).click();
  await expect(page.locator("#name")).toHaveValue("青岚山境");
});

test("十张封面可用键盘选择，服务返回的规范数据保存后可刷新复查", async ({ page }) => {
  await openProfile(page);
  await edit(page).click();
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(10);
  await radios.first().focus();
  for (let index = 1; index <= 10; index++) {
    await page.keyboard.press("ArrowRight");
    await expect(radios.nth(index % 10)).toBeChecked();
    await expect(radios.nth(index % 10)).toBeFocused();
  }
  for (let index = 0; index < 10; index++) {
    if (index > 0) await edit(page).click();
    await page.locator(".scenic-profile__cover-option").nth(index).click();
    await expect(radios.nth(index)).toBeChecked();
    const cover = await radios.nth(index).inputValue();
    await page.locator("#name").fill(`  封面保存 ${index + 1}  `);
    await save(page).click();
    await expect(page.locator("#scenic-name")).toHaveText(`封面保存 ${index + 1}`);
    await expect(page.locator(".scenic-profile__cover img")).toHaveAttribute("src", cover);
    await page.reload();
    await expect(page.locator("#scenic-name")).toHaveText(`封面保存 ${index + 1}`);
    await expect(page.locator(".scenic-profile__cover img")).toHaveAttribute("src", cover);
  }
});

test("校验按表单顺序聚焦，修正后仍可保存", async ({ page }) => {
  await openProfile(page);
  await edit(page).click();
  await page.locator("#name").fill("");
  await page.locator("#openingText").fill("");
  await page.locator("#address").fill("");
  await page.locator("#servicePhone").fill("invalid");
  await save(page).click();
  await expect(page.locator("#name")).toBeFocused();
  await expect(page.locator("#name")).toHaveAttribute("aria-invalid", "true");
  await page.locator("#name").fill("修正后的景区");
  await save(page).click();
  await expect(page.locator("#openingText")).toBeFocused();
  await page.locator("#openingText").fill("每日开放");
  await page.locator("#address").fill("景区入口");
  await page.locator("#servicePhone").fill("0571-8888 6688");
  await save(page).click();
  await expect(page.locator("#scenic-name")).toHaveText("修正后的景区");
});

test("存储失败保留草稿，保存时锁定输入与重复提交，重试仅写入一次", async ({ page }) => {
  await interceptScenic(page);
  await openProfile(page);
  await edit(page).click();
  await page.locator("#name").fill("存储恢复后的景区");
  await page.evaluate(() => {
    const state = window.__scenicStorage = { fail: true, writes: 0 };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "qinglan.admin.mock.v1") {
        state.writes++;
        if (state.fail) throw new DOMException("测试写入失败", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
    window.__scenicTest = { delay: 700 };
  });
  await save(page).click();
  await expect(page.getByRole("button", { name: "保存中", exact: true })).toBeDisabled();
  await expect(cancel(page)).toBeDisabled();
  for (const field of await page.locator(".scenic-profile input, .scenic-profile textarea").all()) await expect(field).toBeDisabled();
  await page.locator("form").evaluate(form => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await expect(page.locator(".form-error-banner")).toContainText("本地保存失败");
  await expect(page.locator(".form-error-banner")).toBeFocused();
  await expect(page.locator("#name")).toHaveValue("存储恢复后的景区");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("qinglan.admin.mock.v1")!).global.scenic.name)).toBe("青岚山境");
  expect(await page.evaluate(() => window.__scenicTest?.saves)).toBe(1);
  await page.evaluate(() => { window.__scenicStorage!.fail = false; });
  await save(page).click();
  await expect(page.locator("#scenic-name")).toHaveText("存储恢复后的景区");
  expect(await page.evaluate(() => window.__scenicStorage?.writes)).toBe(2);
});

for (const failure of ["fail", "throw"] as const) {
  test(`初次读取${failure}禁用编辑，重试恢复；保存异常保留输入`, async ({ page }) => {
    await interceptScenic(page);
    await page.addInitScript(value => { window.__scenicTest = { load: value }; }, failure);
    await openProfile(page);
    await expect(page.locator(".scenic-profile").getByRole("alert")).toContainText("读取失败");
    await expect(edit(page)).toBeDisabled();
    await expect(page.locator("#scenic-name")).toHaveCount(0);
    await page.evaluate(() => { window.__scenicTest = { save: "throw" }; });
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await edit(page).click();
    await page.locator("#name").fill("异常后保留的输入");
    await save(page).click();
    await expect(page.locator(".form-error-banner")).toContainText("输入已保留");
    await expect(page.locator("#name")).toHaveValue("异常后保留的输入");
    await page.evaluate(() => { window.__scenicTest = {}; });
    await save(page).click();
    await expect(page.locator("#scenic-name")).toHaveText("异常后保留的输入");
  });
}

test("草稿受到路由离开、关闭页面与退出登录保护", async ({ page }) => {
  await openProfile(page);
  await edit(page).click();
  await page.locator("#name").fill("需要保护的草稿");
  // 浏览器关闭/刷新共用 beforeunload 守卫；取消离开后继续原草稿。
  const unload = page.waitForEvent("dialog");
  const reload = page.reload({ timeout: 3000 }).catch(() => null);
  const dialog = await unload;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await reload;
  await expect(page.locator("#name")).toHaveValue("需要保护的草稿");
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("景区资料有未保存的修改");
  await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
  await page.evaluate(() => { location.hash = "#/overview"; });
  await expect(page.getByRole("alertdialog")).toContainText("景区资料有未保存的修改");
  await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator("#name")).toHaveValue("需要保护的草稿");
  await page.evaluate(() => { location.hash = "#/overview"; });
  await page.getByRole("button", { name: "放弃修改并离开", exact: true }).click();
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
  await gotoPage(page, "/content/scenic", "景区资料");
  await expect(page.locator("#scenic-name")).toHaveText("青岚山境");
});

test("桌面主次、玻璃、图片比例与窄容器长文本不溢出", async ({ page }) => {
  await interceptScenic(page);
  await openProfile(page);
  await expect(page.locator("#scenic-name")).toBeVisible();
  for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080], [1200, 900]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.locator(".scenic-profile").evaluate(element => {
      const cover = element.querySelector(".scenic-profile__cover")!.getBoundingClientRect();
      const intro = element.querySelector(".scenic-profile__intro")!.getBoundingClientRect();
      const service = element.querySelector(".scenic-profile__services")!.getBoundingClientRect();
      const card = getComputedStyle(element.querySelector(".scenic-profile__identity")!);
      return { overflow: document.documentElement.scrollWidth > innerWidth, ratio: cover.width / cover.height,
        single: intro.bottom <= cover.top, bottom: service.bottom, tint: card.getPropertyValue("--glass-tint-opacity"),
        body: getComputedStyle(element.querySelector(".scenic-profile__intro p")!).fontSize };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.ratio).toBeCloseTo(1.6, 2);
    expect(layout.tint.trim()).toBe("0.16");
    expect(layout.body).toBe("18px");
    if (width >= 1366) { expect(layout.bottom).toBeLessThan(height); expect(layout.single).toBe(false); }
    else expect(layout.single).toBe(true);
  }
  await page.evaluate(() => { window.__scenicTest = { profile: { name: "长名称".repeat(20), summary: "连续长简介".repeat(60), openingText: "营业说明\n".repeat(40), address: "A".repeat(200), coverUrl: "" } }; location.hash = "#/overview"; });
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
  await gotoPage(page, "/content/scenic", "景区资料");
  await expect(page.getByText("尚未设置封面")).toBeVisible();
  await expect(page.locator(".scenic-profile__intro p")).toHaveText("连续长简介".repeat(60));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await edit(page).click();
  for (const width of [1366, 1440, 1920, 1200, 560]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const background = await page.locator("#summary").evaluate(element => getComputedStyle(element).backgroundColor);
    expect(background).toMatch(/^rgba\(/);
  }
});

test("封面加载失败显示明确空态，编辑时仍可选择其他素材", async ({ page }) => {
  await page.route("**/assets/scenic-landscape.svg", route => route.abort());
  await openProfile(page);
  await expect(page.getByText("封面暂时无法显示")).toBeVisible();
  await edit(page).click();
  await expect(page.getByText("图片无法显示")).toBeVisible();
  await page.locator(".scenic-profile__cover-option").nth(1).click();
  await save(page).click();
  await expect(page.locator(".scenic-profile__cover img")).toHaveAttribute("src", "/assets/scenic-creek.svg");
});
