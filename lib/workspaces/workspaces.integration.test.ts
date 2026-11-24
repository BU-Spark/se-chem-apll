/** @jest-environment node */
import * as access from './access';
jest.mock('./access', () => ({ __esModule: true, ...jest.requireActual('./access') }));
import { POST as postLesson } from '@/app/api/instructor/lessons/route';
import { PATCH as patchCourse } from '@/app/api/instructor/courses/[courseId]/route';
import { AsyncLocalStorage } from 'node:async_hooks';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Principal } from '@/lib/auth/policy';
import { apiAccess } from '@/lib/auth/api';
import { GET as getNode, PATCH as patchNode, DELETE as deleteNode } from '@/app/api/instructor/nodes/[nodeId]/route';
import { POST as postNode, GET as listNodes } from '@/app/api/instructor/nodes/route';
import { GET as getLesson, PATCH as patchLesson } from '@/app/api/instructor/lessons/[lessonId]/route';
import { POST as copyContent } from '@/app/api/instructor/copy/route';
import { POST as acceptRoute } from '@/app/api/workspaces/accept/route';
import { POST as inviteRoute } from '@/app/api/workspaces/[workspaceId]/invitations/route';
import { DELETE as revokeRoute } from '@/app/api/workspaces/[workspaceId]/invitations/[invitationId]/route';
import {
  createWorkspace,
  changeMember,
  inviteMember,
  acceptInvitation,
  transferOwnership,
  movePersonalContent,
} from './service';
import { nodeLibraryScope } from './permissions';
const mockSession = new AsyncLocalStorage<Principal>();
const mockVerified = new Map<string, string[]>();
jest.mock('@/lib/auth/identity', () => ({ getAppUser: async () => mockSession.getStore() ?? null }));
jest.mock('@clerk/nextjs/server', () => ({
  currentUser: async () => {
    const user = mockSession.getStore();
    return user
      ? {
          id: user.clerkUserId,
          emailAddresses: (mockVerified.get(user.id) ?? [user.email]).map((emailAddress) => ({
            emailAddress,
            verification: { status: 'verified' },
          })),
        }
      : null;
  },
}));
const enabled = process.env.WORKSPACE_TEST_DATABASE_URL;
if (
  enabled &&
  (!['localhost', '127.0.0.1'].includes(new URL(enabled).hostname) ||
    new URL(enabled).pathname !== '/spark_workspace_test' ||
    process.env.DATABASE_URL !== enabled)
)
  throw new Error('Dedicated local spark_workspace_test database required.');
const suite = enabled ? describe : describe.skip;
const req = (body: unknown, method = 'POST') =>
  new NextRequest('http://localhost/api/test', { method, body: JSON.stringify(body) });
