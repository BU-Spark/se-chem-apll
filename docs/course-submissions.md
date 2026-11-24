# Course-specific submissions

Migration: `20261014000000_course_specific_submissions`.

This is a breaking greenfield migration. It deletes the old LessonProgress, NodeAttempt and NodeResponse activity. It preserves courses, lessons, nodes, questions, users and enrollments. Back up activity first if applying to an environment that needs its old results. New finalized history is immutable; course assignments with progress cannot be removed or cascade-deleted.

Progress is unique per student and CourseLesson. Course edits upsert existing assignments so deadlines and reordering do not replace their IDs. Attempts are assignment-specific and typed QUIZ, CHECKPOINT or REVIEW. New quiz attempts sample up to the configured quiz question count. Checkpoint tasks require answering all checkpoint questions; review-only nodes require an acknowledgement. Checkpoint correctness does not contribute to the lesson grade. Quiz pass status uses each node's passing threshold. Final submission accepts completed quizzes even if they did not pass.

A submission uses the latest completed, current-content attempt for every task. Its raw grade is the equal average of node quiz percentages. Nodes without quizzes are excluded; a lesson without quizzes is completion-only. Deadlines use server time, including inclusive due-date and late-deadline boundaries. The existing policy deducts a percentage of the earned score, with fractional hours/days prorated. Intermediate scores are not rounded. Pass status reflects node thresholds, independent of the late deduction; there is no additional lesson-level pass threshold.

The highest final submission grade is selected dynamically; ties prefer the earlier submission and then its number. No gradebook read recalculates history. Each submission snapshots the course/lesson identity, grading contributions and policy. Attempt/answer snapshots retain original question content and answer keys even after source nodes/questions are removed. Edited content requires fresh attempts; prior submissions remain available. PostgreSQL constraints and triggers enforce ownership across progress, attempts, responses and submission links and protect finalized history. Serializable transactions with retries and per-progress locking protect duplicate and concurrent requests.

Students enter via `/student/courses/[courseId]/lessons/[lessonId]`, where `lessonId` is the course assignment (`CourseLesson`) ID. The legacy `/student/assignments/[assignmentId]` page remains available. The API uses the authenticated student's email mapping, never a supplied student ID, score or timestamp. Starting an attempt and submitting a lesson require idempotency keys. Retrying completion of an already completed attempt returns its stored result. A submission receipt shows raw grade, deduction and final grade. Instructors use the course Gradebook tab and can expand immutable submission/answer history.

`prisma/seedSubmissions.js` adds explicitly fictional historical results to existing demo courses without replacing content or activity. Demo snapshots intentionally show different historical policies; current course policies are unchanged. The regular seed now preserves existing demo content instead of deleting finalized history.

Integration tests use a dedicated local `spark_submission_test` database only. Set DATABASE_URL and SUBMISSION_TEST_DATABASE_URL to the same dedicated database, then run `lib/submissions/service.integration.test.ts`. The repository's older migration ordering does not initialize an empty database; initialize from the previous schema and apply the new migration when testing this upgrade independently. The new migration was also applied successfully through `prisma migrate deploy` to the existing local development database.

## Automatic roadmap submissions

The node flow finishes attempts with `submitWhenReady: true`. Attempt completion, stored progress, and automatic submission share the existing serializable transaction and progress lock. A passing quiz or exhausted quiz retries makes a node terminal; both completed and incomplete nodes count toward lesson completion. The first passing foundational knowledge check exempts its video checkpoints. Nodes without quizzes finish through their checkpoints, or through **Mark reviewed** when they have no questions. Empty lessons do not auto-submit.

The service selects current-content completed attempts, requires checkpoints on paths that need them, and hashes the assignment ID and selected attempt IDs into a `roadmap:` idempotency key. Repeating the final attempt request or retrying a hand-in cannot duplicate that submission. New completed work produces a new key and immutable receipt; the best final grade remains the gradebook result. Normal retry limits are enforced on the server. After submitting the lesson, students may start one additional improvement quiz per node and content version. The legacy explicit submission action retains its completed-task eligibility.

The roadmap reads submission state without mutating it. It shows the latest receipt (raw grade, penalty percentage of earned score, final grade), the best receipt if different, deadlines, and blockers. **Retry submission** posts `action: "submitRoadmap"` with the server-provided key. The service checks that the key still describes the current eligible work; stale requests must refresh. No score, timestamp, or student identity is trusted from the browser.

A single server timestamp is used to accept the final attempt and grade its automatic submission, avoiding inconsistent decisions when a deadline passes during processing. New submissions after `CLOSED` are rejected. Existing successful keys can still replay their receipt; closed work is never automatically backdated. A finished lesson can remain `COMPLETED` with no receipt, so hand-in state must be read from submissions rather than inferred from progress status. Historical completed outcomes and prior hand-ins retain the course progress behavior; edited content reopens affected nodes through the roadmap without deleting historical work.

For rollout, use the read-only query below to identify completed work with no hand-in. Students can recover eligible work from the roadmap while the window remains open. Review closed historical assignments separately; do not manufacture past submission times or silently penalize students for the previous missing hand-in flow.

```sql
SELECT p."studentId", p."courseLessonId", p.status, p."completedAt"
FROM "CourseLessonProgress" p
WHERE NOT EXISTS (SELECT 1 FROM "LessonSubmission" s WHERE s."progressId" = p.id)
  AND (p.status = 'COMPLETED' OR p."percentComplete" = 100);
```

This query is a candidate list: older progress rows may not have stored terminal status, and stale content must still pass the service's current-content checks. The roadmap read is the authoritative eligibility check. Apply the additive `20261110000000_student_work_recovery` migration and regenerate Prisma before deploying the recovery flow.

## Updated work, improvement attempts and video completion

Content identity lives in `lib/submissions/content.ts`; the extraction preserves the existing hashes. `evaluateWork` supplies current-content task outcomes and eligibility to mutations and the roadmap. Node screens filter history to that same content key. Historical completion percentages and receipts remain intact, while courses surface updated/unfinished work and prioritize it for continuation. Updated prerequisites block new dependent work, but do not erase unchanged downstream results.

The `NodeAttempt.purpose` field distinguishes STANDARD and IMPROVEMENT work. A student may start one improvement quiz per node/content version after a lesson submission, before the window closes. Starting it reserves the allowance; an unfinished attempt can be resumed. Progress locking serializes competing requests. Standard attempts cannot bypass the limit through the legacy API. Improvement completion resubmits the latest completed work using the existing deterministic hand-in key; the best penalized grade remains the gradebook result.

`draftAnswers` stores checkpoint answers without creating finalized responses. `saveCheckpoint` validates and saves each answer; it can also receive a video-end acknowledgement. An attempt only finalizes when all answers and the required acknowledgement exist. The browser waits for the end before acknowledging or offering its final Continue action, and reloads restore the saved answers. The generic finish action enforces the same video requirement, including the legacy page's explicit acknowledgement. This is a playback acknowledgement, not proof of attention. Finalization and hand-in use server time; closing the window preserves drafts but rejects completion. Previously completed attempts are grandfathered and remain immutable.

The migration adds fields with backward-compatible defaults and does not rewrite finalized attempts or receipts. Existing unfinished checkpoints remain resumable; they require video acknowledgement before finalizing. No historical submission timestamps are manufactured.

Run `npm run test:browser` with `SUBMISSION_TEST_DATABASE_URL` set to the dedicated local database. See `test/browser/README.md` for the isolated browser fixture and browser installation options.
