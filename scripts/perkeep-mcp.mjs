#!/usr/bin/env bun
/**
 * MCP server "perkeep" cho OpenCode.
 * Tên tool ngắn; OpenCode tự thêm tiền tố server -> perkeep_search, perkeep_tag...
 *
 * Đọc: search, describe, get_text, stats, dupes
 * Ghi : add_video_link, tag   (mặc định bị permission deny; bridge gọi trực tiếp)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  search, getText, mapItem, findDupes, createVideoLink, setTag, BASE
} from './perkeep-lib.mjs';

const log = (...a) => console.error('[perkeep-mcp]', ...a);
const short = (r) => String(r || '').slice(0, 14) + '…';

const toolResult = (payload, summary) => ({
  content: [
    { type: 'text', text: summary },
    { type: 'text', text: JSON.stringify(payload, null, 2) }
  ]
});

const server = new McpServer({ name: 'perkeep', version: '1.0.0' });

server.tool(
  'search',
  'Tìm trong thư viện Perkeep bằng biểu thức (vd: filename:*.mp4, tag:youtube, before:2026-10-01, title:"mèo" ảnh). Trả về tối đa `limit` mục gần nhất kèm tên, mime, kích thước, ngày, tag, blobref.',
  {
    expression: z.string().describe('Biểu thức Perkeep. Để trống "" để lấy mục mới nhất.'),
    limit: z.number().int().min(1).max(50).optional()
  },
  async ({ expression, limit }) => {
    const items = await search(expression || '', limit || 20);
    const summary = items.length
      ? `Tìm thấy ${items.length} mục${expression ? ` cho "${expression}"` : ''}. Mới nhất: ${items.slice(0, 3).map((i) => i.name).join(' | ')}`
      : `Không có mục nào${expression ? ` cho "${expression}"` : ''}.`;
    return toolResult({ expression, count: items.length, items }, summary);
  }
);

server.tool(
  'describe',
  'Lấy metadata đầy đủ (thuộc tính permanode, file, tag) của một blobref trong Perkeep.',
  { blobref: z.string() },
  async ({ blobref }) => {
    const items = await search(`ref:${blobref}`, 1);
    if (!items.length) return toolResult({ blobref, found: false }, `Không tìm thấy ${short(blobref)} trong index.`);
    return toolResult({ blobref, item: items[0] }, `Đã lấy metadata của ${items[0].name}.`);
  }
);

server.tool(
  'get_text',
  'Đọc nội dung text/JSON của một file trong Perkeep (chặn nhị phân, tối đa maxBytes).',
  {
    blobref: z.string(),
    maxBytes: z.number().int().min(100).max(200000).optional()
  },
  async ({ blobref, maxBytes }) => {
    let ref = blobref;
    try {
      const items = await search(`ref:${blobref}`, 1);
      if (items[0]?.fileRef) ref = items[0].fileRef;
      if (items[0]?.mime && !/^(text\/|application\/(json|xml|x-ndjson))/.test(items[0].mime)) {
        return toolResult({ blobref, mime: items[0].mime }, `Từ chối: ${items[0].mime} không phải text.`);
      }
    } catch {}
    const r = await getText(ref, maxBytes || 50000);
    if (r.binary) return toolResult({ blobref: ref, bytes: r.bytes }, 'Từ chối: nội dung nhị phân.');
    return toolResult(
      { blobref: ref, bytes: r.bytes, truncated: r.truncated, text: r.text },
      `Đọc ${Math.min(r.bytes, maxBytes || 50000)} byte của ${short(ref)}.`
    );
  }
);

server.tool(
  'stats',
  'Thống kê nhanh thư viện: số video/ảnh/tài liệu/link, tag phổ biến.',
  {},
  async () => {
    const [videos, images, docs, links] = await Promise.all([
      search('(filename:*.mp4 or filename:*.mov or filename:*.mkv or filename:*.webm)', 50),
      search('(filename:*.jpg or filename:*.jpeg or filename:*.png or filename:*.heic)', 50),
      search('(filename:*.pdf or filename:*.epub or filename:*.txt or filename:*.json)', 50),
      search('tag:video-link', 50)
    ]);
    const tags = new Map();
    for (const it of [...videos, ...images, ...docs, ...links]) {
      for (const t of it.tags) tags.set(t, (tags.get(t) || 0) + 1);
    }
    const top = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, n]) => ({ tag, n }));
    return toolResult(
      { videos: videos.length, images: images.length, docs: docs.length, links: links.length, topTags: top },
      `Thư viện: ${videos.length} video, ${images.length} ảnh, ${docs.length} tài liệu, ${links.length} video link.`
    );
  }
);

server.tool(
  'dupes',
  'Tìm các mục trùng nội dung (nhiều permanode cùng một file). Perkeep đã dedup dung lượng; đây là trùng mục.',
  { limit: z.number().int().min(10).max(300).optional() },
  async ({ limit }) => {
    const groups = await findDupes(limit || 200);
    const summary = groups.length
      ? `Có ${groups.length} nhóm trùng nội dung (${groups.reduce((n, g) => n + g.items.length, 0)} mục).`
      : 'Không có mục trùng nội dung.';
    return toolResult({ groups }, summary);
  }
);

server.tool(
  'add_video_link',
  'Thêm một video link (YouTube...) vào Perkeep: tạo file JSON + permanode + tag video-link. Trả về permanode.',
  {
    url: z.string(),
    title: z.string(),
    site: z.string().optional(),
    duration: z.number().optional(),
    author: z.string().optional(),
    thumbnail: z.string().optional(),
    tags: z.array(z.string()).optional()
  },
  async (info) => {
    const r = await createVideoLink(info);
    return toolResult(r, `Đã lưu "${info.title}" (${r.permaRef.slice(0, 16)}…).`);
  }
);

server.tool(
  'tag',
  'Gắn hoặc bỏ một tag trên permanode Perkeep.',
  {
    permanode: z.string(),
    tag: z.string(),
    add: z.boolean().optional()
  },
  async ({ permanode, tag, add }) => {
    const ref = await setTag(permanode, tag, add !== false);
    return toolResult({ permanode, tag, add: add !== false, claim: ref }, `Đã ${add === false ? 'bỏ' : 'gắn'} tag "${tag}".`);
  }
);

await server.connect(new StdioServerTransport());
log(`ready · ${BASE}`);
