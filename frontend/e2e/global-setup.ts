import { e2eDb } from './db';

/** A fresh set of accounts before every run. */
export default function globalSetup() {
  e2eDb('seed');
}
