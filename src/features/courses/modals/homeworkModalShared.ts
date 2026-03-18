import { APP_LIMITS } from "../../../constants/appLimits";

export type HomeworkType = "text" | "audio" | "video" | "pdf" | "photo";

export const HOMEWORK_TYPE_OPTIONS: Array<{
  value: HomeworkType;
  label: string;
  hint: string;
  icon: string;
}> = [
  {
    value: "text",
    label: "Text",
    hint: "Talaba matn yoki havola bilan javob yuboradi.",
    icon: "document-text-outline",
  },
  {
    value: "audio",
    label: "Audio",
    hint: "Talaba audio yozuv yoki fayl yuklaydi.",
    icon: "mic-outline",
  },
  {
    value: "video",
    label: "Video",
    hint: "Talaba video fayl yoki havola yuboradi.",
    icon: "videocam-outline",
  },
  {
    value: "pdf",
    label: "PDF",
    hint: "Talaba PDF hujjat yoki link yuklaydi.",
    icon: "document-attach-outline",
  },
  {
    value: "photo",
    label: "Photo",
    hint: "Talaba rasm yoki surat yuboradi.",
    icon: "image-outline",
  },
];

export const HOMEWORK_FILE_CONFIG: Partial<
  Record<
    HomeworkType,
    {
      extensions: string;
      maxBytes: number;
    }
  >
> = {
  audio: {
    extensions: "MP3, WAV, M4A, AAC, OGG",
    maxBytes: APP_LIMITS.homeworkAudioBytes,
  },
  video: {
    extensions: "MP4, MOV, WEBM, MKV, M4V",
    maxBytes: APP_LIMITS.homeworkVideoBytes,
  },
  pdf: {
    extensions: "PDF",
    maxBytes: APP_LIMITS.homeworkPdfBytes,
  },
  photo: {
    extensions: "JPG, JPEG, PNG, WEBP, GIF",
    maxBytes: APP_LIMITS.homeworkPhotoBytes,
  },
};

export function toLocalDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseLocalDateTimeValue(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function formatHomeworkDeadlineLabel(value?: string | null) {
  const parsed = parseLocalDateTimeValue(value);
  if (!parsed) {
    return "Deadline tanlanmagan";
  }

  return parsed.toLocaleString("uz-UZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
