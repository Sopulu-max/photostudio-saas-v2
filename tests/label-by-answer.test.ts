import { describe, it, expect } from 'vitest';
import { labelledByAnswer as L } from '@/kernel/classification';

describe('a question named by its answer', () => {
  it('puts the answer where the question was', () => {
    expect(L('Occasion Date', 'Occasion', 'Birthday')).toBe('Birthday Date');
    expect(L('Date of occasion', 'Occasion', 'Convocation')).toBe('Date of Convocation');
  });
  it('leaves a label that does not name its dimension alone', () => {
    expect(L('Location Address', 'Context', 'Studio')).toBe('Location Address');
  });
  it('does not match inside a longer word', () => {
    expect(L('Occasional Extras', 'Occasion', 'Birthday')).toBe('Occasional Extras');
  });
  it('leaves it alone when there is no answer yet', () => {
    expect(L('Occasion Date', 'Occasion', null)).toBe('Occasion Date');
    expect(L('Occasion Date', null, 'Birthday')).toBe('Occasion Date');
    expect(L('Occasion Date', 'Occasion', 'Occasion')).toBe('Occasion Date');
  });
});
