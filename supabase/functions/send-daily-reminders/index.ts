// Daily task reminder — runs at 03:00 UTC (08:30 AM IST) via pg_cron.
// Sends email and/or Teams card per user based on their notification_preference.
// Required Supabase secrets: RESEND_API_KEY, FROM_EMAIL, APP_URL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL           = Deno.env.get('FROM_EMAIL') ?? 'DegiTasks <no-reply@degitasks.com>'
const APP_URL              = Deno.env.get('APP_URL') ?? 'https://degitasks.degitrans.com'

const DONE_STATUSES = ['Done', 'Completed', 'Closed']

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const today = new Date().toISOString().slice(0, 10)

  // Fetch all pending tasks due on or before today that have an assignee
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select(`
      id, title, status, priority, due_date,
      board:boards(id, name),
      assignee:profiles!tasks_assignee_id_fkey(id, full_name),
      group:groups(name)
    `)
    .lte('due_date', today)
    .not('assignee_id', 'is', null)
    .not('status', 'in', `(${DONE_STATUSES.map((s) => `"${s}"`).join(',')})`)

  if (error) {
    console.error('Failed to fetch tasks:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!tasks || tasks.length === 0) {
    console.log('No pending tasks due today or overdue — nothing to send.')
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  // Fetch notification preferences for all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, notification_preference, teams_webhook_url')

  const prefMap = new Map<string, { pref: string; teamsUrl: string | null }>()
  for (const p of profiles ?? []) {
    prefMap.set(p.id, {
      pref: p.notification_preference ?? 'email',
      teamsUrl: p.teams_webhook_url ?? null,
    })
  }

  // Group tasks by assignee
  type TaskRecord = typeof tasks[number]
  const byUser = new Map<string, { name: string; dueToday: TaskRecord[]; overdue: TaskRecord[] }>()

  for (const task of tasks) {
    const uid = task.assignee?.id
    if (!uid) continue
    if (!byUser.has(uid)) byUser.set(uid, { name: task.assignee.full_name ?? 'there', dueToday: [], overdue: [] })
    const bucket = byUser.get(uid)!
    if (task.due_date === today) bucket.dueToday.push(task)
    else bucket.overdue.push(task)
  }

  // Resolve emails via service role
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map<string, string>()
  for (const u of authUsers?.users ?? []) emailMap.set(u.id, u.email ?? '')

  let emailSent = 0, teamsSent = 0
  const errors: string[] = []

  for (const [uid, { name, dueToday, overdue }] of byUser) {
    const { pref, teamsUrl } = prefMap.get(uid) ?? { pref: 'email', teamsUrl: null }
    const totalCount = dueToday.length + overdue.length

    // ── Email ────────────────────────────────────────────────────────────────
    if (pref === 'email' || pref === 'both') {
      const toEmail = emailMap.get(uid)
      if (toEmail) {
        const taskRow = (t: TaskRecord) => {
          const boardUrl = `${APP_URL}/board/${t.board?.id ?? ''}`
          const priority = t.priority ? ` · ${t.priority}` : ''
          const status   = t.status   ? ` [${t.status}]`   : ''
          return `<li style="margin-bottom:10px;">
            <a href="${boardUrl}" style="color:#0073ea;text-decoration:none;font-weight:600;">${t.title}</a>
            <span style="color:#888;font-size:13px;">${status}${priority} — ${t.board?.name ?? ''}</span>
          </li>`
        }

        const todaySection = dueToday.length > 0 ? `
          <p style="margin:0 0 8px;font-weight:700;color:#1a1a1a;">📅 Due Today</p>
          <ul style="padding-left:20px;margin:0 0 20px;">${dueToday.map(taskRow).join('')}</ul>` : ''

        const overdueSection = overdue.length > 0 ? `
          <p style="margin:0 0 8px;font-weight:700;color:#e2445c;">⚠️ Overdue (${overdue.length})</p>
          <ul style="padding-left:20px;margin:0 0 20px;">${overdue.map(taskRow).join('')}</ul>` : ''

        const subjectParts = []
        if (dueToday.length > 0) subjectParts.push(`${dueToday.length} due today`)
        if (overdue.length > 0)  subjectParts.push(`${overdue.length} overdue`)

        const html = `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
            <div style="background:#0073ea;padding:20px 24px;border-radius:8px 8px 0 0;">
              <h1 style="margin:0;color:white;font-size:20px;">📋 Your Task Reminder</h1>
            </div>
            <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
              <p style="margin:0 0 16px;">Hi ${name},</p>
              <p style="margin:0 0 20px;">You have <strong>${totalCount} task${totalCount === 1 ? '' : 's'}</strong> that need your attention today (${today}):</p>
              ${todaySection}
              ${overdueSection}
              <a href="${APP_URL}" style="display:inline-block;padding:10px 20px;background:#0073ea;color:white;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
                Open DegiTasks →
              </a>
              <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">
                You're receiving this because tasks are assigned to you in DegiTasks.
                <a href="${APP_URL}/profile" style="color:#9ca3af;">Update preferences</a>
              </p>
            </div>
          </div>`

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [toEmail],
            subject: `📋 ${subjectParts.join(', ')} — DegiTasks`,
            html,
          }),
        })

        if (res.ok) {
          emailSent++
          console.log(`Email sent to ${toEmail}: ${dueToday.length} today, ${overdue.length} overdue`)
        } else {
          const body = await res.text()
          errors.push(`email:${toEmail}: ${body}`)
          console.error(`Email failed for ${toEmail}:`, body)
        }
      }
    }

    // ── Microsoft Teams ───────────────────────────────────────────────────────
    if ((pref === 'teams' || pref === 'both') && teamsUrl) {
      const taskLine = (t: TaskRecord) => ({
        type: 'TextBlock',
        text: `• **${t.title}** — ${t.board?.name ?? ''}${t.priority ? ` · ${t.priority}` : ''}`,
        wrap: true,
        spacing: 'Small',
      })

      const bodyBlocks: object[] = [
        {
          type: 'TextBlock',
          text: `📋 Hi ${name}, here's your task summary for today`,
          weight: 'Bolder',
          size: 'Medium',
          color: 'Accent',
          wrap: true,
        },
      ]

      if (dueToday.length > 0) {
        bodyBlocks.push({
          type: 'TextBlock',
          text: `🗓️ Due Today (${dueToday.length})`,
          weight: 'Bolder',
          spacing: 'Medium',
        })
        bodyBlocks.push(...dueToday.map(taskLine))
      }

      if (overdue.length > 0) {
        bodyBlocks.push({
          type: 'TextBlock',
          text: `⚠️ Overdue (${overdue.length})`,
          weight: 'Bolder',
          color: 'Attention',
          spacing: 'Medium',
        })
        bodyBlocks.push(...overdue.slice(0, 10).map((t) => ({
          type: 'TextBlock',
          text: `• **${t.title}** — due ${t.due_date}`,
          color: 'Attention',
          wrap: true,
          spacing: 'Small',
        })))
      }

      const card = {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard',
            version: '1.4',
            body: bodyBlocks,
            actions: [{
              type: 'Action.OpenUrl',
              title: 'Open DegiTasks',
              url: APP_URL,
            }],
          },
        }],
      }

      const res = await fetch(teamsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      })

      if (res.ok) {
        teamsSent++
        console.log(`Teams card sent to ${name}: ${dueToday.length} today, ${overdue.length} overdue`)
      } else {
        const body = await res.text()
        errors.push(`teams:${name}: ${body}`)
        console.error(`Teams failed for ${name}:`, body)
      }
    }
  }

  console.log(`Daily reminders done — email: ${emailSent}, teams: ${teamsSent}, errors: ${errors.length}`)
  return new Response(JSON.stringify({ emailSent, teamsSent, errors }), { status: 200 })
})
