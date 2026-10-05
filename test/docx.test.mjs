import test from 'node:test';
import assert from 'node:assert/strict';
import { docxText, wordXmlText } from '../src/app/docx.js';
import { makeDocx } from './docx-fixture.mjs';

const file = (buf, name = 'letter.docx') => new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

test('reads a Word letter: header (letterhead) first, then the body, then the footer', async () => {
  const buf = await makeDocx({
    header: ['Safer Futures Domestic Abuse Service', 'Registered charity 1234567'],
    paragraphs: ['Re: Jane Doe', '', 'I can confirm that we have supported Jane Doe & her children since <March>.', 'Name:\tAlex Smith'],
    footer: ['Safer Futures, 1 Example Road, Leeds LS1 1AA'],
  });
  const text = await docxText(file(buf));
  assert.equal(text, 'Safer Futures Domestic Abuse Service\nRegistered charity 1234567\n\nRe: Jane Doe\n\nI can confirm that we have supported Jane Doe & her children since <March>.\nName:\tAlex Smith\n\nSafer Futures, 1 Example Road, Leeds LS1 1AA');
});

test('keeps line breaks and decodes characters', () => {
  assert.equal(wordXmlText('<w:p><w:r><w:t>Dear</w:t></w:r><w:r><w:br/><w:t xml:space="preserve">Sir &#8211; Madam</w:t></w:r></w:p>'), 'Dear\nSir – Madam');
});

test('explains files it cannot read', async () => {
  await assert.rejects(docxText(file(Buffer.from('not a zip at all'))), /does not look like a Word \(\.docx\) file/);
});
