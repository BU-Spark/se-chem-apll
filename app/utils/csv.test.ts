import { parseCsv, serializeCsv, CSV_UTF8_BOM } from './csv';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseCsv(`${CSV_UTF8_BOM}a,b\n1,2`)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted commas and escaped quotes', () => {
    expect(parseCsv('"hello, world","say ""hi"""\n2,3')).toEqual([
      ['hello, world', 'say "hi"'],
      ['2', '3'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('preserves empty trailing cells', () => {
    expect(parseCsv('a,b,\n1,,3')).toEqual([
      ['a', 'b', ''],
      ['1', '', '3'],
    ]);
  });
});

describe('serializeCsv', () => {
  it('round-trips quoted fields', () => {
    const rows = [
      ['type', 'prompt'],
      ['multipleChoice', 'What is 2, really?'],
      ['shortAnswer', 'Say "hello"'],
    ];
    const text = serializeCsv(rows);
    expect(parseCsv(text)).toEqual(rows);
  });
});
