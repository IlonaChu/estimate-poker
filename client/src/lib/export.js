import { TEAMS, roundTitle } from './constants.js';

function rows(rounds) {
  return rounds.map((r) => ({
    round: r.number,
    story: roundTitle(r),
    link: r.link || '',
    teams: TEAMS.map((t) => r.final?.teams?.[t.id] ?? ''),
    total: r.final?.total ?? '',
    attempts: r.attempts,
    consensus: r.consensus === null ? '' : r.consensus ? 'yes' : 'no',
  }));
}

export function toMarkdown(rounds, hostName) {
  const head = ['#', 'Story', ...TEAMS.map((t) => t.label), 'Total', 'Attempts', 'Consensus'];
  const lines = [
    `# Refinement summary${hostName ? ` (PO: ${hostName})` : ''}`,
    '',
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
  ];
  for (const r of rows(rounds)) {
    const story = r.link ? `[${r.story}](${r.link})` : r.story;
    const cells = [r.round, story.replace(/\|/g, '\\|'), ...r.teams.map((v) => v || '—'), r.total === '' ? '—' : r.total, r.attempts, r.consensus || '—'];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(rounds) {
  const head = ['Round', 'Story', 'Link', ...TEAMS.map((t) => t.label), 'Total', 'Attempts', 'Consensus'];
  const lines = [head.map(csvCell).join(',')];
  for (const r of rows(rounds)) {
    lines.push([r.round, r.story, r.link, ...r.teams, r.total, r.attempts, r.consensus].map(csvCell).join(','));
  }
  return lines.join('\n');
}

export function download(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
