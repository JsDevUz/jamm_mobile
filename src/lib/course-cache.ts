import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Course, CoursesResponse } from "../types/courses";

const COURSE_LIST_CACHE_KEY = "jamm:courses:list:v1";
const COURSE_DETAIL_CACHE_KEY = "jamm:courses:details:v1";

function safeParse<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getCourseIdentifiers(course?: Course | null) {
  return Array.from(
    new Set(
      [course?._id, course?.id, course?.urlSlug]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function getPrimaryCourseIdentifier(course?: Course | null) {
  return getCourseIdentifiers(course)[0] || "";
}

async function loadDetailMap() {
  return safeParse<Record<string, Course>>(
    await AsyncStorage.getItem(COURSE_DETAIL_CACHE_KEY),
  ) || {};
}

async function saveDetailMap(map: Record<string, Course>) {
  await AsyncStorage.setItem(COURSE_DETAIL_CACHE_KEY, JSON.stringify(map));
}

export async function loadCourseListCache() {
  return safeParse<CoursesResponse>(
    await AsyncStorage.getItem(COURSE_LIST_CACHE_KEY),
  );
}

export async function saveCourseListCache(response: CoursesResponse) {
  await AsyncStorage.setItem(COURSE_LIST_CACHE_KEY, JSON.stringify(response || { data: [] }));
}

export async function getCourseDetailCache(identifier?: string | null) {
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier) {
    return null;
  }

  const map = await loadDetailMap();
  return map[normalizedIdentifier] || null;
}

export async function upsertCourseDetailCache(course: Course) {
  const identifiers = getCourseIdentifiers(course);
  if (!identifiers.length) {
    return;
  }

  const [existingList, detailMap] = await Promise.all([
    loadCourseListCache(),
    loadDetailMap(),
  ]);

  identifiers.forEach((identifier) => {
    detailMap[identifier] = course;
  });

  const currentList = Array.isArray(existingList?.data) ? existingList.data : [];
  const listMap = new Map<string, Course>();

  currentList.forEach((item, index) => {
    const key = getPrimaryCourseIdentifier(item) || `course-${index}`;
    listMap.set(key, item);
  });

  const primaryIdentifier = getPrimaryCourseIdentifier(course);
  if (primaryIdentifier) {
    listMap.set(primaryIdentifier, {
      ...(listMap.get(primaryIdentifier) || {}),
      ...course,
    });
  }

  await Promise.all([
    saveDetailMap(detailMap),
    saveCourseListCache({
      ...(existingList || { total: listMap.size, page: 1, limit: listMap.size, totalPages: 1 }),
      data: Array.from(listMap.values()),
    }),
  ]);
}

export async function replaceCourseListCache(response: CoursesResponse) {
  const normalized = {
    ...(response || { data: [] }),
    data: Array.isArray(response?.data) ? response.data : [],
  } satisfies CoursesResponse;
  const detailMap = await loadDetailMap();

  normalized.data.forEach((course) => {
    getCourseIdentifiers(course).forEach((identifier) => {
      detailMap[identifier] = {
        ...(detailMap[identifier] || {}),
        ...course,
      };
    });
  });

  await Promise.all([
    saveCourseListCache(normalized),
    saveDetailMap(detailMap),
  ]);
}
