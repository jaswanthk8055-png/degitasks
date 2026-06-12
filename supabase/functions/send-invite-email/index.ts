// Invite-to-signup email Edge Function
// Secrets needed: RESEND_API_KEY, FROM_EMAIL, APP_URL

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL           = Deno.env.get('FROM_EMAIL') ?? 'DegiTasks <no-reply@degitasks.com>'
const APP_URL              = Deno.env.get('APP_URL') ?? 'https://degitasks.com'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

Deno.serve(async (req: Request) => {
  console.log('send-invite-email called, method:', req.method)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  let email = '', workspaceId = '', workspaceName = 'DegiTasks', inviterName = 'A colleague'

  try {
    const body = await req.json()
    email         = body.email         ?? ''
    workspaceId   = body.workspaceId   ?? ''
    workspaceName = body.workspaceName ?? workspaceName
    inviterName   = body.inviterName   ?? inviterName
    console.log('Parsed body — email:', email, 'workspaceId:', workspaceId)
  } catch (e) {
    console.error('Failed to parse request body:', e)
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS_HEADERS })
  }

  if (!email || !workspaceId) {
    return new Response(JSON.stringify({ error: 'Missing email or workspaceId' }), { status: 400, headers: CORS_HEADERS })
  }

  // Save pending invitation via Supabase REST API (no SDK needed)
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/pending_invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ email, workspace_id: workspaceId }),
      })
      console.log('DB upsert status:', dbRes.status)
    } catch (e) {
      console.warn('DB upsert failed (non-fatal):', e)
    }
  }

  // Send invitation email via Resend
  const signupUrl = `${APP_URL}/signup`

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <div style="background:#0073ea;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:white;font-size:20px;">You're invited to DegiTasks 🎉</h1>
      </div>
      <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 16px;">Hi there,</p>
        <p style="margin:0 0 16px;">
          <strong>${inviterName}</strong> has invited you to join
          <strong>${workspaceName}</strong> — a task management workspace on DegiTasks.
        </p>
        <p style="margin:0 0 24px;">Click below to create your free account:</p>
        <a href="${signupUrl}"
           style="display:inline-block;padding:12px 24px;background:#0073ea;color:white;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
          Accept Invitation →
        </a>
        <p style="margin:20px 0 0;font-size:13px;color:#555;">
          Sign up using <strong>${email}</strong> and you'll be automatically added to the workspace.
        </p>
        <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;">
          If you weren't expecting this, you can safely ignore this email.
        </p>
      </div>
    </div>`

  try {
    console.log('Sending email via Resend to:', email)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `${inviterName} invited you to join ${workspaceName} — DegiTasks`,
        html,
      }),
    })

    const resBody = await res.text()
    console.log('Resend response status:', res.status, 'body:', resBody)

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Email send failed: ${resBody}` }), { status: 500, headers: CORS_HEADERS })
    }

    console.log('Invite email sent successfully to:', email)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS_HEADERS })

  } catch (e) {
    console.error('Resend fetch error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS })
  }
})
