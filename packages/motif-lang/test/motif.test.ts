import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDocument, hashDocument, parse, roundtrip, serialize } from '../src/index.ts';
import { MirError, toMir, toMilliseconds } from '../src/mir.ts';
import { MotifError } from '../src/types.ts';

const SAMPLE = `// Beispiel
use gl("directionalwarp")

transition weicher_wisch {
  duration   = 18f
  ease       = cubic(0.22, 1, 0.36, 1)
  smoothness = 0.5
  direction  = [1, 0]
}
`;

test('parst use und transition', () => {
  const doc = parse(SAMPLE);
  assert.equal(doc.statements.length, 2);
  assert.equal(doc.statements[0].kind, 'use');
  assert.equal(doc.statements[1].kind, 'transition');
});

test('Einheiten bleiben am Wert haengen', () => {
  const doc = parse(SAMPLE);
  const transition = doc.statements[1];
  assert.equal(transition.kind, 'transition');
  const duration = transition.body.find((a) => a.name === 'duration')!;
  assert.deepEqual(duration.value, { kind: 'number', value: 18, unit: 'f' });
});

test('Roundtrip ist stabil: Text -> AST -> Text -> AST -> Text', () => {
  const once = roundtrip(SAMPLE);
  const twice = roundtrip(once);
  assert.equal(once, twice, 'Serialisierung muss deterministisch sein');
  assert.match(once, /use gl\("directionalwarp"\)/);
  assert.match(once, /duration\s+= 18f/);
});

test('animierte Werte sind ein eigener Typ', () => {
  const doc = parse(`
    use gl("crosswarp")
    transition t { mix = 0 -> 0.65 ease cubic(0.22, 1, 0.36, 1) }
  `);
  const transition = doc.statements[1];
  assert.equal(transition.kind, 'transition');
  const mix = transition.body[0].value;
  assert.equal(mix.kind, 'animated');
  assert.equal(serialize(doc).includes('0 -> 0.65 ease cubic(0.22, 1, 0.36, 1)'), true);
});

test('Frames werden ueber die Framerate zu Millisekunden', () => {
  assert.equal(toMilliseconds(25, 'f', 25), 1000);
  assert.equal(toMilliseconds(18, 'f', 25), 720);
  assert.equal(toMilliseconds(750, 'ms', 25), 750);
  assert.equal(toMilliseconds(1.5, 's', 25), 1500);
});

test('MIR loest Dauer auf und behaelt Parameter', () => {
  const mir = toMir(parse(SAMPLE), 25);
  assert.equal(mir.source, 'gl:directionalwarp');
  assert.equal(mir.durationMs, 720);
  assert.equal(mir.ease, 'cubic(0.22,1,0.36,1)');
  assert.deepEqual(mir.params.smoothness, { type: 'const', value: 0.5 });
  assert.deepEqual(mir.params.direction, { type: 'const', value: [1, 0] });
});

test('Einheiten sind Typen: eine Laenge als Dauer ist ein Fehler', () => {
  const doc = parse('use gl("x")\ntransition t { duration = 2.4px }');
  assert.throws(() => toMir(doc), MirError);
});

test('fehlender Node wird gemeldet, nicht stillschweigend geraten', () => {
  assert.throws(() => toMir(parse('transition t { duration = 10f }')), MirError);
});

test('Syntaxfehler nennen Zeile und Spalte', () => {
  try {
    parse('transition t { duration = }');
    assert.fail('haette werfen muessen');
  } catch (err) {
    assert.ok(err instanceof MotifError);
    assert.equal(err.line, 1);
    assert.ok(err.message.includes('Zeile 1'));
  }
});

test('buildDocument erzeugt lesbaren, wieder einlesbaren Text', () => {
  const doc = buildDocument({
    name: 'gridflip_v1',
    glTransition: 'GridFlip',
    durationFrames: 24,
    ease: 'linear',
    params: { size: [4, 4], pause: 0.1, bgcolor: [0, 0, 0, 1] },
  });
  const text = serialize(doc);
  assert.match(text, /use gl\("GridFlip"\)/);
  assert.match(text, /duration = 24f/);
  assert.match(text, /size\s+= \[4, 4\]/);

  const mir = toMir(parse(text), 25);
  assert.equal(mir.source, 'gl:GridFlip');
  assert.equal(mir.durationMs, 960);
});

test('Hash aendert sich nur bei inhaltlicher Aenderung', () => {
  const base = { name: 't', glTransition: 'GridFlip', durationFrames: 24, ease: 'linear', params: { size: 4 } };
  const a = hashDocument(buildDocument(base));
  const b = hashDocument(buildDocument({ ...base }));
  const c = hashDocument(buildDocument({ ...base, params: { size: 8 } }));
  assert.equal(a, b, 'gleicher Inhalt, gleicher Hash');
  assert.notEqual(a, c, 'anderer Parameter, anderer Hash');
});

test('Kommentare stoeren den Parser nicht', () => {
  const doc = parse('// oben\nuse gl("x") // rechts\ntransition t { duration = 1f }');
  assert.equal(doc.statements.length, 2);
});
