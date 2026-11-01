// ts shapes for the two types of node data the lesson ui uses
// node in the library
export interface PaletteNode {
  id: string;
  title: string;
  summary: string | null;
  quizBankCount: number;
  checkpointCount: number;
}
// node in the lesson
export interface LessonNodeEntry {
  instanceId: string;
  nodeId: string;
  title: string;
  passingPercent: string;
  quizQuestionCount: string;
  isRequired: boolean;
  quizBankCount: number;
}
