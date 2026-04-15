import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { API_BASE_URL } from "../../config/env";

type WhiteboardPoint = {
  x: number;
  y: number;
};

type WhiteboardStroke = {
  id: string;
  tool: string;
  color: string;
  size: number;
  points: WhiteboardPoint[];
  text?: string;
  fillColor?: string;
  fontFamily?: string;
  textSize?: string;
  textAlign?: string;
  fontPixelSize?: number;
  edgeStyle?: string;
  rotation?: number;
};

type WhiteboardPdfPageState = {
  pageNumber: number;
  strokes: WhiteboardStroke[];
};

type WhiteboardBoardTab = {
  id: string;
  type: "board";
  title: string;
  zoom: number;
  viewportBaseWidth: number;
  viewportBaseHeight: number;
  scrollLeftRatio: number;
  scrollTopRatio: number;
  strokes: WhiteboardStroke[];
};

type WhiteboardPdfTab = {
  id: string;
  type: "pdf";
  title: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  scrollRatio: number;
  zoom: number;
  viewportPageNumber: number;
  viewportPageOffsetRatio: number;
  viewportLeftRatio: number;
  viewportVisibleHeightRatio: number;
  viewportVisibleWidthRatio: number;
  viewportBaseWidth: number;
  viewportBaseHeight: number;
  selectedPagesMode: "all" | "custom";
  selectedPages: number[];
  pages: WhiteboardPdfPageState[];
};

export type WhiteboardTab = WhiteboardBoardTab | WhiteboardPdfTab;

export type WhiteboardWorkspace = {
  isActive: boolean;
  ownerPeerId: string;
  ownerDisplayName: string;
  activeTabId: string;
  tabs: WhiteboardTab[];
  pdfLibrary: Array<Record<string, unknown>>;
};

const WHITEBOARD_BOARD_TAB_ID = "board";

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numericValue));
};

const resolveWhiteboardFileUrl = (rawUrl: unknown) => {
  const normalizedUrl = String(rawUrl || "").trim();
  if (!normalizedUrl) {
    return "";
  }

  if (
    normalizedUrl.startsWith("http://") ||
    normalizedUrl.startsWith("https://")
  ) {
    return normalizedUrl;
  }

  if (normalizedUrl.startsWith("/")) {
    return `${API_BASE_URL}${normalizedUrl}`;
  }

  return normalizedUrl;
};

