import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

const manifest = JSON.parse(readFileSync(new URL('../mcp.json', import.meta.url), 'utf8'))
const lookup = manifest.tools.find(tool => tool.name === 'find_invite_by_code')
const redeem = manifest.tools.find(tool => tool.name === 'redeem_invite')

function fixture() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE invites (tenant_id TEXT, code TEXT UNIQUE, role TEXT, expires_at INTEGER);
    CREATE TABLE members (id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, role TEXT,
      display_name TEXT, avatar_url TEXT, joined_at INTEGER, UNIQUE(tenant_id, user_id));
    INSERT INTO invites VALUES ('workspace-a', 'valid', 'member', 2000);
    INSERT INTO invites VALUES ('workspace-b', 'expired', 'admin', 500);
    INSERT INTO members VALUES ('other', 'workspace-a', 'another-user', 'owner', 'Private creator', NULL, 1);
  `)
  const read = (code, user = 'new-user') => db.prepare(lookup.sql).all({ code, __user_id: user, __now: 1000 }).map(row => ({ ...row }))
  const join = (code, id = 'new-membership') => db.prepare(redeem.sql).run({ code, id, __user_id: 'new-user', __now: 1000, display_name: 'New member', avatar_url: null })
  return { db, read, join }
}

test('invite lookup is unavailable before membership and exposes only the joined workspace', () => {
  const {db, read, join} = fixture()
  try {
    assert.equal(lookup.requires_auth, true)
    assert.equal(lookup.auth?.caller_unscoped, undefined)
    assert.deepEqual(read('valid'), [])
    assert.equal(join('valid').changes, 1)
    assert.deepEqual(read('valid'), [{ tenant_id: 'workspace-a' }])
    assert.deepEqual(read('valid', 'stranger'), [])
  } finally { db.close() }
})

test('redemption preserves the invite role and cannot duplicate existing membership', () => {
  const {db, read, join} = fixture()
  try {
    join('valid')
    assert.equal(join('valid', 'duplicate').changes, 0)
    assert.deepEqual(read('valid'), [{ tenant_id: 'workspace-a' }])
    const members = db.prepare("SELECT role FROM members WHERE user_id = 'new-user'").all()
    assert.deepEqual(members.map(row => row.role), ['member'])
  } finally { db.close() }
})

for (const code of ['expired', 'unknown']) {
  test(`${code} invite cannot grant membership or reveal a workspace`, () => {
    const {db, read, join} = fixture()
    try {
      assert.equal(join(code).changes, 0)
      assert.deepEqual(read(code), [])
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM members WHERE user_id = 'new-user'").get().n, 0)
    } finally { db.close() }
  })
}
