import {
  clearOfflineLessonCache,
  listOfflineLessonCacheEntries,
  removeOfflineLessonCacheEntry,
  type OfflineLessonCacheEntry,
} from "./secure-course-video-cache";
import {
  clearSecureCachedMediaEntries,
  listSecureCachedMediaEntries,
  removeSecureCachedMediaEntry,
  type SecureCachedMediaEntry,
} from "./secure-media-cache";

export type DeviceStorageUsage = {
  feedImages: SecureCachedMediaEntry[];
  courseVideos: OfflineLessonCacheEntry[];
  totals: {
    feedImagesBytes: number;
    courseVideosBytes: number;
    allBytes: number;
  };
};

export const getDeviceStorageUsage = async (): Promise<DeviceStorageUsage> => {
  const [feedImages, courseVideos] = await Promise.all([
    listSecureCachedMediaEntries(),
    listOfflineLessonCacheEntries(),
  ]);

  const feedImagesBytes = feedImages.reduce((total, item) => total + item.sizeBytes, 0);
  const courseVideosBytes = courseVideos.reduce((total, item) => total + item.sizeBytes, 0);

  return {
    feedImages,
    courseVideos,
    totals: {
      feedImagesBytes,
      courseVideosBytes,
      allBytes: feedImagesBytes + courseVideosBytes,
    },
  };
};

export const deleteFeedStorageItem = removeSecureCachedMediaEntry;
export const clearFeedStorage = clearSecureCachedMediaEntries;
export const deleteCourseVideoStorageItem = removeOfflineLessonCacheEntry;
export const clearCourseVideoStorage = clearOfflineLessonCache;
