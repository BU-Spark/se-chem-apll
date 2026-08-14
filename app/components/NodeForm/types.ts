import { generateClientId } from '@/lib/generateClientId';
import { getMultipleChoiceChoices } from '@/app/utils/multipleChoice';
import { parseShortAnswerOptions } from '@/app/utils/shortAnswer';

export type QuestionType = 'multipleChoice' | 'shortAnswer';
export type ShortAnswerMode = 'exact' | 'range';

export interface FormQuestion {
  id: string;
  prompt: string;
  questionType: QuestionType;
  choices: string[];
  correctIndices: number[];
  answerMode: ShortAnswerMode;
  expectedAnswer: string;
  minimumAnswer: string;
  maximumAnswer: string;
}

export interface FormCheckpoint {
  id: string;
  timeOffsetSeconds: number;
  questions: FormQuestion[];
}

export function makeQuestion(id = generateClientId('question')): FormQuestion {
  return {
    id,
    prompt: '',
    questionType: 'multipleChoice',
    choices: ['', ''],
    correctIndices: [],
    answerMode: 'exact',
    expectedAnswer: '',
    minimumAnswer: '',
    maximumAnswer: '',
  };
}

export function makeCheckpoint(timeOffsetSeconds = 0, id = generateClientId('checkpoint')): FormCheckpoint {
  return {
    id,
    timeOffsetSeconds,
    questions: [makeQuestion()],
  };
}

export function serializeQuestionOptions(q: FormQuestion) {
  if (q.questionType === 'multipleChoice') {
    return { type: 'multipleChoice' as const, choices: q.choices };
  }
  if (q.answerMode === 'exact') {
    return {
      type: 'shortAnswer' as const,
      answerMode: 'exact' as const,
      expectedAnswer: q.expectedAnswer.trim() === '' ? Number.NaN : Number(q.expectedAnswer),
    };
  }
  return {
    type: 'shortAnswer' as const,
    answerMode: 'range' as const,
    minimumAnswer: q.minimumAnswer.trim() === '' ? Number.NaN : Number(q.minimumAnswer),
    maximumAnswer: q.maximumAnswer.trim() === '' ? Number.NaN : Number(q.maximumAnswer),
  };
}

export function dbQuestionToForm(q: {
  id: string;
  prompt: string;
  options: unknown;
  correctIndices: number[];
}): FormQuestion {
  const shortAnswer = parseShortAnswerOptions(q.options);
  const isShortAnswer = shortAnswer !== null;
  return {
    id: q.id,
    prompt: q.prompt,
    questionType: isShortAnswer ? 'shortAnswer' : 'multipleChoice',
    choices: isShortAnswer ? ['', ''] : (getMultipleChoiceChoices(q.options) ?? ['', '']),
    correctIndices: q.correctIndices,
    answerMode: shortAnswer?.answerMode ?? 'exact',
    expectedAnswer: shortAnswer?.answerMode === 'exact' ? String(shortAnswer.expectedAnswer) : '',
    minimumAnswer: shortAnswer?.answerMode === 'range' ? String(shortAnswer.minimumAnswer) : '',
    maximumAnswer: shortAnswer?.answerMode === 'range' ? String(shortAnswer.maximumAnswer) : '',
  };
}

export type NodeFormInitial = {
  title: string;
  summary: string;
  videoUrl: string;
  learningObjectives: string[];
  checkpoints: Array<{
    id: string;
    timeOffsetSeconds: number;
    questions: Array<{
      id: string;
      prompt: string;
      options: unknown;
      correctIndices: number[];
    }>;
  }>;
  quizQuestions: Array<{
    id: string;
    prompt: string;
    options: unknown;
    correctIndices: number[];
  }>;
};
