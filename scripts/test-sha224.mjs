import { sha224hex, blobRefOf } from '../src/sha224.js';
import crypto from 'node:crypto';

const ref = (s) => crypto.createHash('sha224').update(s, 'utf8').digest('hex');

const cases = [
  '',
  'abc',
  'The quick brown fox jumps over the lazy dog',
  'a'.repeat(55),
  'a'.repeat(56),
  'a'.repeat(64),
  'a'.repeat(65),
  'a'.repeat(1000),
  JSON.stringify({ camliVersion: 1, camliType: 'claim', attribute: 'tag', value: 'tiếng Việt' }),
  '{"attribute":"tag","camliSigner":"sha224-fbe0d348bb0b978ef4afb6550f0d153772a609a74090b8eac1867e9c","camliType":"claim"}',
  'x'.repeat(200000),
];

let bad = 0;
for (const c of cases) {
  const mine = sha224hex(c);
  const want = ref(c);
  const ok = mine === want;
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'SAI'}  len=${String(c.length).padStart(6)}  ${mine.slice(0, 20)}…  ${ok ? '' : 'want ' + want.slice(0, 20)}`);
}
// vector chuẩn NIST
console.log('\nNIST sha224("") =', sha224hex('') === 'd14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f');
console.log('NIST sha224("abc") =', sha224hex('abc') === '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7');
console.log('blobRefOf("abc") =', blobRefOf('abc'));
console.log(bad === 0 ? '\nTẤT CẢ ĐÚNG' : `\n${bad} CASE SAI`);
