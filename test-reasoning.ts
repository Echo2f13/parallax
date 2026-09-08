import { ToolExecutor } from './src/tools/registry/tool.executor.js';
import { toolRegistry } from './src/tools/registry/tool.registry.js';
import { ChatGPTReasoningProvider } from './src/reasoning/providers/chatgpt.reasoning.provider.js';
import { setReasoningProvider } from './src/reasoning/reasoning.store.js';
import { registerReasoningTools } from './src/tools/reasoning/reasoning.tools.js';

async function run() {
  console.log('Registering tools...');
  registerReasoningTools(toolRegistry);
  console.log('Setting provider...');
  setReasoningProvider(new ChatGPTReasoningProvider());
  console.log('Running tool...');
  
  // Create a real session via API to satisfy foreign keys
  const res = await fetch('http://localhost:3000/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objective: 'test reasoning tool' })
  });
  const session = await res.json();
  
  try {
    const executor = new ToolExecutor();
    const result = await executor.execute(
      'ask_reasoning_agent',
      {
        question: 'Are you willing to relocate to Hyderabad?',
        options: 'Yes, No',
        company: 'Test Corp',
        role: 'Software Engineer'
      },
      { sessionId: session.id, taskId: 'test', workspacePath: '.' },
      session.id,
      undefined
    );
    console.log('RESULT:', result.output);
  } catch (err) {
    console.error('ERROR:', err);
  }
}
run();
