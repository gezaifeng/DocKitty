import path from 'node:path'

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export function validateDocName(name: string): string {
  if (!name || name !== name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name)
    || name === '.' || name === '..' || /[. ]$/.test(name) || RESERVED.test(name)) {
    throw new Error('文档名称不合法，请使用不含路径或特殊字符的文件名')
  }
  return name
}

export function validateBranchName(name: string): string {
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u.test(name) || /[. ]$/.test(name)
    || name.toUpperCase() === 'HEAD' || RESERVED.test(name)) {
    throw new Error('分支名称不合法，可用中文、字母、数字、空格、下划线或短横线，不能使用 HEAD')
  }
  return name
}

export function containedPath(root: string, relative: string): string {
  if (path.isAbsolute(relative)) throw new Error('文件路径必须位于目标目录内')
  const base = path.resolve(root)
  const result = path.resolve(base, relative)
  if (result !== base && !result.startsWith(base + path.sep)) throw new Error('文件路径越出目标目录')
  return result
}
