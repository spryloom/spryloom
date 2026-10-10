/**
 * Example data, added once to an app that has never had a project, so the
 * first screen shows what a real week looks like. Every row is marked
 * `example`, the app labels it as such, and an admin removes it all with one
 * button on the Team page. Addresses are @example.com, which can't receive mail,
 * and the email jobs skip example people anyway.
 */
import { addWeeks, reportingWeek } from './rules.js';

const PEOPLE = [
  ['maya.chen@example.com', 'Maya Chen'],
  ['diego.ramos@example.com', 'Diego Ramos'],
  ['priya.shah@example.com', 'Priya Shah'],
  ['sam.okafor@example.com', 'Sam Okafor'],
  ['jordan.lee@example.com', 'Jordan Lee'],
  ['aisha.bello@example.com', 'Aisha Bello'],
  ['tom.baker@example.com', 'Tom Baker'],
  ['alex.kim@example.com', 'Alex Kim'],
  ['nora.patel@example.com', 'Nora Patel'],
  ['lena.fischer@example.com', 'Lena Fischer'],
];
const at = (first) => `${first}@example.com`;
const maya = at('maya.chen'); const diego = at('diego.ramos'); const priya = at('priya.shah'); const sam = at('sam.okafor');
const jordan = at('jordan.lee'); const aisha = at('aisha.bello'); const tom = at('tom.baker'); const alex = at('alex.kim');
const nora = at('nora.patel'); const lena = at('lena.fischer');

/**
 * Updates by week, oldest first. Week 3 is the week being reported on now, and
 * some people haven't checked in yet, as on any real Monday.
 * Each update: [person, status, what moved, blocked or need help, next].
 */
