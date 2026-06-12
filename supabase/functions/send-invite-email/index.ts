// Invite-to-signup email — called from the client when an invited email
// has no existing account.
// Required Supabase secrets: RESEND_API_KEY, FROM_EMAIL, APP_URL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL        = Deno.env.get('FROM_EMAIL') ?? 'DegiTasks <no-reply@degitasks.com>'
const APP_URL           = Deno.env.get('APP_URL') ?? 'https://degitasks.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  const { email, workspaceId, workspaceName, inviterName } = await req.json()
  if (!email || !workspaceId) {
    return new Response(JSON.stringify({ error: 'Missing email or workspaceId' }), { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Upsert into pending_invitations so duplicate invites are idempotent
  const { error: dbErr } = await supabase
    .from('pending_invitations')
    .upsert({ email, workspace_id: workspaceId }, { onConflict: 'email,workspace_id' })

  if (dbErr) {
    console.error('DB insert error:', dbErr)
    return new Response(JSON.stringify({ error: dbErr.message }), { status: 500 })
  }

  const signupUrl = `${APP_URL}/signup`

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <div style="background:#0073ea;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:white;font-size:20px;">You're invited to DegiTasks 🎉</h1>
      </div>
      <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 16px;">Hi there,</p>
        <p style="margin:0 0 16px;">
          <strong>${inviterName ?? 'A colleague'}</strong> has invited you to join
          <strong>${workspaceName ?? 'DegiTasks'}</strong> — a task management workspace.
        </p>
        <p style="margin:0 0 24px;">Click below to create your free account and get started:</p>
        <a href="${signupUrl}" style="display:inline-block;padding:12px 24px;background:#0073ea;color:white;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
          Accept Invitation →
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">
          Once you sign up with this email address (${email}), you'll automatically be added to the workspace.
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
      to: [email],
      subject: `${inviterName ?? 'Someone'} invited you to join ${workspaceName ?? 'DegiTasks'}`,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('Resend error:', body)
    return new Response(JSON.stringify({ error: body }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
})
