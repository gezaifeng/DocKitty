import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect } from 'vitest'
import { InspectorTabs } from './InspectorTabs'

it('keeps only the chosen inspector section visible and supports keyboard navigation', () => {
  function Sample() {
    const [value, setValue] = useState('preview')
    return <InspectorTabs value={value} onChange={setValue} tabs={[{ id: 'preview', label: '预览', content: <p>文档正文</p> }, { id: 'info', label: '信息', content: <button>编辑版本备注</button> }, { id: 'actions', label: '操作', content: <button>删除版本</button> }]}/>
  }
  render(<Sample/>); expect(screen.getByRole('tabpanel')).toHaveTextContent('文档正文')
  expect(screen.queryByRole('button', { name: '删除版本' })).toBeNull()
  screen.getByRole('tab', { name: '预览' }).focus()
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: '信息' })).toHaveFocus()
  expect(screen.getByRole('tabpanel')).toHaveAccessibleName('信息')
  fireEvent.keyDown(document.activeElement!, { key: 'End' })
  expect(screen.getByRole('button', { name: '删除版本' })).toBeVisible()
  fireEvent.keyDown(document.activeElement!, { key: 'Home' })
  expect(screen.getByRole('tab', { name: '预览' })).toHaveFocus()
})
