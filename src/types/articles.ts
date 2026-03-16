import type { User } from "./entities";

export type ArticleSummary = {
  _id: string;
  title: string;
  slug?: string;
  excerpt?: string;
  coverImage?: string | null;
  markdownUrl?: string;
  tags?: string[];
  author?: User | null;
  likes: number;
  liked: boolean;
  views: number;
  previouslySeen: boolean;
  comments: number;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ArticlesResponse = {
  data: ArticleSummary[];
  totalPages?: number;
  page?: number;
  total?: number;
};

export type ArticleContentResponse = {
  content: string;
  markdownUrl?: string;
};

export type ArticleCommentReply = {
  _id: string;
  user: User;
  content: string;
  createdAt: string;
  replyToUser?: string;
};

export type ArticleComment = {
  _id: string;
  user: User;
  content: string;
  createdAt: string;
  replies?: ArticleCommentReply[];
};

export type ArticleCommentsResponse = {
  data: ArticleComment[];
  totalPages?: number;
  page?: number;
  total?: number;
};
