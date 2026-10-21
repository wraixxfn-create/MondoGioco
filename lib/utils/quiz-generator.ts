import type { Country, QuizQuestion, QuizType, Difficulty } from "@/types";
import { COUNTRIES } from "@/data/countries";
import { shuffleArray } from "@/lib/utils";
import { v4FallbackId } from "@/lib/utils/id";

const TIME_LIMITS: Record<Difficulty, number> = {
  easy: 30,
  medium: 20,
  hard: 12,
};

/**
 * Genera un set di domande del quiz.
 */
export function generateQuiz(
  type: QuizType,
  difficulty: Difficulty,
  count: number = 10
): QuizQuestion[] {
  const shuffled = shuffleArray(COUNTRIES);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));
  return selected.map((country) =>
    generateQuestion(country, type, difficulty, COUNTRIES)
  );
}

function generateQuestion(
  country: Country,
  type: QuizType,
  difficulty: Difficulty,
  allCountries: Country[]
): QuizQuestion {
  const timeLimit = TIME_LIMITS[difficulty];
  const distractors = getDistractors(country, allCountries, 3);

  switch (type) {
    case "capital":
      return {
        id: v4FallbackId(),
        type,
        difficulty,
        country,
        prompt: `Qual è la capitale di ${country.name}?`,
        options: shuffleArray([
          country.capital,
          ...distractors.map((d) => d.capital),
        ]),
        correctAnswer: country.capital,
        timeLimit,
      };

    case "flag":
      return {
        id: v4FallbackId(),
        type,
        difficulty,
        country,
        prompt: `A quale paese appartiene questa bandiera? ${country.flag}`,
        options: shuffleArray([
          country.name,
          ...distractors.map((d) => d.name),
        ]),
        correctAnswer: country.name,
        timeLimit,
      };

    case "location":
      return {
        id: v4FallbackId(),
        type,
        difficulty,
        country,
        prompt: `Indica la posizione di ${country.name} sul globo.`,
        options: [country.name], // per il quiz location l'utente clicca sul globo
        correctAnswer: country.name,
        correctCoordinates: country.coordinates,
        timeLimit,
      };

    case "continent":
      return {
        id: v4FallbackId(),
        type,
        difficulty,
        country,
        prompt: `In quale continente si trova ${country.name}?`,
        options: shuffleArray([
          country.continent,
          ...getContinentDistractors(country.continent),
        ]),
        correctAnswer: country.continent,
        timeLimit,
      };

    case "population":
      return generatePopulationQuestion(country, distractors, difficulty);
  }
}

function generatePopulationQuestion(
  country: Country,
  distractors: Country[],
  difficulty: Difficulty
): QuizQuestion {
  const timeLimit = TIME_LIMITS[difficulty];
  const options = shuffleArray([
    country.name,
    ...distractors.map((d) => d.name),
  ]);
  const sorted = [country, ...distractors].sort(
    (a, b) => b.population - a.population
  );
  const mostPopulous = sorted[0];

  return {
    id: v4FallbackId(),
    type: "population",
    difficulty,
    country,
    prompt: `Quale di questi paesi ha la popolazione maggiore?`,
    options,
    correctAnswer: mostPopulous.name,
    timeLimit,
  };
}

function getDistractors(
  country: Country,
  allCountries: Country[],
  count: number
): Country[] {
  const others = allCountries.filter((c) => c.id !== country.id);
  return shuffleArray(others).slice(0, count);
}

function getContinentDistractors(continent: string): string[] {
  const all = [
    "europe",
    "asia",
    "africa",
    "north_america",
    "south_america",
    "oceania",
  ];
  return shuffleArray(all.filter((c) => c !== continent)).slice(0, 3);
}
