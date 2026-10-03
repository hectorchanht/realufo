import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// findBy*/waitFor default to 1 s. Lazy route chunks (Map pulls in the map library)
// take longer than that on a busy machine, which made the full suite flaky
// (shell "More … lights on a More page", askShared) while each file passed alone.
// A passing wait still returns as soon as its condition holds.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no blob URLs; stub them so components can preview picked files
// (tests that care spy on these).
URL.createObjectURL ??= () => "blob:jsdom";
URL.revokeObjectURL ??= () => {};
