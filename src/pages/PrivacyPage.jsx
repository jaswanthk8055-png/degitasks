export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 24px', fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginBottom: 32, fontSize: 14 }}>Last updated: June 2026</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>About DegiTask</h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#333', marginBottom: 24 }}>
        DegiTask is an internal task management tool built exclusively for Degi Trans Pvt Ltd team
        members. It is not a public application.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Data Storage</h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#333', marginBottom: 24 }}>
        All data — including tasks, boards, user profiles, and workspace information — is stored
        securely in Supabase (PostgreSQL). Data is protected by Row-Level Security policies and is
        only accessible to authenticated team members of Degi Trans Pvt Ltd.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Data Sharing</h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#333', marginBottom: 24 }}>
        No data is shared with third parties. DegiTask does not sell, rent, or disclose any user
        or organisational data to external parties.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Microsoft Teams Integration</h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#333', marginBottom: 24 }}>
        When used as a Microsoft Teams Tab App, DegiTask operates within the Teams iframe. No
        additional data is collected from the Teams environment beyond what is required to display
        the app and deliver morning reminder notifications via Incoming Webhooks.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Contact</h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#333' }}>
        For any privacy-related questions, contact the Degi Trans IT team.
      </p>
    </div>
  );
}
