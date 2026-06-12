# QuizDroid

QuizDroid is an interactive application for practicing multiple-choice questions (MCQs). Master your knowledge with focused sessions, track your performance, and customize your question banks.

## Features

- **Practice Mode**: Answer questions and get immediate feedback.
- **Exam Mode**: Test your knowledge in a timed environment.
- **Custom Question Banks**: Upload your own questions using a simple `.txt` format.
- **Responsive Design**: Works perfectly on both desktop and mobile devices.

## Question Bank Format

Create your custom question bank by formatting a text file like this:

```
Q: What is the main function of the heart?
To digest food
* To pump blood
To filter urine
To breathe air

---

Q: Which planet is known as the Red Planet?
Earth
Venus
* Mars
Jupiter
```

- Each question must start with `Q:`
- Place a `*` before the correct answer.
- Separate each question with `---` on a new line.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Technologies Used

- React (Vite)
- Tailwind CSS
- TypeScript
- Lucide React
- Framer Motion

## License

This project is open-source and free to use.
