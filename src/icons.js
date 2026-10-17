// Bộ icon SVG đồng nhất: 24x24, nét 1.8, bo tròn, ăn theo currentColor.
// Dùng chung cho nav, danh sách file, sheet thao tác, nút sửa/xóa...
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  sparkle:
    '<path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z"/><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  send: '<path d="M12 19V6M6 12l6-6 6 6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4.2l3 1.8"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.8V21h13V9.8"/><path d="M9.5 21v-6h5v6"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17.5 9 12l4 4.5 2.5-2.5L20 19"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2L10 4h4l1.5 2h2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.2"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l2 2.2h7.8A2.5 2.5 0 0 1 21 9.7v7.8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/>',
  settings:
    '<path d="M4 7h4M12 7h8"/><path d="M4 12h9M17 12h3"/><path d="M4 17h2M10 17h10"/><circle cx="10" cy="7" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="8" cy="17" r="1.8"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  more: '<circle cx="12" cy="5.2" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="18.8" r="1.7"/>',
  edit: '<path d="M4 20h4.2L19 9.2a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8z"/><path d="M14.2 6.6 17.4 9.8"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7"/><path d="M6.5 7 7.6 20h8.8L17.5 7"/><path d="M10.5 11v5.5M13.5 11v5.5"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2.5"/><rect x="3" y="13" width="18" height="7" rx="2.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3.2 3.6 3.2 14.4 0 18c-3.2-3.6-3.2-14.4 0-18z"/>',
  pulse: '<path d="M3 12.5h4l2.5-6.5 4 13 2.5-6.5H21"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6.2M12 7.6h.01"/>',
  download: '<path d="M12 4v11"/><path d="M7.6 10.8 12 15.2l4.4-4.4"/><path d="M5 19.5h14"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.1 1.1"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.1-1.1"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4.5 11 13.5"/><path d="M19 14.5V18a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V7.5A2.5 2.5 0 0 1 6 5h3.5"/>',
  upload: '<path d="M12 20V9"/><path d="M7.6 13.2 12 8.8l4.4 4.4"/><path d="M5 4.5h14"/>',
  doc: '<path d="M14 3.5H7.5A2.5 2.5 0 0 0 5 6v12a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18V8.5z"/><path d="M14 3.5V8.5h5"/><path d="M8.8 13h6.4M8.8 16.5h4.4"/>',
  video: '<rect x="3" y="6" width="12" height="12" rx="2.5"/><path d="M15 10.5 21 7v10l-6-3.5z"/>',
  audio: '<circle cx="7" cy="17.2" r="2.6"/><circle cx="18" cy="15.2" r="2.6"/><path d="M9.6 17.2V6.8L20.6 4.8v10.4"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.8"/><path d="M5 9v10.5h14V9"/><path d="M10 13h4"/>',
  file: '<path d="M14 3.5H7.5A2.5 2.5 0 0 0 5 6v12a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18V8.5z"/><path d="M14 3.5V8.5h5"/>',
  star: '<path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.8l5.9-.8z"/>',
  list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4.2" cy="6.5" r="1.1"/><circle cx="4.2" cy="12" r="1.1"/><circle cx="4.2" cy="17.5" r="1.1"/>',
  grid: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.8"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  filterOff: '<path d="M3.5 5.5h17l-6.5 7.3v5.7l-4-2v-3.7z"/><path d="M4 4l16 16"/>',
  chevron: '<path d="M9.5 6l6 6-6 6"/>',
  check: '<path d="M5 12.5 9.5 17 19 7.5"/>'
};

export function icon(name, size = 22, cls = '') {
  const d = P[name] || P.file;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

// Chọn icon theo MIME của file
export function iconForMime(mime) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.includes('pdf') || m.includes('word') || m.includes('document') || m.includes('sheet') || m.includes('excel')) return 'doc';
  if (m.includes('zip') || m.includes('tar') || m.includes('gzip') || m.includes('epub')) return 'archive';
  if (m.includes('json') || m.startsWith('text/')) return 'file';
  return 'file';
}
