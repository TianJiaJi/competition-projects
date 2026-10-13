import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { campusProject } from '../../apps/testing/src/campus-handoff';
export async function fixtures(page:Page) {
  await page.route('**/__campus_environment',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({at:new Date().toISOString(),services:[...campusProject.pages.map(p=>({id:p.id,name:p.name,port:p.port,url:`http://localhost:${p.port}`,state:'ready',detail:'项目身份已核验'})),{id:'booking',name:'预约请假服务',port:5606,url:'http://localhost:5606',state:'ready',detail:'项目身份已核验'}]})}));
  await page.route(/http:\/\/(localhost|127\.0\.0\.1):550[0-4]\//,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>知行校园验收夹具</title><style>body{font:20px system-ui;background:#edf2fa;color:#405b95;padding:25px}</style><h1>知行校园项目</h1><p>用于隔离验证预览入口，不执行真实校园业务。</p><button>服务入口</button></html>'}));
}
export async function receive(page:Page){await page.goto('/');await page.getByRole('button',{name:'接收上游交付',exact:true}).first().click();await expect(page.getByRole('status')).toContainText('新增 1 项');await page.getByRole('button',{name:'进入测试空间',exact:true}).click();}
export async function nav(page:Page,name:string){await page.getByRole('navigation',{name:'测试工作台导航'}).getByRole('button',{name:new RegExp(`^${name}`)}).click();}
export async function generateApi(page:Page){await nav(page,'API测试');await page.getByRole('button',{name:'解析API材料',exact:true}).click();await expect(page.getByRole('button',{name:'材料已解析',exact:true})).toBeDisabled();await page.getByRole('button',{name:'生成测试用例',exact:true}).click();await expect(page.locator('.api-table tbody tr')).toHaveCount(110);}
export async function generateSpecial(page:Page){await nav(page,'专项测试');await page.getByRole('button',{name:'生成专项用例',exact:true}).click();await expect(page.getByRole('group',{name:'选择专项场景'}).getByRole('button')).toHaveCount(4);}
export async function advanceAll(page:Page){const next=page.locator('.scenario-next');for(let i=0;i<3;i++){await next.click();if(i<2)await expect(next).toBeEnabled();else await expect(next).toHaveText('本场核验完成');}}
export async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
export async function selectChoice(page:Page,label:string,choice:string){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('listbox',{name:`${label}选项`,exact:true}).getByRole('option',{name:choice,exact:true}).click();}
export async function downloadJson(page:Page,name:string){const pending=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();const file=await pending;return JSON.parse(await readFile((await file.path())!,'utf8'));}
