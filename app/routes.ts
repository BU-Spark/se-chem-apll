// Page addresses used in more than one place, so a route only has to change here.
export const ROUTES = {
  signIn: '/sign-in',
  studentHome: '/student',
  studentProfile: '/student/profile',
  studentSettings: '/student/settings',
  studentCourse: (courseId: string) => `/student/courses/${courseId}`,
  comingSoon: '/student/coming-soon',
  admin: '/admin',
  switchRole: '/select-role',
} as const;
