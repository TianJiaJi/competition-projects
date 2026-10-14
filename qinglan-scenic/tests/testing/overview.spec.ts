import {expect,test} from '@playwright/test';
import {campusProject,apiMaterials,assignments} from '../../apps/testing/src/campus-handoff';
import {fixtures,receive,nav,noOverflow} from './helpers';
test.beforeEach(async({page})=>fixtures(page));

test('交付概览围绕上游要求、实际交付、测试范围与回交产物，内容与本轮材料一致',async({page})=>{
 await receive(page);
 await expect(page.getByRole('heading',{name:'交付概览',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'本轮交付关联'})).toContainText('CAMPUS-DELIVERY-2026-001');
 await expect(page.getByRole('region',{name:'本轮交付关联'})).toContainText('QA-CAMPUS-001');
 await expect(page.getByRole('region',{name:'上游验收要求'})).toContainText('教师按班级审批');
 await expect(page.getByRole('region',{name:'上游验收要求'})).toContainText('管理后台的预约管理保持只读');
 const materials=page.getByRole('region',{name:'本次交付清单'});
 await expect(materials.locator('.delivered-pages article')).toHaveCount(5);
 for(const entry of campusProject.pages)await expect(materials.getByRole('link',{name:`打开${entry.name}交付页面`,exact:true})).toHaveAttribute('href',new RegExp(`:${entry.port}/`));
 await materials.locator('.api-delivery-list summary').click();await expect(materials.locator('tbody tr')).toHaveCount(apiMaterials.length);
 for(const material of apiMaterials)await expect(materials.locator('tbody tr').filter({hasText:material.name})).toContainText(material.checkpoint);
 await expect(materials).toContainText('110 项是后续生成的测试场景，不是额外交付的接口');
 await expect(materials.locator('.delivered-assignments article')).toHaveCount(assignments.length);
 for(const assignment of assignments)await expect(materials.locator('.delivered-assignments article').filter({hasText:assignment.title})).toContainText(assignment.standard);
 await expect(page.getByRole('region',{name:'本轮测试任务'}).locator('article')).toHaveCount(4);
 const returns=page.getByRole('region',{name:'测试回交要求'});await expect(returns.locator('article')).toHaveCount(4);
 for(const text of ['综合验收报告','问题清单与未测范围','原始测试证据','反馈与归档回执'])await expect(returns).toContainText(text);
 await expect(page.getByRole('region',{name:'回交前核对'})).toContainText('两个不同结论');
 await expect(page.locator('.task-timeline,.task-metrics,.trend-chart,iframe')).toHaveCount(0);
});

test('查看交接单和展开材料不导入、不生成、不执行或修改任务；各测试与回交入口导航正确',async({page})=>{
 await receive(page);await nav(page,'任务中心');
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('service-test-workbench.campus-task.v1')!));
 await nav(page,'交付概览');await page.locator('.api-delivery-list summary').click();
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('service-test-workbench.campus-task.v1')!));expect(after).toEqual(before);
 expect(after.apiParsedAt).toBeNull();expect(after.apiGeneratedAt).toBeNull();expect(after.specialGeneratedAt).toBeNull();expect(after.reports).toEqual([]);
 await page.getByRole('button',{name:'前往UI测试',exact:true}).click();await expect(page.getByRole('button',{name:'打开项目预览',exact:true})).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);
 await nav(page,'交付概览');await page.getByRole('button',{name:'前往API测试',exact:true}).click();await expect(page.locator('.api-table')).toHaveCount(0);await expect(page.getByRole('button',{name:'解析API材料',exact:true})).toBeEnabled();
 await nav(page,'交付概览');await page.getByRole('button',{name:'前往专项测试',exact:true}).click();await expect(page.locator('.assignment-grid article')).toHaveCount(4);await expect(page.locator('.special-workspace')).toHaveCount(0);
 await nav(page,'交付概览');await page.getByRole('button',{name:'前往并发测试',exact:true}).click();await expect(page.getByRole('button',{name:'开始并发测试',exact:true})).toBeDisabled();
 await nav(page,'交付概览');await page.getByRole('button',{name:'前往验收报告',exact:true}).click();await expect(page.getByRole('heading',{name:'等待手动汇总',exact:true})).toBeVisible();await expect(page.locator('.acceptance-cover,.archived-reports article')).toHaveCount(0);
 const final=await page.evaluate(()=>JSON.parse(localStorage.getItem('service-test-workbench.campus-task.v1')!));expect(final).toEqual(before);
});

for(const width of [1920,1440,1280,900,390])test(`上游交接说明 ${width}px 无横向溢出，需求与交付清单可读`,async({page})=>{
 await page.setViewportSize({width,height:960});await receive(page);await noOverflow(page);
 await page.locator('.api-delivery-list summary').click();await noOverflow(page);
 expect(await page.locator('.delivery-api-table').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await expect(page.getByRole('button',{name:'前往验收报告',exact:true})).toBeVisible();
 await page.screenshot({path:`.local/qa/testing-handoff-overview-${width}.png`,fullPage:true});
});