const normalizeWhiteboardPoint = (point: unknown): WhiteboardPoint | null => {
  if (!point || typeof point !== "object") {
    return null;
  }

  const source = point as { x?: unknown; y?: unknown };
  const x = clamp(source.x, -0.5, 1.5, Number.NaN);
  const y = clamp(source.y, -0.5, 1.5, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
};

const normalizeWhiteboardStroke = (stroke: unknown): WhiteboardStroke | null => {
  if (!stroke || typeof stroke !== "object") {
    return null;
  }

  const source = stroke as {
    id?: unknown;
    tool?: unknown;
    color?: unknown;
    size?: unknown;
    points?: unknown[];
    text?: unknown;
    fillColor?: unknown;
    fontFamily?: unknown;
    textSize?: unknown;
    textAlign?: unknown;
    fontPixelSize?: unknown;
    edgeStyle?: unknown;
    rotation?: unknown;
  };

  const points = Array.isArray(source.points)
    ? source.points
        .map((point) => normalizeWhiteboardPoint(point))
        .filter((point): point is WhiteboardPoint => Boolean(point))
    : [];

  return {
    id: String(source.id || "").trim(),
    tool: String(source.tool || "pen").trim() || "pen",
    color: String(source.color || "#0f172a").trim() || "#0f172a",
    size: clamp(source.size, 1, 24, 4),
    points,
    text: String(source.text || ""),
    fillColor: String(source.fillColor || ""),
    fontFamily: String(source.fontFamily || "sans"),
    textSize: String(source.textSize || "m"),
    textAlign: String(source.textAlign || "left"),
    fontPixelSize: clamp(source.fontPixelSize, 8, 240, 28),
    edgeStyle: String(source.edgeStyle || "sharp"),
    rotation: clamp(source.rotation, -360, 360, 0),
  };
};

const normalizeWhiteboardPdfPageState = (
  pageState: unknown,
): WhiteboardPdfPageState | null => {
  if (!pageState || typeof pageState !== "object") {
    return null;
  }

  const source = pageState as { pageNumber?: unknown; strokes?: unknown[] };
  const pageNumber = Math.max(1, Math.round(Number(source.pageNumber) || 1));
  return {
    pageNumber,
    strokes: Array.isArray(source.strokes)
      ? source.strokes
          .map((stroke) => normalizeWhiteboardStroke(stroke))
          .filter((stroke): stroke is WhiteboardStroke => Boolean(stroke))
      : [],
  };
};

const normalizeWhiteboardTab = (tab: unknown): WhiteboardTab | null => {
  if (!tab || typeof tab !== "object") {
    return null;
  }

  const source = tab as {
    id?: unknown;
    type?: unknown;
    title?: unknown;
    zoom?: unknown;
    viewportBaseWidth?: unknown;
    viewportBaseHeight?: unknown;
    scrollLeftRatio?: unknown;
    scrollTopRatio?: unknown;
    strokes?: unknown[];
    fileUrl?: unknown;
    fileName?: unknown;
    fileSize?: unknown;
    scrollRatio?: unknown;
    viewportPageNumber?: unknown;
    viewportPageOffsetRatio?: unknown;
    viewportLeftRatio?: unknown;
    viewportVisibleHeightRatio?: unknown;
    viewportVisibleWidthRatio?: unknown;
    selectedPagesMode?: unknown;
    selectedPages?: unknown[];
    pages?: unknown[];
  };

  const type = String(source.type || "board").trim().toLowerCase();
  const id = String(source.id || "").trim() || WHITEBOARD_BOARD_TAB_ID;
  const title = String(source.title || (type === "pdf" ? "PDF" : "Board")).trim();

  if (type === "pdf") {
    return {
      id,
      type: "pdf",
      title: title || "PDF",
      fileUrl: resolveWhiteboardFileUrl(source.fileUrl),
      fileName: String(source.fileName || "").trim(),
      fileSize: Math.max(0, Number(source.fileSize) || 0),
      scrollRatio: clamp(source.scrollRatio, 0, 1, 0),
      zoom: clamp(source.zoom, 0.5, 3, 1),
      viewportPageNumber: Math.max(1, Math.round(Number(source.viewportPageNumber) || 1)),
      viewportPageOffsetRatio: clamp(source.viewportPageOffsetRatio, 0, 1, 0),
      viewportLeftRatio: clamp(source.viewportLeftRatio, 0, 1, 0),
      viewportVisibleHeightRatio: clamp(source.viewportVisibleHeightRatio, 0, 1, 1),
      viewportVisibleWidthRatio: clamp(source.viewportVisibleWidthRatio, 0, 1, 1),
      viewportBaseWidth: Math.max(120, Math.round(Number(source.viewportBaseWidth) || 120)),
      viewportBaseHeight: Math.max(
        120,
        Math.round(Number(source.viewportBaseHeight) || 120),
      ),
      selectedPagesMode:
        String(source.selectedPagesMode || "all").trim() === "custom"
          ? "custom"
          : "all",
      selectedPages: Array.isArray(source.selectedPages)
        ? source.selectedPages
            .map((pageNumber) => Math.max(1, Math.round(Number(pageNumber) || 0)))
            .filter(Boolean)
        : [],
      pages: Array.isArray(source.pages)
        ? source.pages
            .map((page) => normalizeWhiteboardPdfPageState(page))
            .filter((page): page is WhiteboardPdfPageState => Boolean(page))
        : [],
    };
  }

  return {
    id,
    type: "board",
    title: title || "Board",
    zoom: clamp(source.zoom, 0.5, 3, 1),
    viewportBaseWidth: Math.max(120, Math.round(Number(source.viewportBaseWidth) || 120)),
    viewportBaseHeight: Math.max(
      120,
      Math.round(Number(source.viewportBaseHeight) || 120),
    ),
    scrollLeftRatio: clamp(source.scrollLeftRatio, 0, 1, 0),
    scrollTopRatio: clamp(source.scrollTopRatio, 0, 1, 0),
    strokes: Array.isArray(source.strokes)
      ? source.strokes
          .map((stroke) => normalizeWhiteboardStroke(stroke))
          .filter((stroke): stroke is WhiteboardStroke => Boolean(stroke))
      : [],
  };
};

export const normalizeWhiteboardWorkspace = (
  payload?: {
    isActive?: unknown;
    ownerPeerId?: unknown;
    ownerDisplayName?: unknown;
    activeTabId?: unknown;
    activeTabTitle?: unknown;
    tabs?: unknown[];
    pdfLibrary?: unknown[];
  } | null,
): WhiteboardWorkspace | null => {
  if (!payload || !payload.isActive) {
    return null;
  }

  const normalizedTabs = Array.isArray(payload.tabs)
    ? payload.tabs
        .map((tab) => normalizeWhiteboardTab(tab))
        .filter((tab): tab is WhiteboardTab => Boolean(tab))
    : [];

  const activeTabId = String(payload.activeTabId || "").trim() || WHITEBOARD_BOARD_TAB_ID;
  const activeTabTitle = String(payload.activeTabTitle || "").trim();

  if (normalizedTabs.length === 0) {
    normalizedTabs.push({
      id: activeTabId,
      type: "board",
      title: activeTabTitle || "Board",
      zoom: 1,
      viewportBaseWidth: 120,
      viewportBaseHeight: 120,
      scrollLeftRatio: 0,
      scrollTopRatio: 0,
      strokes: [],
    });
  }

  return {
    isActive: true,
    ownerPeerId: String(payload.ownerPeerId || "").trim(),
    ownerDisplayName: String(payload.ownerDisplayName || "Whiteboard").trim() || "Whiteboard",
    activeTabId:
      normalizedTabs.find((tab) => tab.id === activeTabId)?.id || normalizedTabs[0]?.id || WHITEBOARD_BOARD_TAB_ID,
    tabs: normalizedTabs,
    pdfLibrary: Array.isArray(payload.pdfLibrary)
      ? payload.pdfLibrary.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === "object",
        )
      : [],
  };
};

