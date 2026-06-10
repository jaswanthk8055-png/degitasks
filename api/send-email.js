import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client with service role (can read auth.users)
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { assigneeId, taskTitle, assignerName, boardName, boardId, taskId } = req.body

  if (!assigneeId || !taskTitle) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[send-email] RESEND_API_KEY not set — skipping email')
    return res.status(200).json({ skipped: true })
  }

  try {
    // Fetch assignee email via Supabase admin API (auth.users is not accessible from client)
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(assigneeId)
    if (userErr || !user?.email) {
      return res.status(404).json({ error: 'Assignee not found' })
    }

    const origin = req.headers.origin || 'https://degitasks.degitrans.com'
    const taskUrl = boardId ? `${origin}/board/${boardId}` : origin

    const html = buildEmailHtml({ taskTitle, assignerName, boardName, taskUrl })

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'DegiTasks <noreply@degitrans.com>',
        to: user.email,
        subject: `${assignerName} assigned a task to you`,
        html,
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.message || `Resend error ${response.status}`)
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[send-email]', err.message)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}

function buildEmailHtml({ taskTitle, assignerName, boardName, taskUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Task Assigned</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#0073ea;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="padding-right:10px;vertical-align:middle;">
                    <div style="width:32px;height:32px;background:rgba(255,255,255,0.25);border-radius:8px;display:inline-block;line-height:32px;text-align:center;font-size:18px;">✓</div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">DegiTasks</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;border-radius:0 0 12px 12px;padding:36px 32px;border:1px solid #e0e0e0;border-top:none;">
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">You've been assigned a task</h2>
              <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.5;">
                <strong>${escHtml(assignerName)}</strong> assigned a task to you in <strong>${escHtml(boardName)}</strong>.
              </p>

              <!-- Task card -->
              <div style="background:#f8f9fb;border:1px solid #e4e7ec;border-left:4px solid #0073ea;border-radius:8px;padding:16px 20px;margin-bottom:28px;">
                <p style="margin:0;font-size:16px;font-weight:600;color:#1a1a1a;">${escHtml(taskTitle)}</p>
              </div>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#0073ea;">
                    <a href="${taskUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      View Task →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#aaaaaa;">
                You received this because a task was assigned to your DegiTasks account.<br/>
                <a href="https://degitasks.degitrans.com" style="color:#0073ea;text-decoration:none;">degitasks.degitrans.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
