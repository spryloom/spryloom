# Spryloom for Codex

Publish the app your agent just built to your team. Spryloom runs it at a
private address that only the people you invite can open, with a database,
scheduled jobs and email if the app asks for them. You don't set up a server,
a database or sign-in.

This plugin adds one skill. It guides the agent to write apps that publish
cleanly, and to publish them with the `spry` command when you say "share this
with my team".

Anyone can sign in with an email address; nobody has to approve you.

## Setup

You need Node.js 20.19 or later. The skill runs `spry`, or `npx -y spryloom`
when `spry` isn't installed.

1. Sign in once, in a terminal:

   ```
   npx -y spryloom login --email you@yourcompany.com
   ```

   Spryloom emails you a link and the terminal shows a short code: open the
   link, check that the page shows the same code, and approve. There is no
   password.

2. Build something, and ask:

   > Publish this so my team can use it.

   The agent writes `spryloom.yaml`, publishes the app and gives you its
   address. Ask it to invite a coworker by email.

## Privacy Policy

Spryloom's full privacy policy is at
[spryloom.com/privacy](https://spryloom.com/privacy). In short:

- When you publish, Spryloom receives the folder you publish, so it can build
  and run it. Files named `.env` or starting with `.env` are left out.
- Your app's database belongs to the app. Spryloom doesn't read inside it.
- Coworkers sign in with their email address, and Spryloom records each sign-in
  in the app's audit log.
- This plugin is instructions only. It sends nothing anywhere; `spry` talks to
  Spryloom only when it is run, and only as you.

## Documentation

- [Getting started](https://spryloom.com/docs)
- [Your app's manifest](https://spryloom.com/docs/manifest)
- Questions and feedback: [hello@spryloom.com](mailto:hello@spryloom.com)

## License

The skill and the plugin configuration are released under the MIT License. See
[LICENSE](LICENSE). The Spryloom service and the `spryloom` npm package have
their own terms, at [spryloom.com/terms](https://spryloom.com/terms).
