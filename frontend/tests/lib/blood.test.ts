import {
  canRecordDonation,
  canVerify,
  donorParamsFromUrl,
  formatBloodGroup,
  myDonationsPageFromUrl,
  requestParamsFromUrl,
  spokenBloodGroup,
  tabFromUrl,
  todayInDhaka,
  unverifiedParamsFromUrl,
} from '@/lib/blood';

const q = (s: string) => new URLSearchParams(s);

describe('blood group text', () => {
  it('uses a real minus sign and reads the sign aloud', () => {
    expect(formatBloodGroup('O-')).toBe('O−');
    expect(formatBloodGroup('AB+')).toBe('AB+');
    expect(spokenBloodGroup('AB-')).toBe('AB negative');
    expect(spokenBloodGroup('B+')).toBe('B positive');
  });
});

describe('role checks', () => {
  it('everyone but a super admin records donations (FR-BLOOD-001)', () => {
    expect(canRecordDonation('student')).toBe(true);
    expect(canRecordDonation('faculty')).toBe(true);
    expect(canRecordDonation('moderator')).toBe(true);
    expect(canRecordDonation('dept_admin')).toBe(true);
    expect(canRecordDonation('super_admin')).toBe(false);
  });

  it('dept admins and super admins verify (FR-BLOOD-002)', () => {
    expect(canVerify('dept_admin')).toBe(true);
    expect(canVerify('super_admin')).toBe(true);
    expect(canVerify('moderator')).toBe(false);
    expect(canVerify('student')).toBe(false);
  });
});

describe('todayInDhaka', () => {
  it('is already tomorrow in Dhaka at 20:00 UTC', () => {
    expect(todayInDhaka(new Date('2026-11-14T20:00:00Z'))).toBe('2026-11-15');
    expect(todayInDhaka(new Date('2026-11-14T10:00:00Z'))).toBe('2026-11-14');
  });
});

describe('URL readers keep only what the API accepts', () => {
  it('tab: My donations only when allowed', () => {
    expect(tabFromUrl(q(''), true)).toBe('requests');
    expect(tabFromUrl(q('tab=donors'), false)).toBe('donors');
    expect(tabFromUrl(q('tab=donations'), true)).toBe('donations');
    expect(tabFromUrl(q('tab=donations'), false)).toBe('requests');
    expect(tabFromUrl(q('tab=admin'), true)).toBe('requests');
  });

  it('requests', () => {
    expect(
      requestParamsFromUrl(
        q('r_status=fulfilled&r_blood_group=O-&r_department_id=2&r_page=3&d_page=9&evil=1'),
      ),
    ).toEqual({ status: 'fulfilled', blood_group: 'O-', department_id: 2, page: 3 });
    expect(
      requestParamsFromUrl(q('r_status=open&r_blood_group=C%2B&r_department_id=x&r_page=1')),
    ).toEqual({});
  });

  it('donors', () => {
    expect(
      donorParamsFromUrl(q('d_blood_group=AB%2B&d_department_id=1&d_verified_only=true&d_page=2')),
    ).toEqual({ blood_group: 'AB+', department_id: 1, verified_only: 'true', page: 2 });
    expect(donorParamsFromUrl(q('d_verified_only=yes&d_department_id=-1'))).toEqual({});
  });

  it('my donations and the admin queue', () => {
    expect(myDonationsPageFromUrl(q('m_page=4'))).toBe(4);
    expect(myDonationsPageFromUrl(q('m_page=0'))).toBeUndefined();
    expect(unverifiedParamsFromUrl(q('department_id=3&page=2&x=1'))).toEqual({
      department_id: 3,
      page: 2,
    });
  });
});
