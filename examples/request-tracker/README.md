# Request Tracker starter

This is the M1 reference app for the builder-to-coworker journey. It demonstrates a small shared workflow without adding another authentication system:

- any signed-in coworker can submit a request;
- a request can be assigned to a coworker;
- the assignee or an app admin can change `open`, `in_progress`, and `done` status;
- signed-in coworkers can add comments to keep the handoff in one place;
- signed-in owners and coworkers can download a CSV export of requests and comments;
- data is stored in the app's own Postgres database;
- requests are shown 20 at a time with Previous page and Next page controls;
- an unsigned request is rejected before the app renders anything.

Publish this folder with `spry publish`. Set `access.visibility` to `invited`, publish, then use the dashboard Share action to invite a coworker.
