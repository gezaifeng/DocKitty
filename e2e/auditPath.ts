import path from 'node:path'

// A release audit can collect new evidence without overwriting earlier release captures.
export const auditPath = (name: string) => path.resolve(process.env.WORDGIT_AUDIT_ROOT ?? 'docs', name)