const nodeContext = (nodeId: string) => ({ params: Promise.resolve({ nodeId }) });
const lessonContext = (lessonId: string) => ({ params: Promise.resolve({ lessonId }) });
const workspaceContext = (workspaceId: string) => ({ params: Promise.resolve({ workspaceId }) });
const as = <T>(user: Principal, fn: () => T) => mockSession.run(user, fn);
suite('workspace authorization against PostgreSQL', () => {
  jest.setTimeout(30000);
  let owner: Principal,
    admin: Principal,
    editor: Principal,
    viewer: Principal,
    outsider: Principal,
    platformAdmin: Principal;
  let workspaceId: string, nodeId: string, lessonId: string;
  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "Workspace", "WorkspaceAudit", "Node", "Lesson", "Student" CASCADE`;
    mockVerified.clear();
    const users = await Promise.all(
      ['owner', 'admin', 'editor', 'viewer', 'outsider', 'platform'].map(async (name) => {
        const user = await prisma.user.create({
          data: {
            email: `${name}@example.com`,
            clerkUserId: `user_${name}`,
            appRole: name === 'viewer' ? 'STUDENT' : 'INSTRUCTOR',
            platformRole: name === 'platform' ? 'ADMIN' : 'MEMBER',
          },
        });
        return { ...user, clerkUserId: user.clerkUserId! };
      })
    );
    [owner, admin, editor, viewer, outsider, platformAdmin] = users;
    workspaceId = (await createWorkspace(owner, 'Chemistry')).id;
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId, userId: admin.id, role: 'ADMIN' },
        { workspaceId, userId: editor.id, role: 'EDITOR' },
        { workspaceId, userId: viewer.id, role: 'VIEWER' },
      ],
    });
    nodeId = (
      await prisma.node.create({
        data: { title: 'Shared', createdByClerkId: owner.clerkUserId, workspaceId, isDraft: true },
      })
    ).id;
    lessonId = (
      await prisma.lesson.create({
        data: { title: 'Shared lesson', summary: '', isDraft: true, createdByClerkId: owner.clerkUserId, workspaceId },
      })
    ).id;
  });
  afterAll(() => prisma.$disconnect());
  it('allows owner, admin, editor and platform admin to read/edit the same node and lesson', async () => {
    for (const user of [owner, admin, editor, platformAdmin]) {
      expect((await as(user, () => getNode(req(null), nodeContext(nodeId)))).status).toBe(200);
      expect((await as(user, () => patchNode(req({ title: user.id }, 'PATCH'), nodeContext(nodeId)))).status).toBe(200);
      expect((await as(user, () => getLesson(req(null), lessonContext(lessonId)))).status).toBe(200);
      expect(
        (await as(user, () => patchLesson(req({ title: user.id }, 'PATCH'), lessonContext(lessonId)))).status
      ).toBe(200);
    }
    expect((await prisma.node.findUniqueOrThrow({ where: { id: nodeId } })).createdByClerkId).toBe(owner.clerkUserId);
  });
  it('allows viewer reads but denies writes, deletion and forged creation destinations', async () => {
    expect((await as(viewer, () => getNode(req(null), nodeContext(nodeId)))).status).toBe(200);
    expect((await as(viewer, () => patchNode(req({ title: 'bad' }), nodeContext(nodeId)))).status).toBe(403);
    expect((await as(viewer, () => patchLesson(req({ title: 'bad' }), lessonContext(lessonId)))).status).toBe(403);
    expect((await as(editor, () => deleteNode(req(null), nodeContext(nodeId)))).status).toBe(403);
    expect((await as(viewer, () => postNode(req({ workspaceId, isDraft: true })))).status).toBe(403);
    expect((await as(outsider, () => postNode(req({ workspaceId, isDraft: true })))).status).toBe(404);
    expect((await as(editor, () => postNode(req({ workspaceId, isDraft: true, title: 'New' })))).status).toBe(201);
  });
  it('hides workspace content from outsiders, including its creator after removal', async () => {
    expect((await as(outsider, () => getNode(req(null), nodeContext(nodeId)))).status).toBe(404);
    expect((await as(outsider, () => getLesson(req(null), lessonContext(lessonId)))).status).toBe(404);
    await transferOwnership(owner, workspaceId, admin.id);
    await changeMember(admin, workspaceId, owner.id, undefined, true);
    expect((await as(owner, () => getNode(req(null), nodeContext(nodeId)))).status).toBe(404);
    expect((await as(owner, () => patchNode(req({ title: 'bad' }), nodeContext(nodeId)))).status).toBe(404);
    const response = await as(owner, () => listNodes());
    expect((await response.json()).map((n: { id: string }) => n.id)).not.toContain(nodeId);
  });
  it('keeps personal/seed ownership rules and excludes workspace membership from course administration', async () => {
    const personal = await prisma.node.create({
      data: { title: 'Personal', createdByClerkId: owner.clerkUserId, isDraft: true },
    });
    const seed = await prisma.node.create({ data: { title: 'Seed', isDraft: true } });
    expect((await as(editor, () => getNode(req(null), nodeContext(personal.id)))).status).toBe(404);
    expect((await as(owner, () => patchNode(req({ title: 'Mine' }), nodeContext(personal.id)))).status).toBe(200);
    expect(
      (await as(editor, () => patchNode(req({ title: 'Seed unchanged policy' }), nodeContext(seed.id)))).status
    ).toBe(200);
    expect((await as(viewer, () => apiAccess('instructor'))).error?.status).toBe(403);
    expect(await prisma.node.count({ where: { id: personal.id, ...nodeLibraryScope(platformAdmin) } })).toBe(1);
  });
  it('does not expose seed authoring answers to ordinary students and supports workspace editors without instructor mode', async () => {
    const seed = await prisma.node.create({ data: { title: 'Seed', isDraft: false } });
    expect((await as(viewer, () => getNode(req(null), nodeContext(seed.id)))).status).toBe(404);
    await changeMember(owner, workspaceId, viewer.id, 'EDITOR');
    expect(
      (await as(viewer, () => postNode(req({ workspaceId, isDraft: true, title: 'Student editor' })))).status
    ).toBe(201);
    expect((await as(viewer, () => postNode(req({ isDraft: true })))).status).toBe(403);
    expect(
      (
        await as(viewer, () =>
          patchLesson(
            req({ lessonNodes: [{ nodeId: seed.id, sortOrder: 0, passingPercent: 80, quizQuestionCount: 0 }] }),
            lessonContext(lessonId)
          )
        )
      ).status
    ).toBe(200);
  });
  it('allows managers to delete unused content and serializes competing ownership transfers', async () => {
    expect((await as(admin, () => deleteNode(req(null), nodeContext(nodeId)))).status).toBe(204);
    const outcomes = await Promise.allSettled([
      transferOwnership(owner, workspaceId, editor.id),
      transferOwnership(owner, workspaceId, viewer.id),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } })).toBe(1);
  });
  it('checks lesson dependencies for same-workspace access and blocks deletion of used nodes', async () => {
    await prisma.node.update({ where: { id: nodeId }, data: { isDraft: false } });
    const second = await createWorkspace(editor, 'Other');
    const otherNode = await prisma.node.create({
      data: { title: 'Other', workspaceId: second.id, createdByClerkId: editor.clerkUserId },
    });
    const row = (id: string) => ({ nodeId: id, sortOrder: 0, passingPercent: 80, quizQuestionCount: 0 });
    expect(
      (await as(editor, () => patchLesson(req({ lessonNodes: [row(otherNode.id)] }), lessonContext(lessonId)))).status
    ).toBe(403);
    expect(
      (await as(editor, () => patchLesson(req({ lessonNodes: [row(nodeId)] }), lessonContext(lessonId)))).status
    ).toBe(200);
    expect((await as(owner, () => deleteNode(req(null), nodeContext(nodeId)))).status).toBe(409);
  });
  it('prevents editors managing roles, admins promoting themselves, and owner removal', async () => {
    await expect(changeMember(editor, workspaceId, viewer.id, 'EDITOR')).rejects.toMatchObject({ status: 403 });
    await expect(changeMember(admin, workspaceId, admin.id, 'ADMIN')).rejects.toMatchObject({ status: 403 });
    await expect(changeMember(admin, workspaceId, viewer.id, 'ADMIN')).rejects.toMatchObject({ status: 403 });
    await expect(changeMember(owner, workspaceId, owner.id, undefined, true)).rejects.toMatchObject({ status: 409 });
    await expect(inviteMember(admin, workspaceId, 'new@example.com', 'ADMIN')).rejects.toMatchObject({ status: 403 });
    await changeMember(admin, workspaceId, viewer.id, 'EDITOR');
    await expect(transferOwnership(admin, workspaceId, viewer.id)).rejects.toMatchObject({ status: 403 });
    await transferOwnership(owner, workspaceId, viewer.id);
    expect(await prisma.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } })).toBe(1);
  });
  it('binds invitations to current verified emails, stores hashes, and prevents replay', async () => {
    const response = await as(owner, () =>
      inviteRoute(req({ email: outsider.email.toUpperCase(), role: 'EDITOR' }), workspaceContext(workspaceId))
    );
    expect(response.status).toBe(200);
    const invitation = await response.json();
    const saved = await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(saved.tokenHash).not.toBe(invitation.token);
    expect((await as(editor, () => acceptRoute(req({ token: invitation.token })))).status).toBe(403);
    mockVerified.set(outsider.id, ['different@example.com']);
    await expect(as(outsider, () => acceptInvitation(outsider, invitation.token))).rejects.toMatchObject({
      status: 403,
    });
    mockVerified.set(outsider.id, [outsider.email]);
    expect((await as(outsider, () => acceptRoute(req({ token: invitation.token })))).status).toBe(200);
    expect((await as(outsider, () => acceptRoute(req({ token: invitation.token })))).status).toBe(410);
  });
  it('rejects revoked, expired and no-longer-authorized invitations', async () => {
    const first = await inviteMember(admin, workspaceId, outsider.email, 'VIEWER');
    expect(
      (
        await as(owner, () =>
          revokeRoute(req(null), { params: Promise.resolve({ workspaceId, invitationId: first.id }) })
        )
      ).status
    ).toBe(200);
    await expect(as(outsider, () => acceptInvitation(outsider, first.token))).rejects.toMatchObject({ status: 410 });
    const second = await inviteMember(admin, workspaceId, outsider.email, 'VIEWER');
    await prisma.workspaceInvitation.update({ where: { id: second.id }, data: { expiresAt: new Date(0) } });
    await expect(as(outsider, () => acceptInvitation(outsider, second.token))).rejects.toMatchObject({ status: 410 });
    const third = await inviteMember(admin, workspaceId, outsider.email, 'VIEWER');
    await changeMember(owner, workspaceId, admin.id, 'VIEWER');
    await expect(as(outsider, () => acceptInvitation(outsider, third.token))).rejects.toMatchObject({ status: 410 });
  });
  it('moves personal lessons and dependencies atomically while retaining attribution', async () => {
    const node = await prisma.node.create({ data: { title: 'Personal', createdByClerkId: owner.clerkUserId } });
    const lesson = await prisma.lesson.create({
      data: {
        title: 'Personal lesson',
        summary: '',
        createdByClerkId: owner.clerkUserId,
        lessonNodes: { create: { nodeId: node.id, sortOrder: 0, passingPercent: 80, quizQuestionCount: 0 } },
      },
    });
    await expect(movePersonalContent(owner, workspaceId, { lessonIds: [lesson.id] })).rejects.toMatchObject({
      status: 422,
    });
    await expect(movePersonalContent(owner, workspaceId, { nodeIds: [node.id] })).rejects.toMatchObject({
      status: 409,
    });
    expect((await prisma.node.findUniqueOrThrow({ where: { id: node.id } })).workspaceId).toBeNull();
    await movePersonalContent(owner, workspaceId, { nodeIds: [node.id], lessonIds: [lesson.id] });
    expect((await as(editor, () => getNode(req(null), nodeContext(node.id)))).status).toBe(200);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).createdByClerkId).toBe(
      owner.clerkUserId
    );
  });
  it('blocks copy bypasses through IDs or nested course sources, and copies into an explicit workspace', async () => {
    expect((await as(outsider, () => copyContent(req({ mode: 'nodes', nodeIds: [nodeId] })))).status).toBe(404);
    const course = await prisma.course.create({
      data: {
        code: 'COPY',
        title: 'Visible course',
        createdByClerkId: outsider.clerkUserId,
        courseLessons: { create: { lessonId } },
      },
    });
    expect(
      (
        await as(outsider, () =>
          copyContent(req({ mode: 'course', sourceCourseId: course.id, code: 'COPY2', title: 'Copy' }))
        )
      ).status
    ).toBe(404);
    const response = await as(editor, () => copyContent(req({ mode: 'nodes', nodeIds: [nodeId], workspaceId })));
    expect(response.status).toBe(201);
    expect(await prisma.node.count({ where: { workspaceId } })).toBe(2);
    expect(await prisma.workspaceAudit.count({ where: { workspaceId } })).toBeGreaterThan(0);
  });
  it('protects owner-created Admin invitations from replacement by an Admin', async () => {
    const original = await inviteMember(owner, workspaceId, 'new@example.com', 'ADMIN');
    await expect(inviteMember(admin, workspaceId, 'new@example.com', 'EDITOR')).rejects.toMatchObject({ status: 403 });
    expect((await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: original.id } })).revokedAt).toBeNull();
    await inviteMember(owner, workspaceId, 'new@example.com', 'EDITOR');
    expect(
      (await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: original.id } })).revokedAt
    ).not.toBeNull();
  });
  it('allows course metadata and schedules after membership removal but rejects new inaccessible assignments', async () => {
    await prisma.lesson.update({ where: { id: lessonId }, data: { isDraft: false } });
    const course = await prisma.course.create({
      data: {
        code: 'REVOKED',
        title: 'Course',
        createdByClerkId: editor.clerkUserId,
        courseLessons: { create: { lessonId } },
      },
    });
    await changeMember(owner, workspaceId, editor.id, null, true);
    const context = { params: Promise.resolve({ courseId: course.id }) };
    const dueDate = '2030-01-01T00:00:00.000Z';
    expect(
      (
        await as(editor, () =>
          patchCourse(req({ title: 'Renamed', lessons: [{ lessonId, sortOrder: 0, dueDate }] }, 'PATCH'), context)
        )
      ).status
    ).toBe(200);
    expect(
      (await prisma.courseLesson.findFirstOrThrow({ where: { courseId: course.id } })).dueDate?.toISOString()
    ).toBe(dueDate);
    const other = await prisma.lesson.create({ data: { title: 'Private', summary: '', workspaceId } });
    expect(
      (await as(editor, () => patchCourse(req({ lessons: [{ lessonId: other.id, sortOrder: 0 }] }, 'PATCH'), context)))
        .status
    ).toBe(403);
  });
  it.each(['create', 'edit'] as const)('serializes a personal lesson %s with a concurrent node move', async (mode) => {
    const node = await prisma.node.create({ data: { title: 'Personal', createdByClerkId: owner.clerkUserId } });
    const personal = await prisma.lesson.create({
      data: { title: '', summary: '', isDraft: true, createdByClerkId: owner.clerkUserId },
    });
    let entered!: () => void, release!: () => void, moveEntered!: () => void;
    const locked = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const moving = new Promise<void>((resolve) => {
      moveEntered = resolve;
    });
    const originalLock = access.lockNodes;
    let calls = 0;
    const spy = jest.spyOn(access, 'lockNodes').mockImplementation(async (tx, ids) => {
      const first = ++calls === 1;
      if (!first) moveEntered();
      await originalLock(tx, ids);
      if (first) {
        entered();
        await gate;
      }
    });
    try {
      const body = { isDraft: true, lessonNodes: [{ nodeId: node.id, sortOrder: 0 }] };
      const save = as(owner, () =>
        mode === 'create' ? postLesson(req(body)) : patchLesson(req(body, 'PATCH'), lessonContext(personal.id))
      );
      await locked;
      const move = movePersonalContent(owner, workspaceId, { nodeIds: [node.id] }).then(
        () => null,
        (error) => error
      );
      await moving;
      release();
      expect((await save).status).toBe(mode === 'create' ? 201 : 200);
      expect(await move).toMatchObject({ status: 409 });
      expect((await prisma.node.findUniqueOrThrow({ where: { id: node.id } })).workspaceId).toBeNull();
    } finally {
      release();
      spy.mockRestore();
    }
  });
  it('rechecks node ownership when a move wins the race with lesson creation', async () => {
    const node = await prisma.node.create({ data: { title: 'Personal', createdByClerkId: owner.clerkUserId } });
    let entered!: () => void, release!: () => void, saveEntered!: () => void;
    const locked = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const saving = new Promise<void>((resolve) => {
      saveEntered = resolve;
    });
    const originalLock = access.lockNodes;
    let calls = 0;
    const spy = jest.spyOn(access, 'lockNodes').mockImplementation(async (tx, ids) => {
      const first = ++calls === 1;
      if (!first) saveEntered();
      await originalLock(tx, ids);
      if (first) {
        entered();
        await gate;
      }
    });
    try {
      const move = movePersonalContent(owner, workspaceId, { nodeIds: [node.id] });
      await locked;
      const save = as(owner, () =>
        postLesson(req({ isDraft: true, lessonNodes: [{ nodeId: node.id, sortOrder: 0 }] }))
      );
      await saving;
      release();
      await move;
      expect((await save).status).toBe(403);
      expect(await prisma.lessonNode.count({ where: { nodeId: node.id } })).toBe(0);
    } finally {
      release();
      spy.mockRestore();
    }
  });
  it('copies nodes into the current workspace after a concurrent destination move', async () => {
    const source = await prisma.node.create({ data: { title: 'Copy source', createdByClerkId: owner.clerkUserId } });
    const destination = await prisma.lesson.create({
      data: { title: '', summary: '', isDraft: true, createdByClerkId: owner.clerkUserId },
    });
    let entered!: () => void, release!: () => void, copyEntered!: () => void;
    const locked = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const copying = new Promise<void>((resolve) => {
      copyEntered = resolve;
    });
    const originalLock = access.lockLessons;
    let calls = 0;
    const spy = jest.spyOn(access, 'lockLessons').mockImplementation(async (tx, ids) => {
      const first = ++calls === 1;
      if (!first) copyEntered();
      await originalLock(tx, ids);
      if (first) {
        entered();
        await gate;
      }
    });
    try {
      const move = movePersonalContent(owner, workspaceId, { lessonIds: [destination.id] });
      await locked;
      const copy = as(owner, () =>
        copyContent(req({ mode: 'nodes', nodeIds: [source.id], destinationId: destination.id }))
      );
      await copying;
      release();
      await move;
      expect((await copy).status).toBe(201);
      const linked = await prisma.lessonNode.findFirstOrThrow({
        where: { lessonId: destination.id },
        include: { node: true },
      });
      expect(linked.node.workspaceId).toBe(workspaceId);
    } finally {
      release();
      spy.mockRestore();
    }
  });
});
