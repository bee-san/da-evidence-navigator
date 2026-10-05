import test from 'node:test';
import assert from 'node:assert/strict';
import { textToDocx, documentXml } from '../src/app/docx-write.js';
import { docxText } from '../src/app/docx.js';

test('writes a Word document that reads back as the same text', async () => {
  const text = 'Dear [name],\n\nI can confirm [specific matters] & more.\n\nSigned';
  assert.equal(await docxText(new Blob([textToDocx(text)])), text);
});

test('highlights only the parts in square brackets', () => {
  const xml = documentXml('Seen on [date] by me');
  const runs = [...xml.matchAll(/<w:r>(.*?)<\/w:r>/g)].map((m) => [/w:highlight/.test(m[1]), m[1].match(/<w:t[^>]*>(.*)<\/w:t>/)[1]]);
  assert.deepEqual(runs, [[false, 'Seen on '], [true, '[date]'], [false, ' by me']]);
});