export const getWhiteboardActiveTab = (workspace: WhiteboardWorkspace | null) =>
  workspace?.tabs.find((tab) => tab.id === workspace.activeTabId) ||
  workspace?.tabs[0] ||
  null;

export const getWhiteboardActiveTabTitle = (workspace: WhiteboardWorkspace | null) =>
  getWhiteboardActiveTab(workspace)?.title || "Board";

const escapeHtmlJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

const createWhiteboardPreviewHtml = (workspace: WhiteboardWorkspace) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      :root {
        color-scheme: dark;
      }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #141922;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        display: flex;
      }
      #root {
        position: relative;
        flex: 1;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background:
          radial-gradient(circle at top, rgba(129, 140, 248, 0.09), transparent 34%),
          linear-gradient(180deg, #1a202c 0%, #121720 100%);
      }
      .surface {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .board-frame,
      .pdf-frame {
        position: relative;
        overflow: hidden;
        border-radius: 18px;
        box-shadow: 0 18px 42px rgba(5, 10, 20, 0.28);
      }
      .board-frame {
        background:
          radial-gradient(circle, rgba(180, 193, 214, 0.34) 1.1px, transparent 1.2px) 0 0 / 22px 22px,
          linear-gradient(180deg, rgba(255,255,255,0.92), rgba(246,248,252,0.96));
      }
      .board-content {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: top left;
      }
      .pdf-frame {
        background: #edf2f7;
      }
      .pdf-page-layer {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: top left;
      }
      .pdf-page {
        display: block;
        background: #fff;
      }
      .overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        color: rgba(255,255,255,0.78);
        text-align: center;
        padding: 24px;
      }
      .empty-badge {
        width: 58px;
        height: 58px;
        border-radius: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(163, 230, 53, 0.16);
        color: #d9f99d;
        font-size: 26px;
        font-weight: 700;
      }
      .empty-title {
        font-size: 18px;
        font-weight: 800;
        color: #f8fafc;
      }
      .empty-subtitle {
        font-size: 13px;
        line-height: 1.45;
        color: rgba(226, 232, 240, 0.78);
      }
      .loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255,255,255,0.9);
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        background: linear-gradient(180deg, rgba(19,24,33,0.04), rgba(19,24,33,0.12));
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      const WHITEBOARD_STATE = ${escapeHtmlJson(workspace)};
      const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

      const root = document.getElementById("root");
      let pdfLibPromise = null;

      const clamp = (value, min, max, fallback) => {
        const nextValue = Number(value);
        if (!Number.isFinite(nextValue)) {
          return fallback;
        }
        return Math.min(max, Math.max(min, nextValue));
      };

      const getActiveTab = (workspace) => {
        if (!workspace || !Array.isArray(workspace.tabs)) {
          return null;
        }
        return (
          workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ||
          workspace.tabs[0] ||
          null
        );
      };

      const getStrokeFontFamily = (fontFamily) => {
        switch (String(fontFamily || "sans")) {
          case "serif":
            return "Georgia, Times New Roman, serif";
          case "mono":
            return "Menlo, Monaco, monospace";
          case "hand":
            return "'Comic Sans MS', 'Bradley Hand', cursive";
          default:
            return "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        }
      };

      const getStrokeFontSize = (stroke) => {
        const explicit = Number(stroke?.fontPixelSize);
        if (Number.isFinite(explicit) && explicit > 0) {
          return explicit;
        }
        switch (String(stroke?.textSize || "m")) {
          case "s":
            return 20;
          case "l":
            return 34;
          case "xl":
            return 46;
          default:
            return 28;
        }
      };

      const getStrokePath = (stroke, width, height) => {
        const points = Array.isArray(stroke?.points) ? stroke.points : [];
        if (!points.length) {
          return "";
        }

        return points
          .map((point, index) => {
            const x = clamp(point?.x, -0.5, 1.5, 0) * width;
            const y = clamp(point?.y, -0.5, 1.5, 0) * height;
            return \`\${index === 0 ? "M" : "L"} \${x.toFixed(2)} \${y.toFixed(2)}\`;
          })
          .join(" ");
      };

      const createSvgElement = (name) =>
        document.createElementNS("http://www.w3.org/2000/svg", name);

      const renderStrokeLayer = ({ width, height, strokes, scale = 1, offsetX = 0, offsetY = 0 }) => {
        const svg = createSvgElement("svg");
        svg.setAttribute("viewBox", \`0 0 \${width} \${height}\`);
        svg.setAttribute("width", String(width * scale));
        svg.setAttribute("height", String(height * scale));
        svg.style.position = "absolute";
        svg.style.left = \`\${offsetX}px\`;
        svg.style.top = \`\${offsetY}px\`;
        svg.style.overflow = "visible";

        const group = createSvgElement("g");
        svg.appendChild(group);

        (Array.isArray(strokes) ? strokes : []).forEach((stroke) => {
          const tool = String(stroke?.tool || "pen");
          const color = String(stroke?.color || "#0f172a");
          const fillColor = String(stroke?.fillColor || "");
          const size = Math.max(1, Number(stroke?.size) || 4);
          const points = Array.isArray(stroke?.points) ? stroke.points : [];
          if (!points.length) {
            return;
          }

          const start = points[0];
          const end = points[points.length - 1];
          const x1 = clamp(start?.x, -0.5, 1.5, 0) * width;
          const y1 = clamp(start?.y, -0.5, 1.5, 0) * height;
          const x2 = clamp(end?.x, -0.5, 1.5, 0) * width;
          const y2 = clamp(end?.y, -0.5, 1.5, 0) * height;
          const minX = Math.min(x1, x2);
          const minY = Math.min(y1, y2);
          const boxWidth = Math.max(1, Math.abs(x2 - x1));
          const boxHeight = Math.max(1, Math.abs(y2 - y1));
          const centerX = minX + boxWidth / 2;
          const centerY = minY + boxHeight / 2;
          const rotation = Number(stroke?.rotation) || 0;
          const edgeRounded = String(stroke?.edgeStyle || "sharp") === "rounded";

          const applyCommon = (node) => {
            if (rotation) {
              node.setAttribute("transform", \`rotate(\${rotation} \${centerX} \${centerY})\`);
            }
            return node;
          };

          if (tool === "text") {
            const textNode = applyCommon(createSvgElement("text"));
            textNode.setAttribute("x", String(x1));
            textNode.setAttribute("y", String(y1));
            textNode.setAttribute("fill", color);
            textNode.setAttribute("font-size", String(getStrokeFontSize(stroke)));
            textNode.setAttribute("font-family", getStrokeFontFamily(stroke?.fontFamily));
            textNode.setAttribute("dominant-baseline", "hanging");
            const textAlign = String(stroke?.textAlign || "left");
            textNode.setAttribute(
              "text-anchor",
              textAlign === "center" ? "middle" : textAlign === "right" ? "end" : "start",
            );
            textNode.textContent = String(stroke?.text || "");
            group.appendChild(textNode);
            return;
          }

          if (tool === "arrow") {
            const line = applyCommon(createSvgElement("line"));
            line.setAttribute("x1", String(x1));
            line.setAttribute("y1", String(y1));
            line.setAttribute("x2", String(x2));
            line.setAttribute("y2", String(y2));
            line.setAttribute("stroke", color);
            line.setAttribute("stroke-width", String(size));
            line.setAttribute("stroke-linecap", "round");
            group.appendChild(line);

            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLength = Math.max(12, size * 3.5);
            const leftX = x2 - headLength * Math.cos(angle - Math.PI / 7);
            const leftY = y2 - headLength * Math.sin(angle - Math.PI / 7);
            const rightX = x2 - headLength * Math.cos(angle + Math.PI / 7);
            const rightY = y2 - headLength * Math.sin(angle + Math.PI / 7);
            const arrowHead = applyCommon(createSvgElement("path"));
            arrowHead.setAttribute(
              "d",
              \`M \${leftX} \${leftY} L \${x2} \${y2} L \${rightX} \${rightY}\`,
            );
            arrowHead.setAttribute("fill", "none");
            arrowHead.setAttribute("stroke", color);
            arrowHead.setAttribute("stroke-width", String(size));
            arrowHead.setAttribute("stroke-linecap", "round");
            arrowHead.setAttribute("stroke-linejoin", "round");
            group.appendChild(arrowHead);
            return;
          }

          if (tool === "rectangle" || tool === "diamond" || tool === "triangle" || tool === "circle") {
            if (tool === "circle") {
              const ellipse = applyCommon(createSvgElement("ellipse"));
              ellipse.setAttribute("cx", String(centerX));
              ellipse.setAttribute("cy", String(centerY));
              ellipse.setAttribute("rx", String(boxWidth / 2));
              ellipse.setAttribute("ry", String(boxHeight / 2));
              ellipse.setAttribute("stroke", color);
              ellipse.setAttribute("stroke-width", String(size));
              ellipse.setAttribute("fill", fillColor || "transparent");
              group.appendChild(ellipse);
              return;
            }

            if (tool === "rectangle") {
              const rect = applyCommon(createSvgElement("rect"));
              rect.setAttribute("x", String(minX));
              rect.setAttribute("y", String(minY));
              rect.setAttribute("width", String(boxWidth));
              rect.setAttribute("height", String(boxHeight));
              rect.setAttribute("rx", edgeRounded ? String(Math.min(boxWidth, boxHeight) * 0.12) : "0");
              rect.setAttribute("stroke", color);
              rect.setAttribute("stroke-width", String(size));
              rect.setAttribute("fill", fillColor || "transparent");
              group.appendChild(rect);
              return;
            }

            const polygon = applyCommon(createSvgElement("polygon"));
            if (tool === "diamond") {
              polygon.setAttribute(
                "points",
                \`\${centerX},\${minY} \${minX + boxWidth},\${centerY} \${centerX},\${minY + boxHeight} \${minX},\${centerY}\`,
              );
            } else {
              polygon.setAttribute(
                "points",
                \`\${centerX},\${minY} \${minX + boxWidth},\${minY + boxHeight} \${minX},\${minY + boxHeight}\`,
              );
            }
            polygon.setAttribute("stroke", color);
            polygon.setAttribute("stroke-width", String(size));
            polygon.setAttribute("fill", fillColor || "transparent");
            polygon.setAttribute("stroke-linejoin", edgeRounded ? "round" : "miter");
            group.appendChild(polygon);
            return;
          }

          const path = createSvgElement("path");
          path.setAttribute("d", getStrokePath(stroke, width, height));
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", tool === "eraser" ? "#ffffff" : color);
          path.setAttribute("stroke-width", String(size));
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
          group.appendChild(path);
        });

        return svg;
      };

      const renderBoard = (workspace, tab) => {
        const frameWidth = Math.max(140, Number(tab?.viewportBaseWidth) || root.clientWidth || 140);
        const frameHeight = Math.max(140, Number(tab?.viewportBaseHeight) || root.clientHeight || 140);
        const fitScale = Math.min(root.clientWidth / frameWidth, root.clientHeight / frameHeight, 1);
        const boardZoom = clamp(tab?.zoom, 0.5, 3, 1);
        const contentWidth = frameWidth * boardZoom;
        const contentHeight = frameHeight * boardZoom;
        const scrollX = Math.max(0, contentWidth - frameWidth) * clamp(tab?.scrollLeftRatio, 0, 1, 0);
        const scrollY = Math.max(0, contentHeight - frameHeight) * clamp(tab?.scrollTopRatio, 0, 1, 0);

        const frame = document.createElement("div");
        frame.className = "board-frame";
        frame.style.width = \`\${frameWidth * fitScale}px\`;
        frame.style.height = \`\${frameHeight * fitScale}px\`;

        const content = document.createElement("div");
        content.className = "board-content";
        content.style.width = \`\${contentWidth * fitScale}px\`;
        content.style.height = \`\${contentHeight * fitScale}px\`;
        content.style.transform = \`translate(\${-scrollX * fitScale}px, \${-scrollY * fitScale}px)\`;
        frame.appendChild(content);

        const strokeLayer = renderStrokeLayer({
          width: frameWidth,
          height: frameHeight,
          strokes: tab?.strokes || [],
          scale: boardZoom * fitScale,
        });
        content.appendChild(strokeLayer);

        const surface = document.createElement("div");
        surface.className = "surface";
        surface.appendChild(frame);
        return surface;
      };

      const loadPdfJs = async () => {
        if (window.pdfjsLib) {
          return window.pdfjsLib;
        }

        if (!pdfLibPromise) {
          pdfLibPromise = import(PDFJS_CDN).then((module) => {
            const lib = module?.default || module;
            if (lib?.GlobalWorkerOptions) {
              lib.GlobalWorkerOptions.workerSrc =
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
            }
            window.pdfjsLib = lib;
            return lib;
          });
        }

        return pdfLibPromise;
      };

      const renderPdf = async (workspace, tab) => {
        const surface = document.createElement("div");
        surface.className = "surface";

        const loading = document.createElement("div");
        loading.className = "loading";
        loading.textContent = "PDF yuklanmoqda...";
        surface.appendChild(loading);

        try {
          const pdfjsLib = await loadPdfJs();
          const loadingTask = pdfjsLib.getDocument({
            url: String(tab?.fileUrl || ""),
            withCredentials: true,
          });
          const pdfDocument = await loadingTask.promise;
          const pageNumber = Math.max(
            1,
            Math.min(pdfDocument.numPages, Math.round(Number(tab?.viewportPageNumber) || 1)),
          );
          const page = await pdfDocument.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const viewportBaseWidth = Math.max(
            140,
            Number(tab?.viewportBaseWidth) || Math.round(baseViewport.width) || 140,
          );
          const viewportBaseHeight = Math.max(
            140,
            Number(tab?.viewportBaseHeight) || Math.round(baseViewport.height) || 140,
          );
          const fitScale = Math.min(
            root.clientWidth / viewportBaseWidth,
            root.clientHeight / viewportBaseHeight,
            1,
          );
          const pdfZoom = clamp(tab?.zoom, 0.5, 3, 1);
          const renderScale = Math.max(1.2, pdfZoom * window.devicePixelRatio);
          const pdfViewport = page.getViewport({ scale: renderScale });
          const pageWidth = pdfViewport.width;
          const pageHeight = pdfViewport.height;
          const scaledViewportWidth = viewportBaseWidth * fitScale;
          const scaledViewportHeight = viewportBaseHeight * fitScale;
          const leftRatio = clamp(tab?.viewportLeftRatio, 0, 1, 0);
          const topRatio = clamp(tab?.viewportPageOffsetRatio, 0, 1, 0);
          const visibleWidthRatio = clamp(tab?.viewportVisibleWidthRatio, 0, 1, 1);
          const visibleHeightRatio = clamp(tab?.viewportVisibleHeightRatio, 0, 1, 1);
          const scrollX = Math.max(
            0,
            pageWidth - pageWidth * visibleWidthRatio,
          ) * leftRatio;
          const scrollY = Math.max(
            0,
            pageHeight - pageHeight * visibleHeightRatio,
          ) * topRatio;

          const frame = document.createElement("div");
          frame.className = "pdf-frame";
          frame.style.width = \`\${scaledViewportWidth}px\`;
          frame.style.height = \`\${scaledViewportHeight}px\`;

          const pageLayer = document.createElement("div");
          pageLayer.className = "pdf-page-layer";
          pageLayer.style.transform = \`translate(\${-scrollX * fitScale / renderScale}px, \${-scrollY * fitScale / renderScale}px) scale(\${fitScale / renderScale})\`;
          frame.appendChild(pageLayer);

          const canvas = document.createElement("canvas");
          canvas.className = "pdf-page";
          canvas.width = Math.max(1, Math.round(pageWidth));
          canvas.height = Math.max(1, Math.round(pageHeight));
          canvas.style.width = \`\${pageWidth}px\`;
          canvas.style.height = \`\${pageHeight}px\`;
          pageLayer.appendChild(canvas);

          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport: pdfViewport,
          }).promise;

          const pageState =
            (Array.isArray(tab?.pages)
              ? tab.pages.find((entry) => Number(entry?.pageNumber) === pageNumber)
              : null) || null;

          const overlay = renderStrokeLayer({
            width: pageWidth,
            height: pageHeight,
            strokes: pageState?.strokes || [],
            scale: fitScale / renderScale,
            offsetX: -scrollX * fitScale / renderScale,
            offsetY: -scrollY * fitScale / renderScale,
          });
          overlay.classList.add("overlay");
          frame.appendChild(overlay);

          surface.innerHTML = "";
          surface.appendChild(frame);
          return surface;
        } catch (error) {
          surface.innerHTML = "";
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.innerHTML = \`
            <div class="empty-badge">PDF</div>
            <div class="empty-title">\${String(tab?.title || "PDF")}</div>
            <div class="empty-subtitle">PDF preview yuklanmadi.</div>
          \`;
          surface.appendChild(empty);
          return surface;
        }
      };

      const renderEmpty = (workspace) => {
        const activeTab = getActiveTab(workspace);
        root.innerHTML = \`
          <div class="empty">
            <div class="empty-badge">WB</div>
            <div class="empty-title">Whiteboard</div>
            <div class="empty-subtitle">\${String(activeTab?.title || "Board active")}</div>
          </div>
        \`;
      };

      const renderWorkspace = async (workspace) => {
        const activeTab = getActiveTab(workspace);
        if (!workspace?.isActive || !activeTab) {
          renderEmpty(workspace);
          return;
        }

        root.innerHTML = "";
        if (activeTab.type === "pdf" && activeTab.fileUrl) {
          const pdfSurface = await renderPdf(workspace, activeTab);
          if (getActiveTab(window.__whiteboardState)?.id === activeTab.id) {
            root.replaceChildren(pdfSurface);
          }
          return;
        }

        root.replaceChildren(renderBoard(workspace, activeTab));
      };

      window.__setWhiteboardState = (nextState) => {
        window.__whiteboardState = nextState;
        renderWorkspace(nextState);
      };

      window.__setWhiteboardState(WHITEBOARD_STATE);
      window.addEventListener("resize", () => {
        renderWorkspace(window.__whiteboardState);
      });
    </script>
  </body>
</html>`;

type Props = {
  workspace: WhiteboardWorkspace | null;
};

const WHITEBOARD_PREVIEW_PLACEHOLDER =
  normalizeWhiteboardWorkspace({ isActive: true, activeTabTitle: "Board" })!;

export default function WhiteboardPreview({ workspace }: Props) {
  const webViewRef = useRef<WebView | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const html = useMemo(
    () => createWhiteboardPreviewHtml(WHITEBOARD_PREVIEW_PLACEHOLDER),
    [],
  );
  const serializedWorkspace = useMemo(
    () => escapeHtmlJson(workspace || WHITEBOARD_PREVIEW_PLACEHOLDER),
    [workspace],
  );

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    webViewRef.current?.injectJavaScript(
      `window.__setWhiteboardState(${serializedWorkspace}); true;`,
    );
  }, [isLoaded, serializedWorkspace]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        originWhitelist={["*"]}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction
        onLoadEnd={() => setIsLoaded(true)}
        style={styles.webView}
      />
      {!isLoaded ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#8b5cf6" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: "#141922",
  },
  webView: {
    flex: 1,
    backgroundColor: "#141922",
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#141922",
  },
});
