import {expect,test} from '@playwright/test';
import {fixtures,receive,nav,selectChoice,downloadJson} from './helpers';
test.beforeEach(async({page})=>fixtures(page));
test('五端一键完成需确认，保留整改，自动弹UI报告并在记录中可重开',async({page})=>{
 await receive(page);await nav(page,'UI测试');
 await selectChoice(page,'检查结果1','需整改');await page.getByLabel('检查备注1',{exact:true}).fill('首页入口对比度待调整');
 await page.getByRole('button',{name:'一键完成五端检查',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('这不是自动UI测试');
 await page.getByRole('button',{name:'返回继续检查',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'检查结果2',exact:true})).toHaveText('待检查');
 await page.getByRole('button',{name:'一键完成五端检查',exact:true}).click();
 await page.getByRole('button',{name:'已人工检查，完成并生成报告',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'UI测试报告',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('16 项通过 · 1 项需整改');await expect(dialog).toContainText('首页入口对比度待调整');
 const report=await downloadJson(page,'导出UI报告JSON');expect(report.checks).toHaveLength(17);expect(report.source).toBe('manual-observation');
 await page.keyboard.press('Escape');await nav(page,'验收报告');
 await expect(page.locator('.archived-reports')).toContainText('UI测试');
 await page.getByRole('button',{name:'查看UI报告',exact:true}).click();await expect(dialog).toContainText('16 项通过');
 await page.keyboard.press('Escape');await page.reload();await nav(page,'验收报告');await page.getByRole('button',{name:'查看UI报告',exact:true}).click();await expect(dialog).toContainText('首页入口对比度待调整');
});
test('一键完成不能覆盖缺少说明的整改项',async({page})=>{
 await receive(page);await nav(page,'UI测试');await selectChoice(page,'检查结果1','需整改');
 await page.getByRole('button',{name:'一键完成五端检查',exact:true}).click();await page.getByRole('button',{name:'已人工检查，完成并生成报告',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('问题描述');await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'检查结果2',exact:true})).toHaveText('待检查');
});
