import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../data/dashboard.html', import.meta.url), 'utf8');
const source = html.match(/function repositoryLink\(value\) \{[\s\S]*?\n\}/)[0];
const repositoryLink = runInNewContext('(' + source + ')', {
  URL,
  el: (tag, cls, textContent) => ({tag, textContent}),
});

test('repository web links retain their label and open in an isolated tab', () => {
  for (const href of ['https://github.com/team/repo', 'http://git.internal/team/repo']) {
    const link = repositoryLink(href);
    assert.equal(link.tag, 'a');
    assert.equal(link.href, href);
    assert.equal(link.textContent, href.replace('https://github.com/', ''));
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
});

test('other schemes and invalid repository URLs render as text only', () => {
  for (const value of ['javascript:', 'data:,example', 'file:///tmp/repo', '//git.example/repo', '<unknown>', '']) {
    const label = repositoryLink(value);
    assert.equal(label.tag, 'span');
    assert.equal(label.textContent, value);
    assert.equal(label.href, undefined);
  }
});
