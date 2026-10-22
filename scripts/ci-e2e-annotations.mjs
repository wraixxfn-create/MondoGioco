#!/usr/bin/env node
/**
 * Trasforma i fallimenti Playwright in annotazioni GitHub (`::error`), così i
 * dettagli sono visibili anche quando i log completi del job non sono
 * scaricabili. Uso previsto: step CI eseguito solo se i test E2E falliscono.
 */
import { existsSync, readFileSync } from "node:fs";

const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "test-results/results.json";

if (!existsSync(reportPath)) {
  console.log(`::warning::Report Playwright non trovato in ${reportPath}`);
  process.exit(0);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (error) {
  console.log(`::warning::Report Playwright non leggibile: ${String(error)}`);
  process.exit(0);
}

const escapeData = (value) =>
  String(value ?? "")
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
const escapeProp = (value) => escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");

const failures = [];

function visitSuite(suite, trail) {
  const path = [...trail, suite.title].filter(Boolean);
  for (const spec of suite.specs ?? []) {
    const failed = (spec.tests ?? []).filter((test) =>
      (test.results ?? []).some(
        (result) => result.status !== "passed" && result.status !== "skipped"
      )
    );
    if (failed.length > 0) {
      const messages = failed
        .flatMap((test) => test.results ?? [])
        .filter((result) => result.status !== "passed" && result.status !== "skipped")
        .map((result) => result.error?.message ?? result.status)
        .filter(Boolean);
      failures.push({
        file: spec.file ?? suite.file,
        title: [...path.slice(1), spec.title].join(" › "),
        message: messages.join(" | "),
      });
    }
  }
  for (const child of suite.suites ?? []) visitSuite(child, path);
}

for (const suite of report.suites ?? []) visitSuite(suite, []);

if (failures.length === 0) {
  console.log("::warning::Report Playwright senza fallimenti registrati");
  process.exit(0);
}

for (const failure of failures.slice(0, 25)) {
  console.log(
    `::error file=${escapeProp(failure.file)},title=${escapeProp(failure.title)}::${escapeData(
      failure.message.slice(0, 1200)
    )}`
  );
}
console.log(`Totale test E2E falliti: ${failures.length}`);
