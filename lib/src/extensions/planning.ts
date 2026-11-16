import { Type } from 'typebox';
import { join } from 'node:path';
import type { Runtime } from '@kabaevroman/pi-code-core/runtime/runtime';
import { canonical, hash, optionalText, textResult, humanReadable } from '@kabaevroman/pi-code-core/runtime/utils';
import { object } from '@kabaevroman/pi-code-core/runtime/schema';
export function registerPlanning(runtime: Runtime): void {
  runtime.register(object({}), 'EnterPlanMode', 'Enter read-only planning. Shell/unknown tools are blocked. Only the designated plan file may be edited. ExitPlanMode requires explicit UI approval of its content hash.', true, async () => {
    if (runtime.state.mode !== 'plan') {
      const path = await canonical(join(runtime.store, 'plans', 'plan.md'));
      runtime.state.plan = { path, previousMode: runtime.state.mode, status: 'draft' };
      runtime.state.mode = 'plan'; runtime.persist();
    } else if (!runtime.state.plan) {
      runtime.state.plan = { path: await canonical(join(runtime.store, 'plans', 'plan.md')), previousMode: 'default', status: 'draft' }; runtime.persist();
    }
    return textResult(`Plan mode active. Write the plan to ${runtime.state.plan!.path}. Source edits and shell execution are blocked.`, { plan: runtime.state.plan });
  });
  runtime.register(object({}), 'ExitPlanMode', 'Present the current plan for explicit approval through the user UI. Approval is bound to the plan SHA-256; denial keeps plan mode active.', true, async (_input, ctx, signal) => {
    const plan = runtime.state.plan;
    if (runtime.state.mode !== 'plan' || !plan) throw new Error('Enter plan mode first');
    const text = await optionalText(plan.path); if (!text?.trim()) throw new Error('Write a non-empty plan before requesting approval');
    const revision = hash(text);
    const approved = await runtime.approvals.request(ctx, `Approve plan ${revision.slice(0,12)}?`, `${plan.path}\n\n${text}`, signal);
    const current = await optionalText(plan.path);
    if (current === undefined || hash(current) !== revision) throw new Error('Plan changed during approval; review the revised plan');
    plan.status = approved ? 'approved' : 'rejected';
    if (approved) { plan.approvedHash = revision; runtime.state.mode = plan.previousMode; }
    runtime.persist();
    return textResult(approved ? `Approved plan ${revision}. Mode restored to ${runtime.state.mode}.` : 'Plan was not approved. Remain in plan mode.', { approved, revision });
  });
  runtime.register(object({ questions: Type.Array(object({ question: Type.String({ minLength: 1 }), header: Type.String(), options: Type.Array(object({ label: Type.String(), description: Type.String() }), { minItems: 2, maxItems: 4 }), multiSelect: Type.Optional(Type.Literal(false)) }), { minItems: 1, maxItems: 4 }) }), 'AskUserQuestion', 'Ask up to four questions via TUI/RPC. Single-select options and a free-text answer are supported. Unattended execution fails explicitly.', true, async (input, ctx, signal) => {
    if (!ctx.hasUI) throw new Error('AskUserQuestion requires a connected TUI or RPC UI');
    const answers: Record<string,string> = {};
    for (const question of input.questions) {
      const other = '[Enter a custom answer]';
      const selected = await ctx.ui.select(question.question, [...question.options.map((o: any) => `${o.label}: ${o.description}`), other], { signal });
      if (!selected) throw new Error('Question cancelled');
      const answer = selected === other ? await ctx.ui.input(question.question, '', { signal }) : selected;
      if (answer === undefined) throw new Error('Question cancelled');
      answers[question.question] = answer;
    }
    return textResult(humanReadable({ answers }), { answers });
  });
}
