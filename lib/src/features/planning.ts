import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { acquire } from 'pi-code-core';
import { registerPlanning } from '../extensions/planning.ts';
import { canonical } from 'pi-code-core/runtime/utils';
export default function (pi: ExtensionAPI): void {
  const state = acquire(pi,'planning'); if (!state) return;
  const {runtime:r,features} = state;

    registerPlanning(r);
    pi.on('tool_call',async (e,ctx)=> {
      if (r.state.mode !== 'plan' || r.tools.has(e.toolName)) return;
      if (['read','grep','find','ls'].includes(e.toolName)) return;
      const input = e.input as any;
      if (['write','edit'].includes(e.toolName) && typeof input.path === 'string') {
        const {resolve} = await import('node:path');
        if (await canonical(resolve(ctx.cwd,input.path)) === r.state.plan?.path) return;
      }
      return {block:true,reason:'Plan mode restricts mutations to the designated plan file. Approve the plan with ExitPlanMode.'};
    });
    pi.on('user_bash',()=> r.state.mode === 'plan' ? {result:{output:'Shell is blocked during planning.',exitCode:1,cancelled:false,truncated:false}} : undefined);

}
