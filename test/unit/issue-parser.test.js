import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIssue, validateAttachmentUrl } from '../../src/issue-parser.js';

test('parses a directly attached text copy without requiring a manually entered name', () => {
  assert.deepEqual(parseIssue('### Attachment\nhttps://github.com/user-attachments/files/1234/model.archimate.txt'), {
    attachmentUrl: 'https://github.com/user-attachments/files/1234/model.archimate.txt'
  });
});

test('rejects absent or ambiguous issue attachments', () => {
  assert.throws(() => parseIssue('### Attachment\nNo attachment'), /No model attachment/);
  assert.throws(() => parseIssue('https://github.com/user-attachments/files/1/a.txt https://github.com/user-attachments/files/2/b.txt'), /Attach exactly one/);
});

test('only accepts HTTPS GitHub attachment URLs', () => {
  assert.equal(validateAttachmentUrl('https://github.com/user-attachments/files/123/model.archimate.txt').hostname, 'github.com');
  for (const url of ['http://github.com/user-attachments/files/1/x.txt', 'https://example.com/a.txt', 'https://github.com@evil.test/user-attachments/files/1/x.txt']) {
    assert.throws(() => validateAttachmentUrl(url));
  }
});
