import {expect,test} from '@playwright/test';
import {fixtures,receive,nav} from './helpers';
for(const height of [720,900])test(`底部菜单向上展开不被保存按钮遮挡 ${height}`,async({page})=>{
 await page.setViewportSize({width:1440,height});await fixtures(page);await receive(page);await nav(page,'UI测试');
 const form=page.locator('.ui-checklist form');await form.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const select=page.getByRole('combobox',{name:'检查结果4',exact:true});await select.click();
 const menu=page.getByRole('listbox',{name:'检查结果4选项',exact:true});
 const menuBox=await menu.boundingBox(),triggerBox=await select.boundingBox(),footer=await page.getByRole('button',{name:'保存页面检查',exact:true}).boundingBox();
 expect(menuBox!.y+menuBox!.height).toBeLessThanOrEqual(triggerBox!.y);
 expect(menuBox!.y+menuBox!.height).toBeLessThan(footer!.y);
 for(const name of ['待检查','通过','需整改']){
  const option=menu.getByRole('option',{name,exact:true});await expect(option).toBeVisible();await option.click({trial:true});
 }
 await page.screenshot({path:`.local/qa/testing-select-above-footer-${height}.png`});
 await menu.getByRole('option',{name:'需整改',exact:true}).click();await expect(select).toHaveText('需整改');
 await page.getByRole('button',{name:'保存页面检查',exact:true}).click();await expect(page.getByRole('alert')).toContainText('问题描述');
});
