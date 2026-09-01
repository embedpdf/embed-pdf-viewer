export { searchPlugin } from './search.plugin';
export * from './contract';
// THE query shape (engine → wire → state → search box) and its validator —
// call validateSearchQuery on keystroke for early feedback (regex dialect +
// flag combos, e.g. regex+matchDiacritics); engines enforce the same rules.
