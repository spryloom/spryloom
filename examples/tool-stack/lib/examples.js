/**
 * The example team a new app opens with, so the first visit shows what the
 * app is for instead of an empty table.
 *
 * Everything here is made up and marked as an example: ten people at
 * example.com, sixteen tools, two requests waiting and two already decided.
 * Prices are illustrative, not quotes. Dates are counted from today, so the
 * demo never goes stale. An admin removes all of it with one button, and it
 * is never emailed.
 */
import { addDays } from './rules.js';

const PEOPLE = [
  'priya.shah', 'marcus.lee', 'dana.okafor', 'sam.rivera', 'lena.fischer',
  'tom.becker', 'aisha.khan', 'jon.park', 'mei.chen', 'ravi.menon',
].map((name) => `${name}@example.com`);
const [priya, marcus, dana, sam, lena, tom, aisha, jon, mei, ravi] = PEOPLE;
const everyone = PEOPLE;

const $ = (dollars) => Math.round(dollars * 100);

/**
 * Each tool: renewal (or trial end) in days from today, and who marked
 * "I use this". Monthly plans renew within a month; yearly ones any time in
 * the year.
 */
const TOOLS = [
  { name: 'Claude', category: 'AI assistants', website: 'https://claude.ai', plan: 'Team', pricing: 'per_seat', price: 30, billing: 'monthly', seats: 12, owner: priya, renew: 9, users: [priya, marcus, dana, sam, lena, tom, aisha, jon, mei, ravi] },
  { name: 'ChatGPT', category: 'AI assistants', website: 'https://chatgpt.com', plan: 'Team', pricing: 'per_seat', price: 300, billing: 'annual', seats: 10, owner: marcus, renew: 41, users: [marcus, sam, aisha, ravi, dana] },
  { name: 'Cursor', category: 'Engineering', website: 'https://cursor.com', plan: 'Business', pricing: 'per_seat', price: 40, billing: 'monthly', seats: 6, owner: priya, renew: 17, users: [priya, lena, tom, mei, aisha] },
  { name: 'GitHub Copilot', category: 'Engineering', website: 'https://github.com/features/copilot', plan: 'Business', pricing: 'per_seat', price: 19, billing: 'monthly', seats: 10, owner: priya, renew: 22, status: 'cancelling', users: [tom, mei], notes: 'Moving everyone to Cursor. Cancelled with GitHub; it runs to the end of this period.' },
  { name: 'GitHub', category: 'Engineering', website: 'https://github.com', plan: 'Team', pricing: 'per_seat', price: 4, billing: 'monthly', seats: 8, owner: lena, renew: 26, users: [priya, lena, tom, mei, aisha, marcus] },
  { name: 'Linear', category: 'Engineering', website: 'https://linear.app', plan: 'Business', pricing: 'per_seat', price: 168, billing: 'annual', seats: 10, owner: aisha, renew: 58, users: [priya, lena, tom, mei, aisha, dana, jon, marcus] },
  { name: 'Figma', category: 'Design', website: 'https://figma.com', plan: 'Professional', pricing: 'per_seat', price: 16, billing: 'monthly', seats: 3, owner: dana, renew: 12, users: [dana, jon] },
  { name: 'Notion', category: 'Productivity', website: 'https://notion.so', plan: 'Plus', pricing: 'per_seat', price: 120, billing: 'annual', seats: 12, owner: marcus, renew: 143, users: everyone },
  { name: 'Slack', category: 'Productivity', website: 'https://slack.com', plan: 'Pro', pricing: 'per_seat', price: 8.75, billing: 'monthly', seats: 10, owner: marcus, renew: 5, users: everyone },
  { name: 'Loom', category: 'Productivity', website: 'https://loom.com', plan: 'Business', pricing: 'per_seat', price: 180, billing: 'annual', seats: 6, owner: null, renew: 33, users: [sam, ravi] },
  { name: 'Vercel', category: 'Engineering', website: 'https://vercel.com', plan: 'Pro', pricing: 'per_seat', price: 20, billing: 'monthly', seats: 3, owner: lena, renew: 14, users: [lena, tom, priya] },
  { name: 'Sentry', category: 'Engineering', website: 'https://sentry.io', plan: 'Team', pricing: 'flat', price: 26, billing: 'monthly', seats: null, owner: null, renew: 19, users: [lena, tom, mei] },
  { name: '1Password', category: 'Security', website: 'https://1password.com', plan: 'Business', pricing: 'per_seat', price: 95.88, billing: 'annual', seats: 12, owner: marcus, renew: 201, users: everyone },
  { name: 'Perplexity', category: 'AI assistants', website: 'https://perplexity.ai', plan: 'Enterprise Pro', pricing: 'per_seat', price: 40, billing: 'monthly', seats: 4, owner: aisha, status: 'trial', trialEnds: 4, users: [aisha, sam, ravi], notes: 'Trying it for customer research. Decide before the trial ends.' },
  { name: 'Midjourney', category: 'Design', website: 'https://midjourney.com', plan: 'Pro', pricing: 'flat', price: 60, billing: 'monthly', seats: null, owner: dana, renew: 27, users: [dana, jon] },
  { name: 'Pitch', category: 'Design', website: 'https://pitch.com', plan: 'Pro', pricing: 'per_seat', price: 20, billing: 'monthly', currency: 'EUR', seats: 4, owner: ravi, renew: 36, users: [ravi, aisha, marcus], notes: 'Billed in euros by the Berlin office.' },
];