const PROJECTS = [
  {
    name: 'Checkout redesign',
    summary: 'One-page checkout with saved cards, to cut drop-off at payment.',
    lead: maya,
    people: [maya, diego, priya, sam],
    weeks: [
      [
        [maya, 'on_track', 'Final designs signed off by Growth. Usability test booked with 6 customers.', '', 'Run the usability sessions and write up the top 5 issues.'],
        [diego, 'on_track', 'Address form rebuilt with autocomplete. Old form behind a flag.', '', 'Card form, then wire up saved cards.'],
        [priya, 'on_track', 'Event tracking plan agreed for every checkout step.', '', 'Build the funnel dashboard.'],
        [sam, 'on_track', 'Payments sandbox account requested from the provider.', '', 'Start the saved-cards API once sandbox access lands.'],
      ],
      [
        [maya, 'on_track', 'Usability sessions done. Biggest issue: people miss the promo code field.', '', 'Move promo code above the total; share findings with Design.'],
        [diego, 'on_track', 'Card form done, passes accessibility checks on mobile and desktop.', '', 'Saved cards UI.'],
        [priya, 'on_track', 'Funnel dashboard live with last 30 days as a baseline.', '', 'Add a mobile vs desktop split.'],
        [sam, 'at_risk', 'Saved-cards API stubbed against mocks.', 'Still no sandbox access from the payments provider after 8 days.', 'Chase the provider; keep building on mocks.'],
      ],
      [
        [maya, 'at_risk', 'Promo code change shipped to 10% of traffic. Early numbers look good.', 'Sandbox delay may push saved cards past the end-of-month release.', 'Decide by Wednesday whether saved cards ships in phase 2.'],
        [diego, 'on_track', 'Saved cards UI built against mocks, behind a flag.', '', 'Pair with Sam on the real API as soon as sandbox lands.'],
        [priya, 'on_track', 'Promo code experiment: checkout completion up 3.1% so far.', '', 'Keep it running another week for significance.'],
        [sam, 'blocked', 'Escalated through our account manager.', 'Payments sandbox access. Need someone with a vendor relationship to push.', 'Integrate the real API the day access arrives.'],
      ],
      [
        [maya, 'at_risk', 'Agreed with Growth: saved cards moves to phase 2 if sandbox is not here by Friday.', 'Need a go or no-go from Leadership on splitting the release.', 'Write the phase 2 plan and dates.'],
        [diego, 'on_track', 'Checkout flag at 50%. No error spike.', '', 'Go to 100% on Thursday if the numbers hold.'],
        [sam, 'at_risk', 'Sandbox access arrived Thursday. First test payment went through.', '', 'Saved cards end to end in sandbox.'],
      ],
    ],
  },
  {
    name: 'Mobile app 3.0',
    summary: 'New home screen, offline mode and push notifications for iOS and Android.',
    lead: jordan,
    people: [jordan, aisha, tom, priya],
    weeks: [
      [
        [jordan, 'on_track', 'Release candidate 1 cut for both platforms.', '', 'Internal testing with 40 staff.'],
        [aisha, 'on_track', 'Offline mode sync rewritten; conflict cases covered by tests.', '', 'Battery profiling on older Android phones.'],
        [tom, 'on_track', 'Push notification service load-tested at 3x expected volume.', '', 'Turn on for staff builds.'],
        [priya, 'on_track', 'Analytics events added to the new home screen.', '', 'Check events in the staff build.'],
      ],
      [
        [jordan, 'at_risk', 'Staff testing found 14 bugs, 3 serious. Fixes under way.', 'Two serious bugs are in offline sync and could slip the date.', 'Re-cut RC2 on Thursday.'],
        [aisha, 'at_risk', 'Fixed one of the two sync bugs.', 'The other only reproduces on Android 12. Need a test device.', 'Find a device; fix and add a regression test.'],
        [tom, 'on_track', 'Push enabled for staff; delivery rate 99.2%.', '', 'Write the notification settings screen copy with Design.'],
      ],
      [
        [jordan, 'blocked', 'Submitted RC2 to both stores.', 'Apple rejected the build: the account deletion flow is missing from settings. Needs Legal sign-off on the wording.', 'Get the deletion wording approved and resubmit.'],
        [aisha, 'on_track', 'Android 12 sync bug fixed and covered by a test.', '', 'Help Tom with the deletion flow.'],
        [tom, 'at_risk', 'Account deletion flow built behind a flag.', 'Waiting on Legal for the wording.', 'Ship as soon as the wording is approved.'],
        [priya, 'on_track', 'Dashboards ready for launch day.', '', 'Nothing more until launch.'],
      ],
      [
        [jordan, 'blocked', 'Escalated to Legal on Tuesday, no reply yet.', 'Still waiting on Legal for the account deletion wording. The launch date slips a day for every day this waits.', 'Resubmit within an hour of getting the wording.'],
        [aisha, 'on_track', 'Battery use down 18% on older Android phones.', '', 'Ready for resubmission.'],
        [priya, 'on_track', 'Added a crash-free sessions chart to the launch dashboard.', '', 'Watch launch metrics.'],
      ],
    ],
  },
  {
    name: 'Data warehouse migration',
    summary: 'Move reporting from the old warehouse to the new one, then switch the old one off.',
    lead: alex,
    people: [alex, sam, nora],
    weeks: [
      [
        [alex, 'on_track', '22 of 40 reports moved and checked against the old numbers.', '', 'Finance reports next.'],
        [sam, 'on_track', 'Nightly loads running in the new warehouse for a week with no failures.', '', 'Add alerting on late loads.'],
        [nora, 'on_track', 'Access review done for the new warehouse.', '', 'Remove old warehouse access for people who left.'],
      ],
      [
        [alex, 'on_track', '29 of 40 reports moved. Finance signed off on revenue numbers.', '', 'Marketing reports.'],
        [sam, 'on_track', 'Late-load alerts go to the data channel.', '', 'Backfill 2023 history.'],
        [nora, 'on_track', 'Old access removed for 11 people.', '', 'Quarterly access review template.'],
      ],
      [
        [alex, 'on_track', '35 of 40 reports moved.', '', 'The last five are the hard ones: attribution reports.'],
        [sam, 'on_track', '2023 history backfilled and reconciled.', '', '2022 history.'],
      ],
      [
        [alex, 'at_risk', '37 of 40 reports moved.', 'Attribution numbers differ by 4% from the old warehouse. Need an hour with Marketing to agree which is right.', 'Book that hour and settle the attribution numbers.'],
        [sam, 'on_track', '2022 history backfilled.', '', 'Plan the switch-off date with Alex.'],
        [nora, 'on_track', 'Access review template shared with team leads.', '', 'Collect the first round of reviews.'],
      ],
    ],
  },
  {
    name: 'SOC 2 audit prep',
    summary: 'Get evidence and policies ready for the Type II audit window in January.',
    lead: nora,
    people: [nora, diego, lena],
    weeks: [
      [
        [nora, 'at_risk', 'Gap assessment done: 9 controls need evidence.', 'Need an owner for vendor reviews.', 'Assign owners for all 9 controls.'],
        [lena, 'on_track', 'Security policy drafts for the 4 missing policies.', '', 'Review with Nora.'],
      ],
      [
        [nora, 'on_track', 'Owners assigned for all 9 controls. Vendor reviews owned by Lena.', '', 'Weekly evidence check-ins with owners.'],
        [diego, 'on_track', 'Code review evidence exported for the last 6 months.', '', 'Change management evidence.'],
        [lena, 'on_track', 'Policies approved. 6 of 22 vendor reviews done.', '', '8 more vendor reviews.'],
      ],
      [
        [nora, 'on_track', '5 of 9 controls have full evidence.', '', 'Mock audit walkthrough with the auditors.'],
        [diego, 'on_track', 'Change management evidence collected.', '', 'Help with access review evidence.'],
        [lena, 'on_track', '14 of 22 vendor reviews done.', '', 'The rest of the vendor reviews.'],
      ],
      [],
    ],
  },
  {
    name: 'Partner API v2',
    summary: 'Versioned public API with webhooks, for the three launch partners.',
    lead: tom,
    people: [tom, lena, aisha],
    weeks: [
      [
        [tom, 'on_track', 'Webhook delivery with retries done.', '', 'API keys per partner.'],
        [lena, 'on_track', 'Security review of the auth design passed.', '', 'Rate limits.'],
      ],
      [
        [tom, 'on_track', 'API keys per partner with rotation.', '', 'Docs site draft.'],
        [lena, 'on_track', 'Rate limits in place and load-tested.', '', 'Pen test scheduling.'],
        [aisha, 'on_track', 'Reference client written for the docs.', '', 'Examples for each endpoint.'],
      ],
      [
        [tom, 'on_track', 'Docs draft reviewed by the first partner. Good feedback.', '', 'Partner terms with Legal.'],
        [lena, 'on_track', 'Pen test booked for next week.', '', 'Fix whatever the pen test finds.'],
        [aisha, 'on_track', 'Examples for all 18 endpoints.', '', 'Sandbox environment for partners.'],
      ],
      [
        [tom, 'blocked', 'Partner sandbox ready.', 'Partners can\'t get keys until the partner terms are signed, and Legal has not started the review.', 'Get the terms on Legal\'s list this week.'],
        [lena, 'at_risk', 'Pen test found 2 medium issues, both fixed. Retest booked.', '', 'Retest on Wednesday.'],
        [aisha, 'on_track', 'Sandbox environment live and seeded with test data.', '', 'Onboarding guide for partners.'],
      ],
    ],
  },
];

