import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIssue, validateAttachmentUrl } from '../../src/issue-parser.js';

test('parses a single GitHub model upload without requiring a manually entered name', () => {
  assert.deepEqual(parseIssue('### Description\nTest\nhttps://github.com/user-attachments/files/1234/model.archimate'), {
    attachmentUrl: 'https://github.com/user-attachments/files/1234/model.archimate'
  });
});

test('rejects absent or ambiguous issue attachments', () => {
  assert.throws(() => parseIssue('### Description\nNo attachment'), /No .archimate attachment/);
  assert.throws(() => parseIssue('https://github.com/user-attachments/files/1/a.archimate https://github.com/user-attachments/files/2/b.archimate'), /Attach exactly one/);
});

test('only accepts HTTPS GitHub attachment URLs', () => {
  assert.equal(validateAttachmentUrl('https://github.com/user-attachments/files/123/model.archimate').hostname, 'github.com');
  for (const url of ['http://github.com/user-attachments/files/1/x.archimate', 'https://example.com/a.archimate', 'https://github.com@evil.test/user-attachments/files/1/x.archimate']) {
    assert.throws(() => validateAttachmentUrl(url));
  }
});
