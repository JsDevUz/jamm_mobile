export type CourseMember = {
  userId?:
    | string
    | {
        _id?: string;
        id?: string;
        username?: string;
        nickname?: string;
        avatar?: string;
      };
  name?: string;
  avatar?: string;
  status?: "approved" | "pending" | string;
  joinedAt?: string | null;
};

export type CourseLessonMediaItem = {
  mediaId?: string;
  title?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  durationSeconds?: number;
  streamType?: "direct" | "hls";
  streamAssets?: string[];
  hlsKeyAsset?: string;
};

export type CourseHomeworkAssignment = {
  assignmentId?: string;
  enabled?: boolean;
  title?: string;
  description?: string;
  type?: string;
  deadline?: string | null;
  maxScore?: number;
  submissionCount?: number;
  selfSubmission?: CourseHomeworkSubmission | null;
  submissions?: CourseHomeworkSubmission[];
};

export type CourseHomeworkSubmission = {
  userId?: string;
  userName?: string;
  userAvatar?: string;
  text?: string;
  link?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  streamType?: "direct" | "hls";
  streamAssets?: string[];
  hlsKeyAsset?: string;
  status?: string;
  score?: number | null;
  feedback?: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
};

export type CourseLessonMaterial = {
  materialId?: string;
  title?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
};

export type CourseLessonAttendanceMember = {
  userId?: string;
  userName?: string;
  userAvatar?: string;
  status?: "present" | "late" | "absent" | string;
  progressPercent?: number;
  source?: "auto" | "manual" | string;
  markedAt?: string | null;
};

export type CourseLessonAttendanceResponse = {
  lessonId?: string;
  summary?: {
    present?: number;
    late?: number;
    absent?: number;
  };
  self?: CourseLessonAttendanceMember | null;
  members?: CourseLessonAttendanceMember[];
};

export type CourseLinkedTestProgress = {
  userId?: string;
  userName?: string;
  userAvatar?: string;
  score?: number;
  total?: number;
  percent?: number;
  bestPercent?: number;
  passed?: boolean;
  attemptsCount?: number;
  completedAt?: string | null;
};

export type CourseLinkedTest = {
  linkedTestId?: string;
  title?: string;
  url?: string;
  testId?: string;
  resourceType?: "test" | "sentenceBuilder" | string;
  resourceId?: string;
  shareShortCode?: string;
  minimumScore?: number;
  timeLimit?: number;
  showResults?: boolean;
  requiredToUnlock?: boolean;
  selfProgress?: CourseLinkedTestProgress | null;
  attemptsCount?: number;
  passedCount?: number;
};

export type CourseLesson = {
  _id?: string;
  id?: string;
  urlSlug?: string;
  title?: string;
  type?: string;
  description?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  durationSeconds?: number;
  streamType?: "direct" | "hls";
  streamAssets?: string[];
  hlsKeyAsset?: string;
  status?: string;
  publishedAt?: string | null;
  views?: number;
  likes?: number;
  liked?: boolean;
  isUnlocked?: boolean;
  accessLockedByTests?: Array<{
    lessonId?: string;
    lessonTitle?: string;
    testTitle?: string;
  }>;
  mediaItems?: CourseLessonMediaItem[];
  materials?: CourseLessonMaterial[];
  linkedTests?: CourseLinkedTest[];
  homework?: {
    assignments?: CourseHomeworkAssignment[];
  };
  attendanceSummary?: {
    present?: number;
    late?: number;
    absent?: number;
  };
};

export type Course = {
  _id?: string;
  id?: string;
  urlSlug?: string;
  name?: string;
  description?: string;
  image?: string;
  gradient?: string;
  category?: string;
  accessType?: "paid" | "free_request" | "free_open" | string;
  price?: number;
  rating?: number;
  createdBy?:
    | string
    | {
        _id?: string;
        id?: string;
        name?: string;
        nickname?: string;
        username?: string;
        avatar?: string;
      };
  members?: CourseMember[];
  membersCount?: number;
  pendingMembersCount?: number;
  totalMembersCount?: number;
  lessonCount?: number;
  publishedLessonsCount?: number;
  draftLessonsCount?: number;
  lessons?: CourseLesson[];
};

export type CoursesResponse = {
  data: Course[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

export type CourseCommentReply = {
  _id?: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  text?: string;
  createdAt?: string;
};

export type CourseComment = {
  _id?: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  text?: string;
  createdAt?: string;
  replies?: CourseCommentReply[];
};

export type CourseCommentsResponse = {
  data: CourseComment[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

export type CourseLessonMaterialsResponse = {
  items: CourseLessonMaterial[];
};

export type CourseLessonLinkedTestsResponse = {
  items: CourseLinkedTest[];
};

export type CourseLinkedTestAttemptResult = {
  score?: number;
  total?: number;
  percent?: number;
  passed?: boolean;
  resourceType?: "test" | "sentenceBuilder" | string;
  minimumScore?: number;
  showResults?: boolean;
  results?: Array<Record<string, unknown>>;
  linkedTest?: CourseLinkedTest | null;
  nextLessonUnlocked?: boolean;
};

export type CourseLessonHomeworkResponse = {
  assignments: CourseHomeworkAssignment[];
};

export type CourseLessonGradingRow = {
  userId?: string;
  userName?: string;
  userAvatar?: string;
  attendanceStatus?: string;
  attendanceProgress?: number;
  attendanceScore?: number;
  homeworkEnabled?: boolean;
  homeworkStatus?: string;
  homeworkSubmitted?: boolean;
  homeworkScore?: number | null;
  homeworkPercent?: number | null;
  reviewedHomework?: boolean;
  oralScore?: number | null;
  oralNote?: string;
  oralUpdatedAt?: string | null;
  lessonScore?: number;
  performance?: string;
  feedback?: string;
};

export type CourseLessonGradingOverviewStudent = {
  userId?: string;
  userName?: string;
  userAvatar?: string;
  averageScore?: number;
  performance?: string;
  attendanceRate?: number;
  presentCount?: number;
  lateCount?: number;
  absentCount?: number;
  homeworkCompleted?: number;
  reviewedHomework?: number;
  totalLessons?: number;
};

export type CourseLessonGradingResponse = {
  lesson?: {
    lessonId?: string;
    title?: string;
    summary?: {
      averageScore?: number;
      excellentCount?: number;
      completedHomeworkCount?: number;
      attendanceMarkedCount?: number;
    };
    self?: CourseLessonGradingRow;
    students?: CourseLessonGradingRow[];
  };
  overview?: {
    totalLessons?: number;
    averageScore?: number;
    self?: CourseLessonGradingOverviewStudent;
    students?: CourseLessonGradingOverviewStudent[];
  };
};
