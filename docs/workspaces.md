# Content workspaces

Workspaces share the same node and lesson records between accounts. Courses,
enrollments, student records and gradebooks keep their existing authorization.

Open **Workspaces** in the instructor navigation, role selector, or student profile.
The workspace creator becomes its Owner. Invite a recipient by email, choose a
role, and share the generated invitation link. The recipient must sign in and
accept using a currently verified Clerk email matching the invitation. No email
is sent automatically. Links expire after seven days and can be revoked.

## Fixed roles

| Permission                                | Owner | Admin | Editor | Viewer |
| ----------------------------------------- | ----- | ----- | ------ | ------ |
| Read workspace content                    | Yes   | Yes   | Yes    | Yes    |
| Create/edit content                       | Yes   | Yes   | Yes    | No     |
| Delete unused content                     | Yes   | Yes   | No     | No     |
| Invite/manage Editors and Viewers         | Yes   | Yes   | No     | No     |
| Appoint/manage Admins                     | Yes   | No    | No     | No     |
| Rename workspace                          | Yes   | Yes   | No     | No     |
| Transfer ownership/delete empty workspace | Yes   | No    | No     | No     |

There is one Owner. Transferring ownership makes the previous Owner an Admin.
Role changes and invitation acceptance are serialized per workspace. An outstanding
invitation cannot bypass removal or demotion of its inviter. Platform Admins retain
their existing override; workspace roles never grant platform privileges or change
an account's app role. Workspace content access works without instructor mode.

## Content ownership and dependencies

- Personal content keeps its existing owner-based authorization. Seed content is
  still identified by a null owner and null workspace.
- Workspace content is authorized through current membership. Its creator ID is
  attribution only. Removal revokes access even to content that member created.
- New content explicitly targets Personal or a workspace. The instructor lists
  include accessible workspace content and identify its library.
- Workspace lessons may reference nodes in the same workspace or seed nodes.
  Personal lessons use accessible personal/seed nodes. Workspace nodes should be
  assembled into a workspace lesson before assignment to a course.
- **Move personal content here** transfers existing records without changing IDs,
  attribution, or course assignments. Explicitly select a lesson and its personal
  node dependencies together. Moving a node requires moving all personal lessons
  referencing it. Another instructor's content and seed content cannot be moved.
- Copies remain independent. The copy API checks every nested source resource;
  browsing or copying another instructor's private content is no longer allowed.
  Choose Personal, a workspace, or an editable destination lesson/course. Node
  copies appended to a workspace lesson inherit that lesson's workspace.
- Nodes referenced by a lesson cannot be deleted. Lessons with student activity
  retain their existing deletion restriction. Only empty workspaces can be deleted.
- Existing course assignments continue delivering lessons to enrolled students.
  Assignment metadata visible to course instructors is separate from authoring
  access; attaching content grants no workspace membership or editing permission.
  After membership removal, course owners can still edit existing assignment schedules;
  adding another lesson requires current library access.

Membership, invitations, settings, ownership transfers and content moves are recorded
in `WorkspaceAudit`. Invitation tokens are stored as hashes, not reusable plaintext.

## Deployment

The additive migration is `20261123000000_content_workspaces`. It gives existing
nodes and lessons a null `workspaceId`; it does not reassign content or create
memberships. Deploy the migration before running the new application:

```sh
npx prisma migrate deploy
npx prisma generate
```

Create a pilot workspace, invite collaborators, then move the selected personal
library into it. Revoke temporary platform-admin privileges separately after
confirming workspace access; this feature does not change platform roles.

## Validation

Run the normal suite with `npm test -- --runInBand`. Database-backed workspace
coverage is opt-in and refuses any database except a local `spark_workspace_test`
whose URL matches `DATABASE_URL`. Use a disposable database: each case truncates
its data and dependent rows.

```sh
export WORKSPACE_TEST_DATABASE_URL='postgresql://localhost/spark_workspace_test'
export DATABASE_URL="$WORKSPACE_TEST_DATABASE_URL"
export DIRECT_URL="$WORKSPACE_TEST_DATABASE_URL"
npx prisma migrate deploy
npx jest --runInBand lib/workspaces/workspaces.integration.test.ts
```

This covers real API reads, edits, creation and deletion; creator revocation;
student/Viewer restrictions; references; role escalation; ownership concurrency;
invitation email binding, replay, revocation and expiry; atomic content moves;
and copy bypasses. Concurrency regressions also exercise lesson saves racing with
content moves and node copies racing with a destination move. Dependency writers
lock lessons before nodes (sorted by ID) and validate within the same transaction.

Custom roles, automated invitation emails, moving content out of/between
workspaces, and simultaneous-edit merging are deferred. Editing shared content
changes the underlying record wherever it is used; saves do not merge concurrent
changes automatically.

## Local learning-flow fixtures

To add published lessons to an existing Clerk-linked account in local `spark_dev`:

```sh
npm run db:seed:flow -- --email akash01@bu.edu
```

The additive script uses the account’s Chemistry workspace (or creates a dedicated
flow-testing workspace), creates three lessons and six nodes, and enrolls the
account as a student in **Chemistry — flow testing**. Lessons open immediately
and are due in 7, 10, and 14 days. Switch to Student to test the learning flow;
the script leaves app and platform roles unchanged. Stable fixture IDs prevent
duplicates, and reruns refresh assignment dates without resetting progress or
replacing edited content. This script refuses remote databases.
