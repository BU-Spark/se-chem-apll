import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
import StudentLayout from './layout';
import StudentHomePage from './page';
import StudentCoursePage from './courses/[courseId]/page';
import StudentProfilePage from './profile/page';
import StudentSettingsPage from './settings/page';

jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
jest.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`Redirect: ${path}`);
  },
}));
jest.mock('@/lib/studentCourses', () => ({
  getEnrolledCourses: jest.fn(),
  getStudentCourse: jest.fn(),
  getStudentInstructors: jest.fn(),
}));
jest.mock('@/app/components/AccountActions/AccountActions', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/components/StudentBottomNav/StudentBottomNav', () => ({ __esModule: true, default: () => null }));

const surfaces = [
  ['layout', () => StudentLayout({ children: null })],
  ['home', () => StudentHomePage()],
  ['course', () => StudentCoursePage({ params: Promise.resolve({ courseId: 'course-1' }) })],
  ['profile', () => StudentProfilePage()],
  ['settings', () => StudentSettingsPage()],
] as const;

describe.each(surfaces)('student %s access', (_name, load) => {
  it.each([
    [null, '/sign-in'],
    [appUser({ appRole: 'INSTRUCTOR' }), '/instructor'],
    [appUser({ appRole: null }), '/select-role'],
  ] as const)('redirects unauthorized viewers: %p', async (user, destination) => {
    mockGetAppUser.mockResolvedValue(user);
    await expect(load()).rejects.toThrow(`Redirect: ${destination}`);
  });
});
