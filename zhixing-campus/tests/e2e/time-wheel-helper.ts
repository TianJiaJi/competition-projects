import type { Page } from '@playwright/test';
export async function setWheelTime(page: Page, target: '开始' | '结束', time: string) {
  await page.getByRole('button', { name: `设置${target}时间` }).click();
  const parts = time.split(':').map(Number);
  for (const [index, unit] of ['时', '分', '秒'].entries()) {
    const column = page.getByRole('spinbutton', { name: `${target}${unit}`, exact: true });
    await column.focus();
    await column.press('Home');
    for (let i = 0; i < parts[index]; i++) await column.press('ArrowUp');
  }
}
