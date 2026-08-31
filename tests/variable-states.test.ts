import { describe, it, expect } from 'vitest';
import { splitVariables } from '../src/modules/services/variableTypes';

/**
 * The three states a package's variables are in.
 *
 * Written because every surface derived these itself and got the same thing
 * wrong: a row in package_variable_values was read as a fixed value whatever it
 * held, so a variable the package had deliberately left to the client printed
 * its label on the card with nothing beside it.
 *
 * No database here on purpose — this is the pure split, and it is the part that
 * was wrong.
 */
const answer = (over: Partial<Parameters<typeof splitVariables>[0][number]> = {}) => ({
  serviceVariableId: 'sv-1', label: 'Outfits', unit: null, kind: 'number',
  value: 2, answeredBy: 'studio' as const, ...over,
});

describe('splitVariables', () => {
  it('a studio-given value is a fact about the package', () => {
    const { fixed, asked, undecided } = splitVariables([answer()], []);
    expect(fixed).toHaveLength(1);
    expect(asked).toHaveLength(0);
    expect(undecided).toHaveLength(0);
  });

  it('a variable left to the client is a question, never a blank fact', () => {
    const { fixed, asked } = splitVariables(
      [answer({ serviceVariableId: 'sv-2', label: 'Session length', value: null, answeredBy: 'client' })], []);
    expect(fixed).toHaveLength(0);
    expect(asked).toEqual([{ id: 'sv-2', label: 'Session length' }]);
  });

  it('a dimension-owned variable is found even though it is in no service list', () => {
    // The reported bug. "Location address" belongs to Context, so it never
    // appears in service_variables — which is why filtering the declared list
    // could not rescue it and it showed as a fact with an empty value.
    const { fixed, asked } = splitVariables(
      [answer({ serviceVariableId: 'dv-address', label: 'Location address', kind: 'text', value: null, answeredBy: 'client' })],
      [], // declared list deliberately empty
    );
    expect(fixed).toHaveLength(0);
    expect(asked).toEqual([{ id: 'dv-address', label: 'Location address' }]);
  });

  it('a row claiming the studio fixed it, holding no value, is not a fact', () => {
    const { fixed, asked } = splitVariables([answer({ value: '', answeredBy: 'studio' })], []);
    expect(fixed).toHaveLength(0);
    expect(asked).toHaveLength(1);
  });

  it('nothing recorded at all is undecided, and is not a question', () => {
    const { asked, undecided } = splitVariables([], [{ id: 'sv-9', label: 'Backdrop' }]);
    expect(asked).toHaveLength(0);
    expect(undecided).toEqual([{ id: 'sv-9', label: 'Backdrop' }]);
  });

  it('never counts one variable twice', () => {
    const declared = [{ id: 'sv-1', label: 'Outfits' }, { id: 'sv-2', label: 'Session length' }];
    const { fixed, asked, undecided } = splitVariables(
      [answer(), answer({ serviceVariableId: 'sv-2', label: 'Session length', value: null, answeredBy: 'client' })],
      declared,
    );
    const ids = [...fixed.map((f) => f.serviceVariableId), ...asked.map((a) => a.id), ...undecided.map((u) => u.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['sv-1', 'sv-2']);
  });

  it('zero is a value, not an absence', () => {
    const { fixed } = splitVariables([answer({ value: 0 })], []);
    expect(fixed).toHaveLength(1);
  });

  it('false is a value, not an absence', () => {
    const { fixed } = splitVariables([answer({ kind: 'boolean', value: false })], []);
    expect(fixed).toHaveLength(1);
  });
});
