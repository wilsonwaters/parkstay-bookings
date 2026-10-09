import { hasDates, parseStayParams, stayParamsQuery } from './stayParams';

describe('parseStayParams', () => {
  it('reads the dates and the party', () => {
    expect(
      parseStayParams('?arrival=2026-11-06&departure=2026-11-08&adults=2&children=1&infants=0')
    ).toEqual({
      arrival: '2026-11-06',
      departure: '2026-11-08',
      adults: 2,
      children: 1,
      infants: 0,
    });
    expect(parseStayParams('')).toEqual({
      arrival: null,
      departure: null,
      adults: null,
      children: null,
      infants: null,
    });
  });

  it('drops a departure on or before the arrival, and dates that are not calendar dates', () => {
    expect(parseStayParams('?arrival=2026-11-08&departure=2026-11-08')).toMatchObject({
      arrival: '2026-11-08',
      departure: null,
    });
    expect(parseStayParams('?arrival=2026-11-08&departure=2026-11-06').departure).toBeNull();
    expect(parseStayParams('?arrival=2026-02-30&departure=11/12/2026')).toMatchObject({
      arrival: null,
      departure: null,
    });
  });

  it('drops guest counts that are out of range or not whole numbers', () => {
    expect(parseStayParams('?adults=0&children=-1&infants=2.5')).toMatchObject({
      adults: null,
      children: null,
      infants: null,
    });
    expect(parseStayParams('?adults=17').adults).toBeNull();
    expect(parseStayParams('?adults=16').adults).toBe(16);
  });
});

describe('stayParamsQuery', () => {
  it('writes the stay in a fixed order, leaving out what is not set', () => {
    expect(
      Object.entries(
        stayParamsQuery({
          adults: 2,
          departure: '2026-11-08',
          arrival: '2026-11-06',
          children: null,
        })
      )
    ).toEqual([
      ['arrival', '2026-11-06'],
      ['departure', '2026-11-08'],
      ['adults', 2],
    ]);
    expect(stayParamsQuery(undefined)).toEqual({});
  });
});

describe('hasDates', () => {
  it('needs both dates', () => {
    expect(hasDates({ arrival: '2026-11-06', departure: '2026-11-08' })).toBe(true);
    expect(hasDates({ arrival: '2026-11-06', departure: null })).toBe(false);
  });
});
