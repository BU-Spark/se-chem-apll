# Student submission browser tests

These tests run the production student pages, instructor gradebook, API handlers, Prisma queries and submission service in an isolated Next.js fixture. Only authentication and the video player are substituted. Authentication/authorization has separate API tests; the controllable player exercises the video-end boundary without external media. Production configuration has no authentication bypass.

Use Node 22.20.0. Generate Prisma and apply the repository migrations to a dedicated local `spark_submission_test` database before running. The tests create fictional data there and preserve immutable records rather than deleting history. They reject nonlocal or differently named databases.

```sh
npx prisma generate
npx playwright install chromium
SUBMISSION_TEST_DATABASE_URL=postgresql://localhost:5432/spark_submission_test npm run test:browser
```

Alternatively set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chromium/Chrome executable. The browser uses a fresh isolated profile. Port 3107 must be free; tests never reuse an existing app server. Run one suite at a time because the fixture uses a fixed test student.

Covered journeys: first hand-in and instructor gradebook, one improvement attempt with reload/resume, edited-content recovery without changing prior receipts, saved checkpoint answers across reload, no submission before video completion, and deadline closure during playback. Service integration tests additionally cover concurrent requests, both acknowledgement/answer arrival orders, and idempotent replay.
