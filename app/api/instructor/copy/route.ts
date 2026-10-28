import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { apiAccess, contentScope } from '@/lib/auth/api';
import { prisma } from '@/lib/prisma';
import { buildContentCopy, copyLessonInclude } from '@/lib/contentCopy';

const fail = (error: string, status = 422) => NextResponse.json({ error }, { status });
const ids = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 200 &&
  value.every((id) => typeof id === 'string' && id.length > 0);

export async function POST(req: NextRequest) {
  const { user, error } = await apiAccess('instructor');
  if (error) return error;
  let body;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid copy request.');
  const { mode, sourceCourseId, lessonIds, nodeIds, destinationId, copySchedule = false } = body;
  if (!['course', 'lessons', 'nodes'].includes(mode)) return fail('Invalid copy mode.');
  if (typeof copySchedule !== 'boolean' || (destinationId !== undefined && typeof destinationId !== 'string'))
    return fail('Invalid copy options.');
  if (mode === 'course' && (typeof sourceCourseId !== 'string' || !sourceCourseId))
    return fail('Choose a source course.');
  if (mode === 'lessons' && !ids(lessonIds)) return fail('Select between 1 and 200 lessons.');
  if (mode === 'nodes' && !ids(nodeIds)) return fail('Select between 1 and 200 nodes.');
  try {
    const source =
      typeof sourceCourseId === 'string'
        ? await prisma.course.findUnique({
            where: { id: sourceCourseId },
            include: {
              courseLessons: { orderBy: { sortOrder: 'asc' }, include: { lesson: { include: copyLessonInclude } } },
            },
          })
        : null;
    if (sourceCourseId && !source) return fail('Source course not found.', 404);
    if (mode === 'course' && !source) return fail('Source course not found.', 404);
    const lessons =
      mode === 'course'
        ? source!.courseLessons.map((row) => row.lesson)
        : mode === 'lessons'
          ? await prisma.lesson.findMany({
              where: { id: { in: [...new Set<string>(lessonIds)] } },
              include: copyLessonInclude,
            })
          : [];
    const nodes =
      mode === 'nodes'
        ? await prisma.node.findMany({
            where: { id: { in: [...new Set<string>(nodeIds)] } },
            include: {
              checkpoints: { include: { questions: true } },
              quizQuestions: { include: { variants: true } },
            },
          })
        : [];
    if (
      (mode === 'lessons' && lessons.length !== new Set(lessonIds).size) ||
      (mode === 'nodes' && nodes.length !== new Set(nodeIds).size)
    )
      return fail('Some selected content is unavailable.', 404);
    if (
      mode === 'lessons' &&
      source &&
      lessons.some((lesson) => !source.courseLessons.some((row) => row.lessonId === lesson.id))
    )
      return fail('Selected lesson is not in the source course.');
    if (
      mode === 'nodes' &&
      source &&
      nodes.some(
        (node) => !source.courseLessons.some((row) => row.lesson.lessonNodes.some((entry) => entry.nodeId === node.id))
      )
    )
      return fail('Selected node is not in the source course.');
    // Keep source course order; selections from the library retain their submitted order.
    const order: string[] = source ? source.courseLessons.map((row) => row.lessonId) : (lessonIds ?? []);
    lessons.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    nodes.sort((a, b) => nodeIds.indexOf(a.id) - nodeIds.indexOf(b.id));
    const destinationCourse =
      mode === 'lessons' && destinationId
        ? await prisma.course.findFirst({
            where: { id: destinationId, ...contentScope(user) },
            include: { courseLessons: true },
          })
        : null;
    const destinationLesson =
      mode === 'nodes' && destinationId
        ? await prisma.lesson.findFirst({
            where: { id: destinationId, ...contentScope(user) },
            include: { lessonNodes: true },
          })
        : null;
    if (mode !== 'course' && destinationId && !destinationCourse && !destinationLesson)
      return fail('Destination not found or cannot be edited.', 404);
    if (
      (destinationCourse || mode === 'course') &&
      lessons.some((lesson) => lesson.isDraft || lesson.lessonNodes.some((entry) => entry.node.isDraft))
    )
      return fail('Draft content cannot be copied into a course.');
    if (destinationLesson && nodes.some((node) => node.isDraft))
      return fail('Draft nodes cannot be added to a lesson.');
    const copy = buildContentCopy(lessons, nodes, user.clerkUserId);
    const writes: Prisma.PrismaPromise<unknown>[] = [
      ...copy.nodeData.map((data) => prisma.node.create({ data })),
      ...copy.lessonData.map((data) => prisma.lesson.create({ data })),
    ];
    if (copy.edges.length) writes.push(prisma.lessonNodeEdge.createMany({ data: copy.edges }));
    let redirect = mode === 'nodes' ? '/instructor/nodes' : '/instructor/lessons';
    const assignment = (lessonId: string, sortOrder: number) => {
      const policy = source?.courseLessons.find((row) => row.lessonId === lessonId);
      return {
        lessonId: copy.lessonIds.get(lessonId)!,
        sortOrder,
        ...(policy && (mode === 'course' || copySchedule)
          ? {
              openDate: policy.openDate,
              dueDate: policy.dueDate,
              lateDeadline: policy.lateDeadline,
              hideAfterDue: policy.hideAfterDue,
              latePenaltyType: policy.latePenaltyType,
              latePenaltyPercent: policy.latePenaltyPercent,
            }
          : {}),
      };
    };
    if (mode === 'course') {
      const { code, section, title, description } = body;
      if (
        typeof code !== 'string' ||
        !/^[A-Z0-9-]+$/.test(code.trim().toUpperCase()) ||
        typeof title !== 'string' ||
        !title.trim() ||
        (section != null && typeof section !== 'string') ||
        (description != null && typeof description !== 'string')
      )
        return fail('Enter a valid course code, section, title and description.');
      const normalizedCode = code.trim().toUpperCase(),
        normalizedSection = section?.trim() || null;
      if (await prisma.course.findFirst({ where: { code: normalizedCode, section: normalizedSection } }))
        return fail('A course with this code and section already exists.', 409);
      const id = randomUUID();
      writes.push(
        prisma.course.create({
          data: {
            id,
            code: normalizedCode,
            section: normalizedSection,
            title: title.trim(),
            description: description?.trim() || null,
            createdByClerkId: user.clerkUserId,
            courseLessons: { create: lessons.map((lesson, index) => assignment(lesson.id, index)) },
          },
        })
      );
      redirect = `/instructor/courses/${id}/edit`;
    } else if (destinationCourse) {
      const offset = Math.max(-1, ...destinationCourse.courseLessons.map((row) => row.sortOrder)) + 1;
      writes.push(
        prisma.course.update({
          where: { id: destinationCourse.id },
          data: { courseLessons: { create: lessons.map((lesson, index) => assignment(lesson.id, offset + index)) } },
        })
      );
      redirect = `/instructor/courses/${destinationCourse.id}/edit`;
    } else if (destinationLesson) {
      const offset = Math.max(-1, ...destinationLesson.lessonNodes.map((row) => row.sortOrder)) + 1;
      writes.push(
        prisma.lesson.update({
          where: { id: destinationLesson.id },
          data: {
            lessonNodes: {
              create: nodes.map((node, index) => {
                const settings = source?.courseLessons
                  .flatMap((row) => row.lesson.lessonNodes)
                  .find((entry) => entry.nodeId === node.id);
                return {
                  nodeId: copy.nodeIds.get(node.id)!,
                  sortOrder: offset + index,
                  passingPercent: settings?.passingPercent ?? 80,
                  quizQuestionCount: settings?.quizQuestionCount ?? node.quizQuestions.length,
                  isRequired: settings?.isRequired ?? true,
                };
              }),
            },
          },
        })
      );
      redirect = `/instructor/lessons/${destinationLesson.id}/edit`;
    }
    // Preallocated IDs allow an atomic array transaction without an interactive callback.
    await prisma.$transaction(writes);
    return NextResponse.json(
      { redirect, lessonCount: lessons.length, nodeCount: copy.nodeData.length },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return fail('A copy conflicts with an existing record. Refresh and try again.', 409);
    console.error('Content copy failed', error);
    return fail('Unable to copy content. No changes were saved.', 500);
  }
}
