import { describe, it, expect } from 'vitest'
import { CH } from '../src/channels.js'

describe('CH channels', () => {
  it('REPO_CREATE is correct string', () => {
    expect(CH.REPO_CREATE).toBe('repo.create')
  })
  it('WATCHER_CHANGE is correct string', () => {
    expect(CH.WATCHER_CHANGE).toBe('watcher.change')
  })
  it('all channel values are non-empty strings', () => {
    for (const val of Object.values(CH)) {
      expect(typeof val).toBe('string')
      expect(val.length).toBeGreaterThan(0)
    }
  })
})

import {
  RepoCreateReq, DocInfoSchema, CommitNodeSchema,
  QuarantineEntrySchema, WatcherChangeEvent,
} from '../src/schemas.js'

describe('RepoCreateReq', () => {
  it('parses valid input', () => {
    const result = RepoCreateReq.parse({ root: '/tmp/repo', name: 'myrepo' })
    expect(result.root).toBe('/tmp/repo')
    expect(result.name).toBe('myrepo')
  })
  it('throws on empty root', () => {
    expect(() => RepoCreateReq.parse({ root: '', name: 'x' })).toThrow()
  })
})

describe('DocInfoSchema', () => {
  it('parses valid doc info', () => {
    const doc = DocInfoSchema.parse({
      docId: 'report.docx',
      docName: 'report.docx',
      currentBranch: 'main',
      branches: ['main'],
      commitCount: 3,
      lastCommitAt: '2026-01-01T00:00:00.000Z',
    })
    expect(doc.commitCount).toBe(3)
  })
  it('allows null lastCommitAt', () => {
    const doc = DocInfoSchema.parse({
      docId: 'x', docName: 'x', currentBranch: 'main',
      branches: [], commitCount: 0, lastCommitAt: null,
    })
    expect(doc.lastCommitAt).toBeNull()
  })
})

describe('WatcherChangeEvent', () => {
  it('parses watcher event', () => {
    const e = WatcherChangeEvent.parse({ docName: 'a.docx', workspacePath: '/tmp/a.docx' })
    expect(e.docName).toBe('a.docx')
  })
})
