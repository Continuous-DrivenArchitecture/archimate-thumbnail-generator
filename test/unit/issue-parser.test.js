import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIssue, validateAttachmentUrl } from '../../src/issue-parser.js';

test('parses required model name and a single GitHub upload', () => {
  assert.deepEqual(parseIssue('### Model name\nArchitecture Model\n\n### Description\nTest\nhttps://github.com/user-attachments/files/1234/model.zip'), {
    modelName: 'Architecture Model', attachmentUrl: 'https://github.com/user-attachments/files/1234/model.zip'
  });
});

test('rejects absent or ambiguous issue attachments', () => {
  assert.throws(() => parseIssue('### Model name\nModel'), /No ZIP attachment/);
  assert.throws(() => parseIssue('### Model name\nModel\nhttps://github.com/user-attachments/files/1/a.zip https://github.com/user-attachments/files/2/b.zip'), /Exactly one/);
});

test('only accepts HTTPS GitHub attachment URLs', () => {
  assert.equal(validateAttachmentUrl('https://github.com/user-attachments/files/123/model.zip').hostname, 'github.com');
  for (const url of ['http://github.com/user-attachments/files/1/x.zip', 'https://example.com/a.zip', 'https://github.com@evil.test/user-attachments/files/1/x.zip']) {
    assert.throws(() => validateAttachmentUrl(url));
  }
});
