// Parses a bro id list like "1,2,4-6,7" into a sorted, de-duplicated array
// of integers: [1, 2, 4, 5, 6, 7].
export function parseIdList(str) {
  const ids = new Set();
  for (const rawPart of str.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;

    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      const [lo, hi] = start <= end ? [start, end] : [end, start];
      for (let i = lo; i <= hi; i++) ids.add(i);
    } else if (/^\d+$/.test(part)) {
      ids.add(Number(part));
    } else {
      throw new Error(`Invalid id or range: "${part}"`);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

const URL_RE = /^https?:\/\//i;

// Splits argv into { list, url, country, protocol }. Both `list` and `url`
// are order-independent positional args; whichever looks like a URL becomes
// `url`, the other becomes `list`.
export function parseArgs(argv) {
  const positional = [];
  let country;
  let protocol;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--country' || arg === '-c') {
      country = argv[++i];
    } else if (arg.startsWith('--country=')) {
      country = arg.slice('--country='.length);
    } else if (arg === '--protocol' || arg === '-p') {
      protocol = argv[++i];
    } else if (arg.startsWith('--protocol=')) {
      protocol = arg.slice('--protocol='.length);
    } else if (arg === '--help' || arg === '-h') {
      positional.push(arg);
    } else {
      positional.push(arg);
    }
  }

  const help = positional.includes('--help') || positional.includes('-h');
  const rest = positional.filter((a) => a !== '--help' && a !== '-h');

  let list;
  let url;
  for (const token of rest) {
    if (URL_RE.test(token)) {
      if (url === undefined) url = token;
    } else if (list === undefined) {
      list = token;
    }
  }

  return { list, url, country, protocol, help };
}
