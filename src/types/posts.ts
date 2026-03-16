import type { User } from "./entities";

export type FeedTab = "foryou" | "following";

export type FeedImage = {
  url: string;
  blurDataUrl?: string;
  width?: number | null;
  height?: number | null;
};

export type FeedPost = {
  _id: string;
  author: User & {
    jammId?: string;
    premiumStatus?: string;
    selectedProfileDecorationId?: string | null;
    customProfileDecorationImage?: string | null;
  };
  content: string;
  images: FeedImage[];
  likes: number;
  liked: boolean;
  views: number;
  previouslySeen: boolean;
  comments: number;
  createdAt: string;
  updatedAt: string;
};

export type FeedResponse = {
  data: FeedPost[];
  totalPages?: number;
  page?: number;
};

export type PostCommentReply = {
  _id: string;
  user: User;
  content: string;
  createdAt: string;
  replyToUser?: string | null;
};

export type PostComment = {
  _id: string;
  user: User;
  content: string;
  createdAt: string;
  replies?: PostCommentReply[];
};

export type CommentsResponse = {
  data: PostComment[];
  totalPages?: number;
  page?: number;
};