/** The example rows, with dates counted from `today`. Pure, so it can be tested. */
export function exampleData(today) {
  const tools = TOOLS.map((t, i) => ({
    key: i,
    name: t.name,
    category: t.category,
    website: t.website,
    plan: t.plan,
    pricing: t.pricing,
    price_cents: $(t.price),
    currency: t.currency ?? 'USD',
    billing: t.billing,
    seats_bought: t.seats,
    owner: t.owner,
    status: t.status ?? 'active',
    renews_on: t.renew === undefined ? null : addDays(today, t.renew),
    trial_ends: t.trialEnds === undefined ? null : addDays(today, t.trialEnds),
    notes: t.notes ?? '',
    users: t.users,
    added_days_ago: 30 + ((i * 37) % 300),
  }));
  const requests = [
    {
      kind: 'new', tool: null, tool_name: 'Granola', category: 'AI assistants', website: 'https://granola.ai',
      purpose: 'Meeting notes for customer calls, so support and sales stop retyping call summaries by hand.',
      pricing: 'per_seat', price_cents: $(14), currency: 'USD', billing: 'monthly', seats: 3, requester: sam, status: 'pending', days_ago: 1,
    },
    {
      kind: 'seat', tool: 'Figma', tool_name: 'Figma', category: 'Design', website: null,
      purpose: 'Editing the sales one-pagers without waiting on design.',
      pricing: 'per_seat', price_cents: $(16), currency: 'USD', billing: 'monthly', seats: 1, requester: ravi, status: 'pending', days_ago: 3,
    },
    {
      kind: 'seat', tool: 'Cursor', tool_name: 'Cursor', category: 'Engineering', website: null,
      purpose: 'Moving off Copilot with the rest of the team.',
      pricing: 'per_seat', price_cents: $(40), currency: 'USD', billing: 'monthly', seats: 1, requester: mei, status: 'approved', days_ago: 12,
      decided_by: marcus, reason: 'Approved. Your seat is live.',
    },
    {
      kind: 'new', tool: null, tool_name: 'Jasper', category: 'AI assistants', website: 'https://jasper.ai',
      purpose: 'Writing first drafts of outbound emails.',
      pricing: 'per_seat', price_cents: $(69), currency: 'USD', billing: 'monthly', seats: 2, requester: ravi, status: 'declined', days_ago: 20,
      decided_by: marcus, reason: 'ChatGPT Team already covers drafting, and five of its seats are free. Ask me for one.',
    },
  ];
  return { people: PEOPLE, tools, requests };
}
