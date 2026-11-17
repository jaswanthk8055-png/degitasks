import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const TODAY = '2026-11-17'
const YESTERDAY = '2026-11-16'
const RESEND_URL = 'https://api.resend.com/emails'
const SHARED_WEBHOOK = 'https://teams.invalid/shared'
const users = [
  { id: 'alice', full_name: 'Alice', email: 'alice@example.test' },
  { id: 'bob', full_name: 'Bob', email: 'bob@example.test' },
]

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [`${TODAY}T03:00:00Z`]))
  }
  static now() { return new Date(`${TODAY}T03:00:00Z`).getTime() }
}

function task(title, assigneeId, visibility, ownerId, dueDate = TODAY) {
  return {
    id: title,
    title,
    status: 'Working on it',
    priority: 'High',
    due_date: dueDate,
    assignee_id: assigneeId,
    assignee: users.find((user) => user.id === assigneeId),
    board: visibility ? { id: `${visibility}-${ownerId}`, name: `${visibility} board`, visibility, created_by: ownerId } : null,
    group: { name: 'Active' },
  }
}

// Execute the checked-in Deno handlers in an isolated context. Only the remote
// Supabase import is replaced; task grouping and all outgoing payloads use the
// real function source. No real credentials, network, or Deno server are used.
async function runReminder(name, tasks, preference = 'both') {
  const sourceUrl = new URL(`../supabase/functions/${name}/index.ts`, import.meta.url)
  const source = readFileSync(sourceUrl, 'utf8')
  const clientImport = /^import\s+\{\s*createClient\s*\}\s+from\s+['"]https:\/\/esm\.sh\/@supabase\/supabase-js@2['"];?\s*$/gm
  assert.equal([...source.matchAll(clientImport)].length, 1, 'Expected exactly one mocked Supabase import')
  const script = stripTypeScriptTypes(source.replace(clientImport, ''), { sourceUrl: sourceUrl.href })
  const profiles = users.map((user) => ({
    ...user,
    notification_preference: preference,
    teams_webhook_url: `https://teams.invalid/${user.id}`,
  }))
  const deliveries = []
  let handler

  const database = {
    auth: { admin: { listUsers: async () => ({ data: { users }, error: null }) } },
    from(table) {
      assert.ok(['tasks', 'profiles'].includes(table), `Unexpected table: ${table}`)
      let selection = ''
      const filters = []
      const query = {
        select(value) {
          if (table === 'tasks') {
            assert.match(value, /assignee:profiles!tasks_assignee_id_fkey\(/,
              'Task assignee embedding must distinguish assignee_id from the created_by profile relationship')
          }
          selection = value
          return query
        },
        eq(column, value) { filters.push({ op: 'eq', column, value }); return query },
        neq(column, value) { filters.push({ op: 'neq', column, value }); return query },
        lt(column, value) { filters.push({ op: 'lt', column, value }); return query },
        lte(column, value) { filters.push({ op: 'lte', column, value }); return query },
        not(column, operator, value) { filters.push({ op: 'not', column, operator, value }); return query },
        then(resolve, reject) {
          let rows = structuredClone(table === 'tasks' ? tasks : profiles)
          const innerBoard = /board:boards!inner\(/.test(selection)
          if (innerBoard) rows = rows.filter((row) => row.board)
          for (const filter of filters) {
            const matches = (row) => {
              const actual = filter.column.split('.').reduce((value, key) => value?.[key], row)
              if (filter.op === 'eq') return actual === filter.value
              if (filter.op === 'neq') return actual !== filter.value
              if (filter.op === 'lt') return actual != null && actual < filter.value
              if (filter.op === 'lte') return actual != null && actual <= filter.value
              if (filter.op === 'not' && filter.operator === 'is') return actual != null
              if (filter.op === 'not' && filter.operator === 'in') return !JSON.parse(`[${filter.value.slice(1, -1)}]`).includes(actual)
              throw new Error(`Unsupported query filter: ${JSON.stringify(filter)}`)
            }
            // PostgREST embedded filters do not remove parent rows unless the
            // relation is !inner. Model that distinction so removing !inner
            // cannot silently pass the Teams privacy regression test.
            if (filter.column.startsWith('board.') && !innerBoard) {
              rows = rows.map((row) => matches(row) ? row : { ...row, board: null })
            } else {
              rows = rows.filter(matches)
            }
          }
          const boardFields = selection.match(/board:boards(?:!inner)?\(([^)]+)\)/)?.[1].split(',').map((field) => field.trim())
          if (table === 'tasks') {
            rows = rows.map((row) => ({
              ...row,
              // Missing visibility/ownership in the projection must also be
              // observable, rather than supplied accidentally by the fixture.
              board: row.board && boardFields ? Object.fromEntries(boardFields.map((field) => [field, row.board[field]])) : null,
            }))
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  const environment = {
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'offline-service-key',
    RESEND_API_KEY: 'offline-resend-key',
    FROM_EMAIL: 'Tasks <tasks@example.test>',
    APP_URL: 'https://app.invalid',
    TEAMS_WEBHOOK_URL: SHARED_WEBHOOK,
  }
  runInNewContext(script, {
    Date: FixedDate,
    Response,
    console: { log() {}, error() {} },
    Deno: {
      env: { get: (key) => environment[key] },
      serve: (callback) => { handler = callback },
    },
    createClient: (url, key) => {
      assert.equal(url, environment.SUPABASE_URL)
      assert.equal(key, environment.SUPABASE_SERVICE_ROLE_KEY)
      return database
    },
    fetch: async (url, options) => {
      assert.ok([RESEND_URL, SHARED_WEBHOOK, ...profiles.map((profile) => profile.teams_webhook_url)].includes(url), `Unexpected mocked destination: ${url}`)
      assert.equal(options.method, 'POST')
      deliveries.push({ url, body: JSON.parse(options.body) })
      return new Response('{}', { status: 200 })
    },
  }, { filename: sourceUrl.pathname, timeout: 1000 })
  assert.equal(typeof handler, 'function', 'The function must register its real request handler')
  const response = await handler()
  assert.equal(response.status, 200)
  return { deliveries, response }
}

function mixedTasks() {
  return [
    task('PUBLIC_DUE_ALICE', 'alice', 'public', 'alice'),
    task('PUBLIC_OVERDUE_BOB', 'bob', 'public', 'alice', YESTERDAY),
    task('PRIVATE_DUE_ALICE', 'alice', 'private', 'alice'),
    task('PRIVATE_OVERDUE_ALICE', 'alice', 'private', 'alice', YESTERDAY),
    task('PRIVATE_OVERDUE_BOB', 'bob', 'private', 'bob', YESTERDAY),
    task('PRIVATE_WRONG_ASSIGNEE', 'bob', 'private', 'alice'),
    task('MISSING_BOARD', 'alice', null, 'alice'),
  ]
}

test('daily reminder emails private tasks only to their owner and sends only public tasks to personal Teams webhooks', async () => {
  const { deliveries, response } = await runReminder('send-daily-reminders', mixedTasks())
  assert.deepEqual(await response.json(), { emailSent: 2, teamsSent: 2, errors: [] })
  const emails = deliveries.filter((delivery) => delivery.url === RESEND_URL)
  const alice = emails.find((delivery) => delivery.body.to.includes('alice@example.test')).body
  const bob = emails.find((delivery) => delivery.body.to.includes('bob@example.test')).body
  assert.match(alice.html, /PUBLIC_DUE_ALICE/)
  assert.match(alice.html, /PRIVATE_DUE_ALICE/)
  assert.match(alice.html, /PRIVATE_OVERDUE_ALICE/)
  assert.doesNotMatch(alice.html, /PRIVATE_OVERDUE_BOB|PUBLIC_OVERDUE_BOB/)
  assert.match(bob.html, /PUBLIC_OVERDUE_BOB/)
  assert.match(bob.html, /PRIVATE_OVERDUE_BOB/)
  assert.doesNotMatch(bob.html, /PRIVATE_DUE_ALICE|PRIVATE_OVERDUE_ALICE|PUBLIC_DUE_ALICE/)
  assert.doesNotMatch(JSON.stringify(deliveries), /PRIVATE_WRONG_ASSIGNEE|MISSING_BOARD/)
  const teams = deliveries.filter((delivery) => delivery.url !== RESEND_URL)
  assert.equal(teams.length, 2)
  assert.doesNotMatch(JSON.stringify(teams), /PRIVATE_/)
  const aliceCard = JSON.stringify(teams.find((delivery) => delivery.url.endsWith('/alice')).body)
  const bobCard = JSON.stringify(teams.find((delivery) => delivery.url.endsWith('/bob')).body)
  assert.match(aliceCard, /PUBLIC_DUE_ALICE/)
  assert.match(aliceCard, /Due Today \(1\)/)
  assert.doesNotMatch(aliceCard, /Overdue/)
  assert.match(bobCard, /PUBLIC_OVERDUE_BOB/)
  assert.match(bobCard, /Overdue \(1\)/)
  assert.doesNotMatch(bobCard, /Due Today/)
})

for (const preference of ['both', 'teams']) {
  test(`daily reminder does not send a Teams card for private-only tasks with ${preference} preference`, async () => {
    const { deliveries, response } = await runReminder('send-daily-reminders', [
      task('PRIVATE_DUE_OWNER', 'alice', 'private', 'alice'),
      task('PRIVATE_OVERDUE_OWNER', 'alice', 'private', 'alice', YESTERDAY),
      task('PRIVATE_WRONG_ASSIGNEE', 'bob', 'private', 'alice'),
    ], preference)
    const expectedEmails = preference === 'both' ? 1 : 0
    assert.deepEqual(await response.json(), { emailSent: expectedEmails, teamsSent: 0, errors: [] })
    assert.equal(deliveries.length, expectedEmails)
    for (const delivery of deliveries) {
      assert.equal(delivery.url, RESEND_URL)
      assert.deepEqual(delivery.body.to, ['alice@example.test'])
      assert.match(delivery.body.html, /PRIVATE_DUE_OWNER/)
      assert.match(delivery.body.html, /PRIVATE_OVERDUE_OWNER/)
      assert.doesNotMatch(delivery.body.html, /PRIVATE_WRONG_ASSIGNEE/)
    }
  })
}

test('shared Teams briefing excludes private due and overdue tasks from message content and counts', async () => {
  const { deliveries, response } = await runReminder('teams-reminder', mixedTasks())
  assert.equal(await response.text(), 'Reminder sent: 1 due, 1 overdue')
  assert.equal(deliveries.length, 1)
  assert.equal(deliveries[0].url, SHARED_WEBHOOK)
  const card = JSON.stringify(deliveries[0].body)
  assert.match(card, /PUBLIC_DUE_ALICE/)
  assert.match(card, /PUBLIC_OVERDUE_BOB/)
  assert.match(card, /Due Today \(1\)/)
  assert.match(card, /Overdue \(1\)/)
  assert.doesNotMatch(card, /PRIVATE_|MISSING_BOARD/)
})

test('shared Teams briefing makes no outbound request when all tasks are private', async () => {
  const { deliveries, response } = await runReminder('teams-reminder', [
    task('PRIVATE_DUE', 'alice', 'private', 'alice'),
    task('PRIVATE_OVERDUE', 'bob', 'private', 'bob', YESTERDAY),
  ])
  assert.equal(await response.text(), 'No tasks to report')
  assert.equal(deliveries.length, 0)
})
