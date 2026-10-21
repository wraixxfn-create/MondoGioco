import { describe, it, expect } from "vitest";
import { generateQuiz } from "@/lib/utils/quiz-generator";
import type { QuizType, Difficulty } from "@/types";

describe("generateQuiz", () => {
  const quizTypes: QuizType[] = ["capital", "flag", "location", "continent", "population"];
  const difficulties: Difficulty[] = ["easy", "medium", "hard"];

  it("genera il numero corretto di domande", () => {
    const quiz = generateQuiz("capital", "easy", 10);
    expect(quiz).toHaveLength(10);
  });

  it("genera domande con ID unici", () => {
    const quiz = generateQuiz("capital", "easy", 10);
    const ids = new Set(quiz.map((q) => q.id));
    expect(ids.size).toBe(quiz.length);
  });

  for (const type of quizTypes) {
    for (const diff of difficulties) {
      it(`genera quiz ${type}/${diff} con domande valide`, () => {
        const quiz = generateQuiz(type, diff, 5);
        expect(quiz.length).toBeGreaterThan(0);

        for (const question of quiz) {
          expect(question.type).toBe(type);
          expect(question.difficulty).toBe(diff);
          expect(question.prompt).toBeTruthy();
          expect(question.correctAnswer).toBeTruthy();
          expect(question.timeLimit).toBeGreaterThan(0);

          if (type !== "location") {
            expect(question.options.length).toBeGreaterThanOrEqual(2);
            expect(question.options).toContain(question.correctAnswer);
          }
        }
      });
    }
  }

  it("quiz location ha coordinate corrette", () => {
    const quiz = generateQuiz("location", "easy", 5);
    for (const question of quiz) {
      expect(question.correctCoordinates).toBeDefined();
      expect(question.correctCoordinates!.lat).toBeGreaterThanOrEqual(-90);
      expect(question.correctCoordinates!.lat).toBeLessThanOrEqual(90);
      expect(question.correctCoordinates!.lng).toBeGreaterThanOrEqual(-180);
      expect(question.correctCoordinates!.lng).toBeLessThanOrEqual(180);
    }
  });

  it("timeLimit varia per difficoltà", () => {
    const easy = generateQuiz("capital", "easy", 1);
    const hard = generateQuiz("capital", "hard", 1);
    expect(easy[0].timeLimit).toBeGreaterThan(hard[0].timeLimit);
  });

  it("non genera più domande dei paesi disponibili", () => {
    const quiz = generateQuiz("capital", "easy", 100);
    expect(quiz.length).toBeLessThanOrEqual(100);
  });
});
