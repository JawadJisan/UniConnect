import { configure } from '@testing-library/dom';

// The full suite runs 36 files in parallel; under that load a query that settles in 300 ms
// alone can pass Testing Library's 1 s default for findBy* and waitFor. Two of three full runs
// on 2026-11-15 had one such timeout, each passing on its own. 3 s keeps a real hang failing.
configure({ asyncUtilTimeout: 3000 });
