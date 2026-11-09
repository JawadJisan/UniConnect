import { describePassword } from '@/components/password/password-hint';

describe('describePassword', () => {
  it.each([
    ['', 'Enter a password.'],
    ['abc', 'Use at least 8 characters, and add an uppercase letter, a number and a symbol.'],
    ['Abcdef1!', 'Choose a different password.'],
    ['abcdefgh', 'Add an uppercase letter, a number and a symbol.'],
    ['Abcdefgh1', 'Add a symbol.'],
    ['Abc1!', 'Use at least 8 characters.'],
    ['A'.repeat(101), 'Use 100 characters or fewer.'],
  ])('%j -> %s', (pw, message) => {
    expect(describePassword(pw)).toBe(message);
  });
});
