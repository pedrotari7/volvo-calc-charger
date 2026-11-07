import { describe, expect, it } from 'vitest';
import type { IsoUtc } from './types';
import {
  addHours,
  eveningDateOf,
  floorHourUtc,
  localDateOf,
  localParts,
  monthKey,
  nextLocalTime,
  utcHoursBetween,
} from './time';

const iso = (s: string) => s as IsoUtc;

describe('floorHourUtc / addHours', () => {
  it('floors to the UTC hour with milliseconds format', () => {
    expect(floorHourUtc('2026-11-02T23:02:05Z')).toBe('2026-11-02T23:00:00.000Z');
  });
  it('adds and subtracts hours', () => {
    expect(addHours(iso('2026-11-02T23:00:00.000Z'), 2)).toBe('2026-11-03T01:00:00.000Z');
    expect(addHours(iso('2026-11-03T00:00:00.000Z'), -1)).toBe('2026-11-02T23:00:00.000Z');
  });
});

describe('localParts', () => {
  it('converts winter time (CET) across midnight', () => {
    expect(localParts('2026-11-02T23:00:00Z')).toEqual({ date: '2026-11-03', hour: 0, weekday: 2, month: 11 });
  });
  it('converts summer time (CEST)', () => {
    expect(localParts('2026-07-01T10:00:00Z').hour).toBe(12);
  });
  it('reports Sunday as 7', () => {
    expect(localParts('2026-11-01T12:00:00Z').weekday).toBe(7);
  });
  it('localDateOf and monthKey use local time', () => {
    expect(localDateOf('2026-11-02T23:00:00Z')).toBe('2026-11-03');
    expect(monthKey('2026-10-31T23:30:00Z')).toBe('2026-11');
  });
});

describe('utcHoursBetween', () => {
  it('lists every overlapped UTC hour', () => {
    expect(utcHoursBetween('2026-11-02T23:02:05Z', '2026-11-03T01:30:00Z')).toEqual([
      '2026-11-02T23:00:00.000Z',
      '2026-11-03T00:00:00.000Z',
      '2026-11-03T01:00:00.000Z',
    ]);
  });
  it('excludes the hour starting exactly at end', () => {
    expect(utcHoursBetween('2026-11-02T23:00:00Z', '2026-11-03T00:00:00Z')).toEqual(['2026-11-02T23:00:00.000Z']);
  });
  it('is empty when end is not after start', () => {
    expect(utcHoursBetween('2026-11-02T23:00:00Z', '2026-11-02T23:00:00Z')).toEqual([]);
    expect(utcHoursBetween('2026-11-02T23:00:00Z', '2026-11-02T22:00:00Z')).toEqual([]);
  });
  it('has 25 hours on the autumn fall-back day', () => {
    expect(utcHoursBetween('2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z')).toHaveLength(25);
  });
  it('has 23 hours on the spring forward day', () => {
    expect(utcHoursBetween('2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z')).toHaveLength(23);
  });
});

describe('nextLocalTime', () => {
  it('picks the next day when today has passed', () => {
    expect(nextLocalTime(iso('2026-11-03T08:00:00Z'), '07:00')).toBe('2026-11-04T06:00:00.000Z');
  });
  it('picks later today when still ahead', () => {
    expect(nextLocalTime(iso('2026-11-03T04:00:00Z'), '07:00')).toBe('2026-11-03T06:00:00.000Z');
  });
  it('is strictly after now', () => {
    expect(nextLocalTime(iso('2026-11-03T06:00:00.000Z'), '07:00')).toBe('2026-11-04T06:00:00.000Z');
  });
  it('crosses spring DST start', () => {
    expect(nextLocalTime(iso('2026-03-28T20:00:00Z'), '07:00')).toBe('2026-03-29T05:00:00.000Z');
  });
  it('crosses autumn fall-back', () => {
    expect(nextLocalTime(iso('2026-10-24T20:00:00Z'), '07:00')).toBe('2026-10-25T06:00:00.000Z');
    expect(nextLocalTime(iso('2026-10-25T06:00:00Z'), '07:00')).toBe('2026-10-26T06:00:00.000Z');
  });
  it('uses the first occurrence of a repeated local time after now', () => {
    expect(nextLocalTime(iso('2026-10-24T22:00:00Z'), '02:30')).toBe('2026-10-25T00:30:00.000Z');
    expect(nextLocalTime(iso('2026-10-25T00:30:00Z'), '02:30')).toBe('2026-10-25T01:30:00.000Z');
  });
  it('skips a local time that does not exist', () => {
    expect(nextLocalTime(iso('2026-03-28T22:00:00Z'), '02:30')).toBe('2026-03-30T00:30:00.000Z');
  });
});

describe('eveningDateOf', () => {
  it('is the local date from noon on', () => {
    expect(eveningDateOf('2026-11-03T11:00:00.000Z')).toBe('2026-11-03'); // 12:00 local
    expect(eveningDateOf('2026-11-03T22:59:00.000Z')).toBe('2026-11-03'); // 23:59 local
  });
  it('is the previous local date before noon', () => {
    expect(eveningDateOf('2026-11-02T23:02:05.187Z')).toBe('2026-11-02'); // 00:02 local on 3 Nov
    expect(eveningDateOf('2026-11-03T10:59:00.000Z')).toBe('2026-11-02'); // 11:59 local
  });
  it('crosses a month and year boundary', () => {
    expect(eveningDateOf('2026-11-30T23:30:00.000Z')).toBe('2026-11-30'); // 00:30 local on 1 Dec
    expect(eveningDateOf('2026-12-31T23:30:00.000Z')).toBe('2026-12-31'); // 00:30 local on 1 Jan
  });
  it('is DST safe on the autumn fall-back morning (25-hour day)', () => {
    // 11:30 local on 25 Oct (CET); 12 hours earlier is 00:30 local on the same date.
    expect(eveningDateOf('2026-10-25T10:30:00.000Z')).toBe('2026-10-24');
    expect(eveningDateOf('2026-10-25T00:30:00.000Z')).toBe('2026-10-24'); // repeated 02:30
  });
  it('is DST safe on the spring-forward morning (23-hour day)', () => {
    expect(eveningDateOf('2027-03-28T09:30:00.000Z')).toBe('2027-03-27'); // 11:30 CEST
    expect(eveningDateOf('2027-03-28T10:00:00.000Z')).toBe('2027-03-28'); // 12:00 CEST
  });
});
