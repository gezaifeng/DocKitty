export const glassPalettes = [
  { id: 'jade', label: '玉绿珍珠', colors: ['#91b49a', '#e5b79d'] },
  { id: 'blue-white', label: '蓝白', colors: ['#87bce9', '#f6faff'] },
  { id: 'pink-green', label: '粉绿', colors: ['#efb5c7', '#96c3a5'] },
  { id: 'yellow-black', label: '黄黑', colors: ['#efd168', '#393b35'] },
  { id: 'lavender', label: '紫白', colors: ['#c4b2e6', '#f5effa'] },
  { id: 'peach', label: '橙米', colors: ['#ecb08a', '#f8e9cb'] },
] as const

export type GlassPalette = typeof glassPalettes[number]['id']
