import type { Db } from '../../repositories/audit.repository.js';

// Counts and aggregates for the dashboards (PRD FR-DASH-001–004; DECISIONS D42). Lists that
// have a visibility rule (events, announcements, blood requests) come from their own services,
// never from here. Every department-scoped count takes the department id (tenant isolation).

/** Users who can sign in. Suspended accounts don't count. */
const ACTIVE_USER = { isActive: true } as const;

export const dashboardRepository = {
  usersByRole(db: Db, departmentId?: number) {
    return db.user.groupBy({
      by: ['role'],
      where: { ...ACTIVE_USER, ...(departmentId !== undefined ? { departmentId } : {}) },
      _count: { _all: true },
    });
  },

  usersByDepartment(db: Db) {
    return db.user.groupBy({
      by: ['departmentId'],
      where: { ...ACTIVE_USER, departmentId: { not: null } },
      _count: { _all: true },
    });
  },

  departments(db: Db) {
    return db.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  },

  department(db: Db, id: number) {
    return db.department.findUnique({
      where: { id },
      select: { id: true, name: true, club: { select: { id: true, name: true } } },
    });
  },

  /** Events by status; optionally only one club's, starting in [from, to). */
  eventsByStatus(db: Db, filter: { clubId?: number; from?: Date; to?: Date } = {}) {
    return db.event.groupBy({
      by: ['status'],
      where: {
        ...(filter.clubId !== undefined ? { organizerClubId: filter.clubId } : {}),
        ...(filter.from || filter.to
          ? {
              startDate: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lt: filter.to } : {}),
              },
            }
          : {}),
      },
      _count: { _all: true },
    });
  },

  /** Active memberships (status active and not past their last day, Asia/Dhaka). */
  activeMemberships(db: Db, today: Date, clubId?: number) {
    return db.clubMembership.count({
      where: {
        status: 'active',
        endDate: { gte: today },
        ...(clubId !== undefined ? { clubId } : {}),
      },
    });
  },

  /** Sum of completed payments as a Prisma Decimal (never a float). */
  async revenue(db: Db) {
    const agg = await db.paymentTransaction.aggregate({
      where: { paymentStatus: 'completed' },
      _sum: { amount: true },
    });
    return agg._sum.amount;
  },

  fulfilledBloodRequests(db: Db) {
    return db.bloodRequest.count({ where: { status: 'fulfilled' } });
  },

  pendingBloodVerifications(db: Db, departmentId: number) {
    return db.bloodDonation.count({ where: { verified: false, donor: { departmentId } } });
  },

  /** Department posts plus posts of the department's club, created in [from, to). */
  announcementsIn(db: Db, departmentId: number, from: Date, to: Date) {
    return db.announcement.count({
      where: {
        createdAt: { gte: from, lt: to },
        OR: [{ departmentId }, { club: { departmentId } }],
      },
    });
  },

  currentAdminTerm(db: Db, userId: string, departmentId: number) {
    return db.departmentAdminTerm.findFirst({
      where: { userId, departmentId, isCurrent: true },
      select: { id: true, startDate: true, endDate: true },
    });
  },

  /** Current dept admin terms, names only (the term list API carries email; this doesn't). */
  currentAdminTerms(db: Db) {
    return db.departmentAdminTerm.findMany({
      where: { isCurrent: true },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        user: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { department: { name: 'asc' } },
    });
  },

  /** The club where the user holds a current committee seat (one club per department). */
  seatClub(db: Db, userId: string) {
    return db.clubCommitteeMember.findFirst({
      where: { userId, isCurrent: true },
      select: { club: { select: { id: true, name: true } } },
      orderBy: { id: 'asc' },
    });
  },

  upcomingPublishedCount(db: Db, clubId: number, now: Date) {
    return db.event.count({
      where: { organizerClubId: clubId, status: 'published', startDate: { gt: now } },
    });
  },

  upcomingRegistrationsCount(db: Db, clubId: number, now: Date) {
    return db.eventRegistration.count({
      where: {
        status: { in: ['registered', 'attended'] },
        event: { organizerClubId: clubId, status: 'published', startDate: { gt: now } },
      },
    });
  },

  /** Newest registrations for the club's upcoming events: name and student ID only (D36). */
  recentRegistrations(db: Db, clubId: number, now: Date, take: number) {
    return db.eventRegistration.findMany({
      where: {
        status: { in: ['registered', 'attended'] },
        event: { organizerClubId: clubId, status: 'published', startDate: { gt: now } },
      },
      select: {
        id: true,
        status: true,
        registeredAt: true,
        user: { select: { id: true, name: true, studentId: true } },
        event: { select: { id: true, title: true, startDate: true } },
      },
      orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
      take,
    });
  },
};
