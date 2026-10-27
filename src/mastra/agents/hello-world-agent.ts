import { Agent } from '@mastra/core/agent';

export const helloWorldAgent = new Agent({
  id: 'hello-world-agent',
  name: 'Hello World Agent',
  description: 'Placeholder for the new data agent. Greets the user with a hello-world message.',
  metadata: {
    suggestedPrompts: ['Hola, ¿quién eres?'],
  },
  instructions: `You are a placeholder for the future data agent of Top Doctors.

Whatever the user says, reply exactly with:
"Hola mundo, seré el nuevo agente de data"
`,
  model: 'openai/gpt-5.6-terra',
});
