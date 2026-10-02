import "@testing-library/jest-dom";

// jsdom has no blob URLs; stub them so components can preview picked files
// (tests that care spy on these).
URL.createObjectURL ??= () => "blob:jsdom";
URL.revokeObjectURL ??= () => {};
