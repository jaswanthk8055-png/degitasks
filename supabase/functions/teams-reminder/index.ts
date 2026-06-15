import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TEAMS_WEBHOOK_URL = Deno.env.get('TEAMS_WEBHOOK_URL')!;
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async () => {
  const today = new Date().toISOString().split('T')[0];

  const { data: dueTasks } = await supabase
    .from('tasks')
    .select('title, status, assignee:profiles(full_name)')
    .eq('due_date', today)
    .neq('status', 'Done');

  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('title, due_date, assignee:profiles(full_name)')
    .lt('due_date', today)
    .neq('status', 'Done');

  if (!dueTasks?.length && !overdueTasks?.length) {
    return new Response('No tasks to report');
  }

  const dateLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const bodyItems: object[] = [
    {
      type: 'TextBlock',
      text: `📋 DegiTask Morning Briefing — ${dateLabel}`,
      weight: 'Bolder',
      size: 'Medium',
      color: 'Accent',
    },
  ];

  if (dueTasks?.length) {
    bodyItems.push({
      type: 'TextBlock',
      text: `🗓️ Due Today (${dueTasks.length})`,
      weight: 'Bolder',
      spacing: 'Medium',
    });
    for (const t of dueTasks) {
      bodyItems.push({
        type: 'TextBlock',
        text: `• ${t.title} — ${(t.assignee as any)?.full_name || 'Unassigned'}`,
        spacing: 'Small',
      });
    }
  }

  if (overdueTasks?.length) {
    bodyItems.push({
      type: 'TextBlock',
      text: `⚠️ Overdue (${overdueTasks.length})`,
      weight: 'Bolder',
      color: 'Attention',
      spacing: 'Medium',
    });
    for (const t of overdueTasks.slice(0, 5)) {
      bodyItems.push({
        type: 'TextBlock',
        text: `• ${t.title} — due ${t.due_date}`,
        color: 'Attention',
        spacing: 'Small',
      });
    }
  }

  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.4',
          body: bodyItems,
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Open DegiTask',
              url: 'https://degitasks.degitrans.com',
            },
          ],
        },
      },
    ],
  };

  await fetch(TEAMS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });

  return new Response(
    `Reminder sent: ${dueTasks?.length ?? 0} due, ${overdueTasks?.length ?? 0} overdue`
  );
});
