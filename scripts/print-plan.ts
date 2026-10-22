// Prints the expert maintenance plan as Markdown (docs/maintenance-plan.md is generated from it).
//   npx tsx --tsconfig tsconfig.node.json scripts/print-plan.ts > docs/maintenance-plan.md
import { describeRecurrence } from '../src/shared/recurrence';
import { SEED_GROUPS, SEED_TASKS, type SeedGroup } from '../src/shared/seed';
import { zoneDef } from '../src/shared/zones';

const out: string[] = [
  '# Expert maintenance plan',
  '',
  'Generated from `src/shared/seed.ts` — the schedule a new household starts with. Each item carries',
  'the "why", step-by-step instructions, supplies and safety notes shown in the app. First due dates',
  'are staggered from the setup day so unknown-history fire and water risks come up first.',
  '',
];
for (const group of Object.keys(SEED_GROUPS) as SeedGroup[]) {
  out.push(`## ${SEED_GROUPS[group].title}`, '', SEED_GROUPS[group].description, '');
  out.push('| Task | Where | How often | First due | Priority | Risks | Time |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const seed of SEED_TASKS.filter((s) => s.group === group)) {
    const first = seed.firstDueInDays !== undefined ? `day ${seed.firstDueInDays}` : 'next listed month';
    out.push(
      `| ${seed.title} | ${zoneDef(seed.zoneId).name} | ${describeRecurrence(seed.recurrence)} | ${first} | ${seed.priority} | ${seed.risks.join(', ') || '—'} | ${seed.estimateMinutes} min |`,
    );
  }
  out.push('');
}
out.push('## Why each item matters', '');
for (const seed of SEED_TASKS) out.push(`- **${seed.title}** — ${seed.guide.why}`);
out.push('');
console.log(out.join('\n'));
