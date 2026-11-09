import fc from "fast-check";

// Every property test runs at least 100 times (Requirement 16.18).
fc.configureGlobal({ numRuns: 100 });
