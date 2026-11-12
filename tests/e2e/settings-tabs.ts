import { expect, type Page } from '@playwright/test'

export type SettingsTabName = 'appearance' | 'relationship' | 'memory' | 'behavior' | 'ai' | 'data'

/**
 * 设置页是分页结构，操作某个控件前必须先切到它所在的分页，
 * 这与真实用户的路径一致，也能防止测试继续依赖“所有控件都在同一页”的旧布局。
 */
export async function openSettingsTab(page: Page, tab: SettingsTabName): Promise<void> {
  await page.locator(`.settings-tab[data-tab="${tab}"]`).click()
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/is-active/)
}
