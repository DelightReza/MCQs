const fs = require('fs');

const rawQuestionsTs = fs.readFileSync('src/data/raw-questions.ts', 'utf8');

// The exported string is between backticks inside rawQuestionsData = ` ... `
const match = rawQuestionsTs.match(/export const rawQuestionsData = `([\s\S]*?)`;/);
if (match) {
  const content = match[1].trim();
  fs.mkdirSync('public/questionbanks', { recursive: true });
  fs.writeFileSync('public/questionbanks/GOS_QuizBank.txt', content);
  console.log('Saved GOS_QuizBank.txt');
} else {
  console.log('Could not find rawQuestionsData');
}
