/**
 * Chạy bởi Windows Task Scheduler: kiểm tra 1 kênh đã theo dõi.
 * Không cần tham số gì ngoài ID kênh (do schtasks truyền vào).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const id = process.argv[2];
if (!id) process.exit(0);

try {
  const token = readFileSync(join(process.env.LOCALAPPDATA || '.', 'pk-ai-token.txt'), 'utf8').trim();
  const res = await fetch('http://127.0.0.1:4180/ai/watch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pk-token': token },
    body: JSON.stringify({ action: 'run', id })
  });
  const j = await res.json().catch(() => ({}));
  console.log(new Date().toISOString(), 'watch', id, res.status, JSON.stringify(j).slice(0, 200));
} catch (e) {
  console.error('watch-run:', e.message);
  process.exit(1);
}
