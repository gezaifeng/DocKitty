import type { Page } from '@playwright/test'

export async function revealInspector(page: Page, action: string) {
  const aside = page.locator('.wg-inspector-organized')
  if (['改名称', '回收文档', '还原文档', '删除非当前分支', '打开编辑副本'].includes(action)) {
    const settings = aside.locator('.wg-inspector-document')
    if (await settings.count() && await settings.getAttribute('open') === null) await settings.locator('summary').click()
  } else if (['编辑显示名称与备注', '版本备注'].includes(action)) await aside.getByRole('tab', { name: '信息', exact: true }).click()
  else if (['编辑版本信息', '建分支', '选择两版比较', '开始对比', '导出副本', '打开临时副本', '恢复工作区', '撤销覆盖', '删除版本…', '还原此版本'].includes(action)) await aside.getByRole('tab', { name: '操作', exact: true }).click()
}