export async function seedExamples(pool, today) {
  const now = reportingWeek(today);
  const weeks = [addWeeks(now, -3), addWeeks(now, -2), addWeeks(now, -1), now];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [email, name] of PEOPLE) {
      await client.query('INSERT INTO people (email, name, example) VALUES ($1, $2, true) ON CONFLICT (email) DO NOTHING', [email, name]);
    }
    for (const p of PROJECTS) {
      const { rows: [project] } = await client.query(
        `INSERT INTO projects (name, summary, lead, example, created_at) VALUES ($1, $2, $3, true, $4::date) RETURNING id`,
        [p.name, p.summary, p.lead, weeks[0]],
      );
      for (const email of p.people) await client.query('INSERT INTO members (project_id, email, added_at) VALUES ($1, $2, $3::date)', [project.id, email, weeks[0]]);
      for (const [i, list] of p.weeks.entries()) {
        for (const [email, status, moved, blockers, next] of list) {
          // Written on the Friday of their week; blockers from finished weeks were dealt with by the lead.
          const written = `${weeks[i]}T16:00:00Z`;
          const handled = i < 3 && blockers && status !== 'blocked' ? p.lead : null;
          await client.query(
            `INSERT INTO updates (project_id, email, week, status, moved, blockers, next, example, created_at, updated_at, handled_by, handled_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8::timestamptz + interval '4 days', $8::timestamptz + interval '4 days', $9, CASE WHEN $9::text IS NULL THEN NULL ELSE $8::timestamptz + interval '6 days' END)`,
            [project.id, email, weeks[i], status, moved, blockers, next, written, handled],
          );
        }
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
