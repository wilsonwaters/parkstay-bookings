import { unitCountLabel, unitNoun } from './locationFormat';

describe('locationFormat units', () => {
  it('names a location’s units by its kind, with "unit" for anything unknown', () => {
    expect(unitNoun('campground')).toEqual({ one: 'site', many: 'sites' });
    expect(unitNoun('cabin')).toEqual({ one: 'cabin', many: 'cabins' });
    expect(unitNoun('spaceport')).toEqual({ one: 'unit', many: 'units' });
    expect(unitNoun(undefined)).toEqual({ one: 'unit', many: 'units' });
    expect(unitCountLabel('campground', 1)).toBe('1 site');
  });
});
