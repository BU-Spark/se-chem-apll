import { getEnrolledCourses, getStudentInstructors } from './studentCourses';

const mockEnrollmentFindMany = jest.fn();
const mockContactFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    enrollment: { findMany: (...args: unknown[]) => mockEnrollmentFindMany(...args) },
    courseContact: { findMany: (...args: unknown[]) => mockContactFindMany(...args) },
  },
}));

describe('getEnrolledCourses', () => {
  it('returns the courses the student is enrolled in as a student', async () => {
    mockEnrollmentFindMany.mockResolvedValue([{ course: { id: 'c1', title: 'Chem', description: null } }]);

    expect(await getEnrolledCourses('student-1')).toEqual([{ id: 'c1', title: 'Chem', description: null }]);
    expect(mockEnrollmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: 'student-1', role: 'STUDENT' } })
    );
  });
});

describe('getStudentInstructors', () => {
  it("lists instructors of the student's courses once each", async () => {
    mockContactFindMany.mockResolvedValue([
      { id: 'a', name: 'Jane Smith', email: 'janesmith@bu.edu' },
      { id: 'b', name: 'Jane Smith', email: 'janesmith@bu.edu' },
      { id: 'c', name: 'Ali Khan', email: 'alikhan@bu.edu' },
    ]);

    expect((await getStudentInstructors('student-1')).map((instructor) => instructor.id)).toEqual(['a', 'c']);
    expect(mockContactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: 'INSTRUCTOR',
          course: { enrollments: { some: { studentId: 'student-1', role: 'STUDENT' } } },
        },
      })
    );
  });
});
