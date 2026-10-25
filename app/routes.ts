// Page addresses used in more than one place, so a route only has to change here.
export const ROUTES = {
  signIn: '/sign-in',
  studentHome: '/student',
  studentProfile: '/student/profile',
  studentSettings: '/student/settings',
  studentCourse: (courseId: string) => `/student/courses/${courseId}`,
  studentLesson: (courseId: string, lessonId: string) => `/student/courses/${courseId}/lessons/${lessonId}`,
  // step: the node's video lesson or quiz retake; omitted, the node page picks the screen.
  studentNode: (courseId: string, lessonId: string, nodeId: string, step?: 'video' | 'quiz') =>
    `/student/courses/${courseId}/lessons/${lessonId}/nodes/${nodeId}${step ? `/${step}` : ''}`,
  comingSoon: '/student/coming-soon',
  admin: '/admin',
  switchRole: '/select-role',
} as const;
