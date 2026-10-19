This is a template for Spark! DS 519 projects. It has pre-configured eslint.config.mjs - ([`ESLint`](https://eslint.org/)) and .prettierrc - ([`Prettier`](https://prettier.io/)) to reflect industry standard development guidelines.

## Setting Up Your Developer Experience

To get the most out of ESLint and Prettier, It is recommended to make the changes to you IDE:

#### Add this code to your _.vscode/settings.json_

```json
{
  "editor.formatOnSave": true,
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

#### Download these VSCode extensions:

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Getting Started

This template uses Next.js. If you havent used Next before or need more information, take a look here:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

To run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the result. Do not use Microsoft Edge 🤮

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Testing Your Application

This template comes pre-configured with a robust testing setup to help you ensure code quality and maintainability. We use [Jest](https://jestjs.io/) as the testing framework and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for testing React components.

<details>
  <summary><strong>Key Testing Features & Configuration</strong></summary>

#### Integrated Tools

- **Jest:** A delightful JavaScript Testing Framework with a focus on simplicity. It works out of the box for most Next.js projects.
- **React Testing Library (RTL):** Provides light-weight utility functions on top of `react-dom` and `react-dom/test-utils`, in a way that encourages better testing practices. Its primary guiding principle is: _"The more your tests resemble the way your software is used, the more confidence they can give you."_
- **`@testing-library/jest-dom`:** Custom Jest matchers to extend Jest with useful assertions for DOM states (e.g., `toBeInTheDocument()`, `toHaveClass()`).

#### Configuration Files

- **`jest.config.ts`:** The main configuration file for Jest. It defines how Jest discovers and runs your tests, what environment to use (e.g., `jsdom` for browser-like environment), and any transformations needed (e.g., using `ts-node` for TypeScript).
- **`jest.setup.ts`:** This file is run before each test suite. It's used for global test setup, such as importing `@testing-library/jest-dom` to make its matchers available in all tests, or for setting up global mocks (like the `window.matchMedia` mock included in this template).

#### Test File Location

- Tests are co-located with the components or modules they are testing. For example, tests for `MyComponent.tsx` would typically be in a file named `MyComponent.test.tsx` within the same directory. This makes it easy to find and manage tests alongside the code they cover. Our `jest.config.ts` is set up to discover these `*.test.tsx` (and `*.test.ts`) files.

</details>

<details>
  <summary><strong>Running Tests</strong></summary>

You can run your tests using the following npm scripts:

- **`npm test`**: Runs all tests once. This is also the command used by the automated pre-commit and pre-push hooks.
  ```bash
  npm test
  ```
- **`npm run test:watch`**: Runs tests in watch mode. Jest will re-run tests related to changed files, which is very useful during development.
  ```bash
  npm run test:watch
  ```
- **`npm run test:coverage`**: Runs all tests and generates a code coverage report. This helps you see what percentage of your codebase is covered by tests. The report will be generated in a `coverage/` directory.
  ```bash
  npm run test:coverage
  ```
  </details>

<details>
  <summary><strong>Automated Testing with Husky</strong></summary>

To maintain code quality and prevent regressions, this template uses [Husky](https://typicode.github.io/husky/) to manage Git hooks. The following hooks are configured:

- **`pre-commit`**: Before any commit is finalized, this hook runs:

  1.  `npx lint-staged`: Lints and formats staged files (`*.{js,jsx,ts,tsx}`) using ESLint and Prettier.
  2.  `npm test`: Runs the entire test suite.
      If either linting/formatting fails or any test fails, the commit will be aborted, allowing you to fix the issues before committing.

- **`pre-push`**: Before any push to a remote repository, this hook runs:
  1.  `npm test`: Runs the entire test suite.
      If any test fails, the push will be aborted.

This ensures that your codebase remains well-formatted, lint-free, and that all tests are passing before changes are shared or integrated.

</details>

<details>
  <summary><strong>Testing Philosophy</strong></summary>

- **Focus on User Behavior:** Write tests that verify the functionality of your components from a user's perspective. React Testing Library encourages this by providing utilities to query and interact with the DOM in a way similar to how a user would.
- **Unit & Integration Tests:** Aim for a healthy mix of unit tests (testing individual functions or components in isolation) and integration tests (testing how multiple components work together).
- **Confidence, Not Coverage Alone:** While code coverage is a useful metric, the primary goal of testing is to give you confidence that your application works as expected. Prioritize tests that cover critical user flows and complex logic.
- **Readable and Maintainable Tests:** Write clear, concise, and well-structured tests. Like your application code, test code should also be maintainable.
</details>

## Managing Environment Variables

Properly managing environment variables is crucial for security and for configuring your application differently across various environments (development, testing, production). Next.js has built-in support for environment variables.

- **Key File: `.env.local`**: Use this for your local development. It **must** be added to `.gitignore` to protect sensitive information like API keys.
- **Client-Side Variables**: To expose a variable to the browser, prefix it with `NEXT_PUBLIC_` (e.g., `NEXT_PUBLIC_ANALYTICS_ID`). These are accessible via `process.env.NEXT_PUBLIC_YOUR_VARIABLE`. **Never store secrets in `NEXT_PUBLIC_` variables.**
- **Server-Side Variables**: Variables without the `NEXT_PUBLIC_` prefix (e.g., `DATABASE_URL`) are only available server-side via `process.env.YOUR_VARIABLE`.
- **Best Practice: `.env.example`**: Create an `.env.example` file in your project root. This file should list all environment variables your application needs, with placeholder values. It **should be committed to version control** as a template for other developers.

For more comprehensive details, refer to the [official Next.js documentation on environment variables](https://nextjs.org/docs/pages/building-your-application/configuring/environment-variables).

## Adding Additional Tech

Most projects will require the use of other technologies. Below are a few guides and recommedations for integrating commonly used software into your Next.js project.

- [Next.js Setup w/ Prisma](https://www.dhiwise.com/post/the-ultimate-guide-to-next-js-prisma-setup)
- [Emotion & Next.js](https://www.dhiwise.com/post/implementing-nextjs-emotions-in-your-project) - Emotion is the default CSS-in JS library for all new Spark! projects. Use Emotion instead of styled-components, as styled-components is not as easily compatible with Server Side Rendering, or Typed CSS variables. Emotion is also more readily compatible with a wide array of component libraries.
- [Clerk Setup w/ Next.js](https://clerk.com/docs/quickstarts/nextjs) - Clerk will be the default user authentication software for all new Spark! projects. Please reach out to Omar for creating and retrieving API keys for your project. Do NOT use firebase/auth even if your project uses Firestore.
- ### Component Libraries
  All new projects will be required to use a [design system](https://www.figma.com/blog/design-systems-101-what-is-a-design-system/) You will receive designs from your DS488 design team which will utilize a design kit. Use the corresponding component library to implement those designs on the front end of your project.

## Checkpoint CSV authoring

The node editor's **Checkpoints** step supports CSV import, export, and a downloadable sample. Author content before choosing a video: checkpoint timestamps may stay blank in drafts and must be assigned before publication. Existing quiz-bank CSV files retain their original format.

Checkpoint CSV uses one row per question or informational note. Its header is:

```csv
checkpoint_key,checkpoint_order,item_order,checkpoint_seconds,placement_hint,type,prompt,choice_1,choice_2,choice_3,choice_4,choice_5,choice_6,choice_7,choice_8,correct,answer_mode,expected_answer,minimum_answer,maximum_answer
```

- All columns must be present. `checkpoint_seconds` and `placement_hint` cells may be blank.
- `checkpoint_key` is a case-sensitive label scoped to the node. Matching keys group rows, even if they are not adjacent. Keys are preserved on export and are not database IDs.
- `checkpoint_order` and `item_order` are positive integers; gaps are allowed. Group order must agree across its rows, and item order must be unique within each group.
- Nonblank timestamps and placement hints must agree within a group. Timestamps are non-negative whole seconds and cannot be shared by different groups. Blank timing remains unplaced; zero means the start of the video.
- Types are `multipleChoice`, `shortAnswer`, and `note`. Notes use `prompt` and leave all answer cells blank. Multiple choice supports 2–8 choices and one-based correct indices, such as `"1,3"`. Numeric answers use `exact` or `range` mode.
- Import previews the groups and errors before applying anything. Any error blocks the entire import. Limits are 2 MB and 5,000 item records.
- Append places imported groups after existing groups and rejects key/time collisions. Replace requires confirmation. Neither mode saves automatically.
- After CSV import, use the separate **Assign checkpoint timestamps** screen to review collapsible groups, assign the current video time, or enter a time as minutes:seconds. **Assign timestamps** reopens this screen from the checkpoint editor. Group tags in the editor are read-only. Drafts can remain unplaced; publication cannot.
- Timing and ordering edits retain checkpoint/question IDs. Content with student responses cannot be replaced, removed, or rewritten; create a new node for revised content.

Before deploying this feature, apply the `20261012000000_untimed_checkpoints` Prisma migration with your normal migration deployment process (`npx prisma migrate deploy`). It backfills keys for existing checkpoints and allows null timestamps without changing existing IDs or responses. Regenerate the Prisma client with `npx prisma generate` after updating the schema.


To run the opt-in PostgreSQL checkpoint tests, provision a **dedicated local database** whose name starts with `spark_checkpoint_test`, with the current schema and migrations applied, then run:

```bash
CHECKPOINT_TEST_DATABASE_URL='postgresql://localhost:5432/spark_checkpoint_test' npm test -- --runInBand --runTestsByPath app/utils/saveCheckpoints.integration.test.ts
```

The suite uses only this explicit URL, creates and removes its own fixtures, and checks swaps, response protection, atomic rollback, and 5,000-record saves with simulated query latency under the default transaction timeout. Ordinary `npm test` runs skip the database suite when this variable is absent. Database write batches are limited to 500 rows and approximately 1 MiB of serialized data (a single larger row cannot be split).

## Application authentication and administration

Clerk verifies sessions; PostgreSQL stores application roles. `User.clerkUserId`
uniquely links a verified Clerk identity to the existing `Student` table. The app
never takes the caller's identity from request JSON, query parameters, or custom
headers. Clerk metadata is not used for authorization.

- `appRole`: `STUDENT`, `INSTRUCTOR`, or null (role selection is incomplete).
- `platformRole`: `MEMBER` by default, or `ADMIN`. Admin access is independent of
  the student/instructor debug mode.
- `/select-role` and `/debug-role` remain available to signed-in users. They can
  update only their own application role. This intentionally permits instructor
  self-selection during the current development/demo phase.
- `/admin` provides user search, role management, and links to platform-wide
  content, enrollment, and gradebook management. Only admins can grant/revoke
  admin access. Unlinked email-only records cannot become admins.
- Role changes are audited in `RoleAudit`. A PostgreSQL transaction-level advisory
  lock serializes role writes across app instances, rechecks the acting admin,
  and prevents concurrent requests from removing the last admin. The bootstrap
  command uses the same lock. Database connection pooling must support ordinary
  transactions; the lock is released at transaction completion.

On first use, the server fetches the Clerk profile once to obtain the verified
primary email and display name. It creates an ordinary member or conditionally
links an unclaimed, email-matched enrollment record. Subsequent requests query by
Clerk ID without calling `currentUser()`. Name/email are snapshots; automatic
profile synchronization is not configured. No Clerk dashboard changes, custom
session claims, or webhooks are required.

### Database setup and first admin

Use Node 22.20.0. For a **new, empty PostgreSQL database**, configure `DATABASE_URL`
and `DIRECT_URL`, then run:

```bash
npx prisma migrate deploy
npx prisma generate
```

Optionally run `npm run db:seed` for demo content. The `0_init` migration creates
the historical schema; all later migrations bring it to the current version.
It was generated with Prisma 6.17 from `prisma/schema.prisma` at commit
`8d31b27032a26c3cd9c06b5c1c0fc62c31585ff8`, immediately before the first recorded
migration. Existing migration files remain unchanged.

**Existing databases: adopt the baseline before the next deploy.** Back up the
database and rehearse on a copy. Inspect `npx prisma migrate status` and the
`_prisma_migrations` records to confirm the historical migrations are applied
successfully and match the repository. Compare the database with the schema
appropriate to its applied migration version (the current `schema.prisma` only
if every later migration is applied). Investigate drift before continuing.
For an up-to-date database, the comparison command is:

```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```

Prisma's comparison does not check SQL-only CHECK constraints or triggers;
compare those with a freshly migrated reference database as well. Once verified,
record the missing baseline without executing its table-creation SQL:

```bash
npx prisma migrate resolve --applied 0_init
npx prisma migrate deploy
npx prisma migrate status
npx prisma generate
```

This preserves existing data, including Clerk links and admin grants. Never run
the baseline SQL directly on an existing schema. Do not edit already-applied
migration files or reset a database to adopt this baseline.

**Databases created using `db push`:** marking only `0_init` is insufficient;
later migrations would run against tables already at their final shape. For a
disposable database, create a new empty database and use the fresh setup above.
If data must be kept, back up and reconcile its schema and SQL-only safeguards
against a freshly migrated reference first. `db push` does not create the custom
constraints and triggers in our SQL migrations. Repair missing safeguards on a
copy and verify the data satisfies them, then mark each migration whose effects
are already present as applied with `prisma migrate resolve --applied <name>`.
Only deploy after the migration history accurately represents the database.

### Verifying migration history

Create an empty, disposable local PostgreSQL database named `spark_migration_test`:

```bash
MIGRATION_TEST_DATABASE_URL=postgresql://localhost:5432/spark_migration_test \
npm run db:verify-migrations
```

The command overrides both Prisma connection URLs for its subprocesses, refuses
non-local URLs and nonempty public schemas, and never resets or drops a database.
It replays every migration, fails on Prisma schema drift, verifies the expected
SQL-only CHECK constraints and enabled triggers, and checks a second deploy.
Recreate the disposable database before rerunning. CI runs this check on a fresh
PostgreSQL service, runs the seed, and runs the auth, submission, and checkpoint
integration suites on separately migrated databases. Update the safeguard assertions when
intentionally adding or removing SQL-only constraints or triggers.

### Granting the first admin

Sign in to the app to create/link your local user, then use the Clerk ID displayed
by the signed-in account's role page to grant admin access from a trusted terminal:

```bash
npm run admin:grant -- --clerk-user-id user_...
```

The command reads the same `.env*` configuration as Next.js, requires an already
linked account, and records a `BOOTSTRAP` audit entry. It does not change Clerk.
Open `/admin` afterward. Further role changes can be made there. The command is
idempotent and may also be used by a trusted database operator for recovery.

If a reverse proxy changes the server-visible URL origin, set `APP_ORIGINS` to a
comma-separated list of exact trusted frontend origins. Role-management endpoints
require a matching browser `Origin` header and reject cross-site requests. When
unset, the request URL's origin is used.

### Auth tests

`npm test` includes identity, authorization, role-mutation, admin UI, and debug
switch tests. PostgreSQL concurrency tests require an explicitly selected local
database named `spark_auth_test`; they delete fixtures in that dedicated database:

```bash
DATABASE_URL=postgresql://localhost:5432/spark_auth_test \
DIRECT_URL=postgresql://localhost:5432/spark_auth_test \
AUTH_TEST_DATABASE_URL=postgresql://localhost:5432/spark_auth_test \
npx jest lib/auth/auth.integration.test.ts --runInBand
```

Create that test database and apply the current schema before running the tests.
