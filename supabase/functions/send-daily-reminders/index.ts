// Daily task reminder — runs at 03:00 UTC (08:30 AM IST) via pg_cron.
// Required Supabase secrets:
//   RESEND_API_KEY  — your Resend.com API key
//   FROM_EMAIL      — verified sender address, e.g. "DegiTasks <no-reply@yourdomain.com>"
//   APP_URL         — public URL of the app, e.g. "https://tasks.yourdomain.com"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL        = Deno.env.get('FROM_EMAIL') ?? 'DegiTasks <no-reply@degitasks.com>'
const APP_URL           = Deno.env.get('APP_URL') ?? 'https://degitasks.com'

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD in UTC (= IST date at 08:30)

  // Fetch all tasks due today that have an assignee
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select(`
      id, title, status, priority, due_date,
      board:boards(id, name),
      assignee:profiles!tasks_assignee_id_fkey(id, full_name),
      group:groups(name)
    `)
    .eq('due_date', today)
    .not('assignee_id', 'is', null)

  if (error) {
    console.error('Failed to fetch tasks:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!tasks || tasks.length === 0) {
    console.log('No tasks due today — no emails sent.')
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  // Group tasks by assignee
  const byUser = new Map<string, { name: string; email_id: string; tasks: typeof tasks }>()
  for (const task of tasks) {
    const uid = task.assignee?.id
    if (!uid) continue
    if (!byUser.has(uid)) byUser.set(uid, { name: task.assignee.full_name ?? 'there', email_id: uid, tasks: [] })
    byUser.get(uid)!.tasks.push(task)
  }

  // Resolve user emails from auth.users via service role
  const userIds = [...byUser.keys()]
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map<string, string>()
  for (const u of authUsers?.users ?? []) emailMap.set(u.id, u.email ?? '')

  let sent = 0
  const errors: string[] = []

  for (const [uid, { name, tasks: userTasks }] of byUser) {
    const toEmail = emailMap.get(uid)
    if (!toEmail) continue

    const taskRows = userTasks.map((t) => {
      const boardUrl = `${APP_URL}/board/${t.board?.id ?? ''}`
      const priority = t.priority ? ` · ${t.priority}` : ''
      const status   = t.status   ? ` [${t.status}]`   : ''
      return `<li style="margin-bottom:8px;">
        <a href="${boardUrl}" style="color:#0073ea;text-decoration:none;font-weight:600;">${t.title}</a>
        <span style="color:#888;font-size:13px;">${status}${priority} — ${t.board?.name ?? ''}</span>
      </li>`
    }).join('')

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
        <div style="background:#0073ea;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:white;font-size:20px;">📋 Tasks Due Today</h1>
        </div>
        <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 16px;">Hi ${name},</p>
          <p style="margin:0 0 16px;">Here are your tasks due <strong>today (${today})</strong>:</p>
          <ul style="padding-left:20px;margin:0 0 24px;">${taskRows}</ul>
          <a href="${APP_URL}" style="display:inline-block;padding:10px 20px;background:#0073ea;color:white;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
            Open DegiTasks
          </a>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">
            You're receiving this because tasks are assigned to you in DegiTasks.
          </p>
        </div>
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [toEmail],
        subject: `📋 You have ${userTasks.length} task${userTasks.length === 1 ? '' : 's'} due today — DegiTasks`,
        html,
      }),
    })

    if (res.ok) {
      sent++
    } else {
      const body = await res.text()
      errors.push(`${toEmail}: ${body}`)
      console.error(`Failed to send to ${toEmail}:`, body)
    }
  }

  console.log(`Daily reminders: ${sent} sent, ${errors.length} failed.`)
  return new Response(JSON.stringify({ sent, errors }), { status: 200 })
})
