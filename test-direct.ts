import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.CLAUDECHIP_API_KEY,
  baseURL: process.env.CLAUDECHIP_BASE_URL,
});

const QUESTIONS = [
  "What is the time complexity of quicksort?",
  "Explain how Docker containers work",
  "What is the difference between TCP and UDP?",
  "How does React's useEffect hook work?",
  "What is a SQL injection attack?",
  "Explain the CAP theorem in distributed systems",
  "What is the purpose of webpack?",
  "How does garbage collection work in JavaScript?",
  "What are the benefits of TypeScript over JavaScript?",
  "Explain how Git branching works"
];

async function test() {
  console.log('Testing all 10 questions...\n');
  let passed = 0;

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    console.log(`[${i+1}/10] ${q}`);
    try {
      const response = await client.messages.create({
        model: 'glm-5.1',
        max_tokens: 200,
        messages: [{ role: 'user', content: q }],
      });
      const text = response.content[0].text;
      console.log(`✅ Response: ${text.substring(0, 100)}...`);
      console.log(`   Tokens: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}\n`);
      passed++;
    } catch (err: any) {
      console.log(`❌ Error: ${err.message}\n`);
    }
  }

  console.log(`\n=== Results: ${passed}/${QUESTIONS.length} passed ===`);
}

test();
