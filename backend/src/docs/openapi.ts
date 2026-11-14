import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import {
  AVATAR_FIELD,
  LOGO_FIELD,
  POSTER_FIELD,
  adminMembershipListQuerySchema,
  adminUpdateUserSchema,
  adminUserListQuerySchema,
  announcementIdParamSchema,
  announcementListQuerySchema,
  assignCommitteeSchema,
  assignDeptAdminSchema,
  auditLogQuerySchema,
  bloodIdParamSchema,
  bloodRequestListQuerySchema,
  chatLogQuerySchema,
  chatbotAskSchema,
  clubIdParamSchema,
  clubListQuerySchema,
  committeeCandidateQuerySchema,
  committeeListQuerySchema,
  committeeMemberParamsSchema,
  createAnnouncementSchema,
  createBloodRequestSchema,
  createDonationSchema,
  createEventSchema,
  createMembershipSchema,
  deptAdminTermIdParamSchema,
  deptAdminTermListQuerySchema,
  donorListQuerySchema,
  eventIdParamSchema,
  eventListQuerySchema,
  eventRegistrationsQuerySchema,
  generateEventDescriptionSchema,
  membershipIdParamSchema,
  myDonationsQuerySchema,
  myMembershipsQuerySchema,
  myRegistrationsQuerySchema,
  paymentIpnSchema,
  registerFacultySchema,
  registerStudentSchema,
  registrationParamsSchema,
  renewDeptAdminSchema,
  renewMembershipSchema,
  unverifiedDonationsQuerySchema,
  updateAnnouncementSchema,
  updateClubSchema,
  updateCommitteeSchema,
  updateEventSchema,
  updateStaffProfileSchema,
  updateStudentProfileSchema,
  updateUserStatusSchema,
  userIdParamSchema,
  type Role,
  type UserType,
} from '@uniconnect/shared';
import { z, type ZodType } from 'zod';

// OpenAPI 3.0 for every route (PRD §3, §21; DECISIONS D46). Request bodies, queries and path
// parameters come from the same @uniconnect/shared schemas the routes validate with, so the
// docs can't drift from validation. tests/openapi.test.ts fails if a route is missing here.

extendZodWithOpenApi(z);

type Method = 'get' | 'post' | 'patch' | 'delete';

/** Who may call a route: anyone, any session, some roles, or some account types. */
type Access = 'public' | 'session' | readonly Role[] | { userTypes: readonly UserType[] };

export interface Operation {
  method: Method;
  /** Express-style full path, e.g. /api/v1/events/:id. */
  path: string;
  tag: string;
  summary: string;
  access: Access;
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
  /** multipart/form-data with one image in this field. */
  upload?: string;
  /** Success status; 200 by default. */
  status?: 200 | 201 | 302;
  /** A D9 list: `{ success, data: [], meta }`. */
  list?: boolean;
  /** Also answers text/csv (with `format=csv`). */
  csv?: boolean;
  /** The per-user AI limit (429 with Retry-After). */
  limited?: boolean;
  description?: string;
}

const ORGANIZERS: Role[] = ['moderator', 'dept_admin', 'super_admin'];
const ATTENDEES: Role[] = ['student', 'faculty', 'moderator', 'dept_admin'];
const ADMINS: Role[] = ['dept_admin', 'super_admin'];
const SUPER: Role[] = ['super_admin'];

const V1 = '/api/v1';

/** Every /api/v1 route, in the order app.ts mounts them. */
export const OPERATIONS: Operation[] = [
  // Health
  { method: 'get', path: `${V1}/health`, tag: 'Health', summary: 'Liveness', access: 'public' },
  {
    method: 'get',
    path: `${V1}/health/ready`,
    tag: 'Health',
    summary: 'Readiness: Postgres and Redis answer (503 otherwise)',
    access: 'public',
  },

  // Registration (FR-AUTH-001, -002)
  {
    method: 'post',
    path: `${V1}/auth/register/student`,
    tag: 'Auth',
    summary: 'Register a student account (sends a verification email)',
    access: 'public',
    body: registerStudentSchema,
    status: 201,
    limited: true,
  },
  {
    method: 'post',
    path: `${V1}/auth/register/faculty`,
    tag: 'Auth',
    summary: 'Register a faculty account (sends a verification email)',
    access: 'public',
    body: registerFacultySchema,
    status: 201,
    limited: true,
  },
  {
    method: 'get',
    path: `${V1}/departments`,
    tag: 'Departments',
    summary: 'List departments',
    access: 'public',
  },

  // Users (FR-USER)
  { method: 'get', path: `${V1}/users/me`, tag: 'Users', summary: 'My profile', access: 'session' },
  {
    method: 'patch',
    path: `${V1}/users/me`,
    tag: 'Users',
    summary: 'Update my profile (fields depend on the account type)',
    access: 'session',
    body: z.union([updateStudentProfileSchema, updateStaffProfileSchema]),
  },
  {
    method: 'get',
    path: `${V1}/users/me/sessions`,
    tag: 'Users',
    summary: 'How many other devices are signed in',
    access: 'session',
  },
  {
    method: 'patch',
    path: `${V1}/users/me/avatar`,
    tag: 'Users',
    summary: 'Upload my avatar (JPEG, PNG or WebP, up to 5 MB)',
    access: 'session',
    upload: AVATAR_FIELD,
  },
  {
    method: 'get',
    path: `${V1}/admin/users`,
    tag: 'Admin: users',
    summary: 'List users',
    access: SUPER,
    query: adminUserListQuerySchema,
    list: true,
  },
  {
    method: 'get',
    path: `${V1}/admin/users/:id`,
    tag: 'Admin: users',
    summary: 'User detail',
    access: SUPER,
    params: userIdParamSchema,
  },
  {
    method: 'patch',
    path: `${V1}/admin/users/:id`,
    tag: 'Admin: users',
    summary: 'Edit a user',
    access: SUPER,
    params: userIdParamSchema,
    body: adminUpdateUserSchema,
  },
  {
    method: 'patch',
    path: `${V1}/admin/users/:id/status`,
    tag: 'Admin: users',
    summary: 'Suspend (ends every session) or reactivate a user',
    access: SUPER,
    params: userIdParamSchema,
    body: updateUserStatusSchema,
  },
  {
    method: 'post',
    path: `${V1}/admin/users/:id/recompute-role`,
    tag: 'Admin: users',
    summary: "Recompute a user's role from their terms",
    access: SUPER,
    params: userIdParamSchema,
  },

  // Clubs (FR-CLUB)
  {
    method: 'get',
    path: `${V1}/clubs`,
    tag: 'Clubs',
    summary: 'List clubs',
    access: 'session',
    query: clubListQuerySchema,
    list: true,
  },
  {
    method: 'get',
    path: `${V1}/clubs/my-club`,
    tag: 'Clubs',
    summary: "My department's club",
    access: 'session',
  },
  {
    method: 'get',
    path: `${V1}/clubs/:id`,
    tag: 'Clubs',
    summary: 'Club detail with its current committee',
    access: 'session',
    params: clubIdParamSchema,
  },
  {
    method: 'patch',
    path: `${V1}/clubs/:id`,
    tag: 'Clubs',
    summary: "Edit a club (its department's admin or a super admin)",
    access: ADMINS,
    params: clubIdParamSchema,
    body: updateClubSchema,
  },
  {
    method: 'patch',
    path: `${V1}/clubs/:id/logo`,
    tag: 'Clubs',
    summary: 'Upload a club logo',
    access: ADMINS,
    params: clubIdParamSchema,
    upload: LOGO_FIELD,
  },

  // Committee (FR-COMM)
  {
    method: 'get',
    path: `${V1}/clubs/:id/committee`,
    tag: 'Committee',
    summary: "A club's committee",
    access: 'session',
    params: clubIdParamSchema,
    query: committeeListQuerySchema,
  },
  {
    method: 'get',
    path: `${V1}/clubs/:id/committee/candidates`,
    tag: 'Committee',
    summary: 'Search people who can be given a seat',
    access: ADMINS,
    params: clubIdParamSchema,
    query: committeeCandidateQuerySchema,
  },
  {
    method: 'post',
    path: `${V1}/clubs/:id/committee`,
    tag: 'Committee',
    summary: 'Assign a committee seat',
    access: ADMINS,
    params: clubIdParamSchema,
    body: assignCommitteeSchema,
    status: 201,
  },
  {
    method: 'patch',
    path: `${V1}/clubs/:id/committee/:memberId`,
    tag: 'Committee',
    summary: 'Edit a committee seat',
    access: ADMINS,
    params: committeeMemberParamsSchema,
    body: updateCommitteeSchema,
  },
  {
    method: 'patch',
    path: `${V1}/clubs/:id/committee/:memberId/end-term`,
    tag: 'Committee',
    summary: 'End a committee term',
    access: ADMINS,
    params: committeeMemberParamsSchema,
  },

  // Memberships (FR-MEM; ADR 0001)
  {
    method: 'post',
    path: `${V1}/memberships/payment/ipn`,
    tag: 'Memberships',
    summary: "The payment gateway's IPN (trusted only after the gateway's validation call)",
    access: 'public',
    body: paymentIpnSchema,
  },
  {
    method: 'get',
    path: `${V1}/memberships/my`,
    tag: 'Memberships',
    summary: 'My memberships',
    access: { userTypes: ['student'] },
    query: myMembershipsQuerySchema,
    list: true,
  },
  {
    method: 'post',
    path: `${V1}/memberships`,
    tag: 'Memberships',
    summary: 'Start a membership checkout',
    access: { userTypes: ['student'] },
    body: createMembershipSchema,
    status: 201,
  },
  {
    method: 'post',
    path: `${V1}/memberships/:id/renew`,
    tag: 'Memberships',
    summary: 'Start a renewal checkout',
    access: { userTypes: ['student'] },
    params: membershipIdParamSchema,
    body: renewMembershipSchema,
    status: 201,
  },
  {
    method: 'patch',
    path: `${V1}/memberships/:id/cancel`,
    tag: 'Memberships',
    summary: 'Cancel my membership (no refund)',
    access: { userTypes: ['student'] },
    params: membershipIdParamSchema,
  },
  {
    method: 'get',
    path: `${V1}/admin/memberships`,
    tag: 'Memberships',
    summary: 'Memberships of the department (all departments for a super admin)',
    access: ADMINS,
    query: adminMembershipListQuerySchema,
    list: true,
  },

  // Department admin terms (FR-ADMIN)
  {
    method: 'get',
    path: `${V1}/admin/dept-admin-terms`,
    tag: 'Admin: dept admin terms',
    summary: 'List terms',
    access: SUPER,
    query: deptAdminTermListQuerySchema,
    list: true,
  },
  {
    method: 'post',
    path: `${V1}/admin/dept-admin-terms`,
    tag: 'Admin: dept admin terms',
    summary: 'Assign a department admin',
    access: SUPER,
    body: assignDeptAdminSchema,
    status: 201,
  },
  {
    method: 'patch',
    path: `${V1}/admin/dept-admin-terms/:id/end`,
    tag: 'Admin: dept admin terms',
    summary: 'End a term',
    access: SUPER,
    params: deptAdminTermIdParamSchema,
  },
  {
    method: 'post',
    path: `${V1}/admin/dept-admin-terms/:id/renew`,
    tag: 'Admin: dept admin terms',
    summary: 'Renew a term',
    access: SUPER,
    params: deptAdminTermIdParamSchema,
    body: renewDeptAdminSchema,
    status: 201,
  },

  // Events (FR-EVENT)
  {
    method: 'post',
    path: `${V1}/events`,
    tag: 'Events',
    summary: 'Create a draft event',
    access: ORGANIZERS,
    body: createEventSchema,
    status: 201,
  },
  {
    method: 'get',
    path: `${V1}/events`,
    tag: 'Events',
    summary: 'Browse events the caller may see',
    access: 'session',
    query: eventListQuerySchema,
    list: true,
  },
  {
    method: 'get',
    path: `${V1}/events/my-registrations`,
    tag: 'Events',
    summary: 'My registrations',
    access: 'session',
    query: myRegistrationsQuerySchema,
    list: true,
  },
  {
    method: 'get',
    path: `${V1}/events/:id`,
    tag: 'Events',
    summary: 'Event detail (404 when the caller may not see it)',
    access: 'session',
    params: eventIdParamSchema,
  },
  {
    method: 'patch',
    path: `${V1}/events/:id`,
    tag: 'Events',
    summary: 'Edit an event (dates, visibility and departments lock once published)',
    access: ORGANIZERS,
    params: eventIdParamSchema,
    body: updateEventSchema,
  },
  {
    method: 'patch',
    path: `${V1}/events/:id/poster`,
    tag: 'Events',
    summary: 'Upload an event poster',
    access: ORGANIZERS,
    params: eventIdParamSchema,
    upload: POSTER_FIELD,
  },
  {
    method: 'patch',
    path: `${V1}/events/:id/publish`,
    tag: 'Events',
    summary: 'Publish a draft (emails the listed departments)',
    access: ORGANIZERS,
    params: eventIdParamSchema,
  },
  {
    method: 'patch',
    path: `${V1}/events/:id/cancel`,
    tag: 'Events',
    summary: 'Cancel an event (emails registrants)',
    access: ORGANIZERS,
    params: eventIdParamSchema,
  },
  {
    method: 'patch',
    path: `${V1}/events/:id/complete`,
    tag: 'Events',
    summary: 'Mark an ended event completed',
    access: ORGANIZERS,
    params: eventIdParamSchema,
  },
  {
    method: 'post',
    path: `${V1}/events/:id/register`,
    tag: 'Events',
    summary: 'Register for an event',
    access: ATTENDEES,
    params: eventIdParamSchema,
    status: 201,
  },
  {
    method: 'delete',
    path: `${V1}/events/:id/register`,
    tag: 'Events',
    summary: 'Cancel my registration',
    access: ATTENDEES,
    params: eventIdParamSchema,
  },
  {
    method: 'get',
    path: `${V1}/events/:id/registrations`,
    tag: 'Events',
    summary: 'Registrants for organizers (no email), as JSON or CSV',
    access: ORGANIZERS,
    params: eventIdParamSchema,
    query: eventRegistrationsQuerySchema,
    list: true,
    csv: true,
  },
  {
    method: 'patch',
    path: `${V1}/events/:id/registrations/:regId/check-in`,
    tag: 'Events',
    summary: 'Check a registrant in',
    access: ORGANIZERS,
    params: registrationParamsSchema,
  },

  // Announcements (FR-ANNOUNCE; D15, D38)
  {
    method: 'post',
    path: `${V1}/announcements`,
    tag: 'Announcements',
    summary: 'Post to a club or a department',
    access: ORGANIZERS,
    body: createAnnouncementSchema,
    status: 201,
  },
  {
    method: 'get',
    path: `${V1}/announcements`,
    tag: 'Announcements',
    summary: 'The announcements the caller may see, pinned first',
    access: 'session',
    query: announcementListQuerySchema,
    list: true,
  },
  {
    method: 'patch',
    path: `${V1}/announcements/:id`,
    tag: 'Announcements',
    summary: 'Edit an announcement',
    access: ORGANIZERS,
    params: announcementIdParamSchema,
    body: updateAnnouncementSchema,
  },
  {
    method: 'delete',
    path: `${V1}/announcements/:id`,
    tag: 'Announcements',
    summary: 'Delete an announcement',
    access: ORGANIZERS,
    params: announcementIdParamSchema,
  },
  {
    method: 'patch',
    path: `${V1}/announcements/:id/pin`,
    tag: 'Announcements',
    summary: 'Pin or unpin',
    access: ADMINS,
    params: announcementIdParamSchema,
  },

  // Blood (FR-BLOOD; D40)
  {
    method: 'post',
    path: `${V1}/blood/donations`,
    tag: 'Blood',
    summary: 'Record a donation (unverified until an admin checks it)',
    access: ATTENDEES,
    body: createDonationSchema,
    status: 201,
  },
  {
    method: 'get',
    path: `${V1}/blood/donations/my`,
    tag: 'Blood',
    summary: 'My donations',
    access: ATTENDEES,
    query: myDonationsQuerySchema,
    list: true,
  },
  {
    method: 'patch',
    path: `${V1}/blood/donations/:id/verify`,
    tag: 'Blood',
    summary: 'Verify a donation',
    access: ADMINS,
    params: bloodIdParamSchema,
  },
  {
    method: 'get',
    path: `${V1}/blood/donors`,
    tag: 'Blood',
    summary: 'Donor list (never an email)',
    access: 'session',
    query: donorListQuerySchema,
    list: true,
  },
  {
    method: 'post',
    path: `${V1}/blood/requests`,
    tag: 'Blood',
    summary: 'Create a blood request',
    access: 'session',
    body: createBloodRequestSchema,
    status: 201,
  },
  {
    method: 'get',
    path: `${V1}/blood/requests`,
    tag: 'Blood',
    summary: 'Blood requests',
    access: 'session',
    query: bloodRequestListQuerySchema,
    list: true,
  },
  {
    method: 'patch',
    path: `${V1}/blood/requests/:id/fulfill`,
    tag: 'Blood',
    summary: 'Mark a request fulfilled',
    access: 'session',
    params: bloodIdParamSchema,
  },
  {
    method: 'patch',
    path: `${V1}/blood/requests/:id/cancel`,
    tag: 'Blood',
    summary: 'Cancel a request (the requester or an admin)',
    access: 'session',
    params: bloodIdParamSchema,
  },
  {
    method: 'get',
    path: `${V1}/admin/blood/donations/unverified`,
    tag: 'Blood',
    summary: 'Donations waiting for verification',
    access: ADMINS,
    query: unverifiedDonationsQuerySchema,
    list: true,
  },

  // Audit, dashboards, AI
  {
    method: 'get',
    path: `${V1}/admin/audit-logs`,
    tag: 'Admin: audit log',
    summary: 'Audit log',
    access: SUPER,
    query: auditLogQuerySchema,
    list: true,
  },
  {
    method: 'get',
    path: `${V1}/dashboard/student`,
    tag: 'Dashboards',
    summary: 'The personal view (every student and faculty account)',
    access: { userTypes: ['student', 'faculty'] },
  },
  {
    method: 'get',
    path: `${V1}/dashboard/moderator`,
    tag: 'Dashboards',
    summary: "The moderator's club view (404 NO_COMMITTEE_SEAT without a seat)",
    access: ['moderator'],
  },
  {
    method: 'get',
    path: `${V1}/dashboard/dept-admin`,
    tag: 'Dashboards',
    summary: "The department admin's view",
    access: ['dept_admin'],
  },
  {
    method: 'get',
    path: `${V1}/dashboard/super-admin`,
    tag: 'Dashboards',
    summary: 'The system view with health',
    access: SUPER,
  },
  {
    method: 'post',
    path: `${V1}/chatbot/ask`,
    tag: 'AI',
    summary: 'Ask the assistant about content the caller may see',
    access: 'session',
    body: chatbotAskSchema,
    limited: true,
    description:
      '10 AI requests a minute per user, shared with the event description generator. 503 AI_NOT_CONFIGURED without Gemini, AI_UNAVAILABLE when it fails.',
  },
  {
    method: 'get',
    path: `${V1}/admin/chatbot/logs`,
    tag: 'AI',
    summary: 'Chat logs (questions stored PII-stripped, 90 days)',
    access: SUPER,
    query: chatLogQuerySchema,
    list: true,
  },
  {
    method: 'post',
    path: `${V1}/ai/generate-event-description`,
    tag: 'AI',
    summary: 'Draft an event description',
    access: ORGANIZERS,
    body: generateEventDescriptionSchema,
    limited: true,
  },
];

/** Better Auth's own routes the app uses, documented by hand (they aren't Express routes). */
const BETTER_AUTH: {
  method: Method;
  path: string;
  summary: string;
  body?: ZodType;
  query?: ZodType;
  session?: boolean;
}[] = [
  {
    method: 'post',
    path: '/api/auth/sign-in/email',
    summary: 'Sign in; sets the session cookie',
    body: z.object({ email: z.email(), password: z.string() }),
  },
  { method: 'post', path: '/api/auth/sign-out', summary: 'Sign out', session: true },
  {
    method: 'get',
    path: '/api/auth/get-session',
    summary: 'The current session and user, or null',
    session: true,
  },
  {
    method: 'get',
    path: '/api/auth/verify-email',
    summary: 'Verify an email from the emailed link',
    query: z.object({ token: z.string(), callbackURL: z.string().optional() }),
  },
  {
    method: 'post',
    path: '/api/auth/send-verification-email',
    summary: 'Resend the verification email (1 per 5 minutes per email)',
    body: z.object({ email: z.email() }),
  },
  {
    method: 'post',
    path: '/api/auth/request-password-reset',
    summary: 'Email a reset link (always 200, padded to a fixed time)',
    body: z.object({ email: z.email(), redirectTo: z.string() }),
  },
  {
    method: 'post',
    path: '/api/auth/reset-password',
    summary: 'Set a new password from a reset link (signs out every session)',
    body: z.object({ newPassword: z.string(), token: z.string() }),
  },
  {
    method: 'post',
    path: '/api/auth/change-password',
    summary: 'Change my password (signs out my other sessions)',
    body: z.object({ currentPassword: z.string(), newPassword: z.string() }),
    session: true,
  },
  {
    method: 'post',
    path: '/api/auth/revoke-other-sessions',
    summary: 'Sign out my other devices',
    session: true,
  },
];

/** `/api/v1/events/:id` → `/api/v1/events/{id}`. */
export const toOpenApiPath = (path: string) => path.replace(/:(\w+)/g, '{$1}');

function accessText(access: Access): string {
  if (access === 'public') return 'Public.';
  if (access === 'session') return 'Any signed-in user.';
  if ('userTypes' in access) return `Account types: ${access.userTypes.join(', ')}.`;
  return `Roles: ${access.join(', ')}.`;
}

const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
      message: z.string(),
      details: z.unknown().optional(),
      request_id: z.string().optional().openapi({ description: 'On 500s; matches the log line.' }),
    }),
  })
  .openapi('ErrorEnvelope');

const Meta = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    total_pages: z.number().int(),
  })
  .openapi('PageMeta');

const ok = z.object({ success: z.literal(true), data: z.unknown() }).openapi('Ok');
const okList = z
  .object({ success: z.literal(true), data: z.array(z.unknown()), meta: Meta })
  .openapi('OkList');

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorEnvelope } },
});

/** Path parameters: the route's own schema, plus a string for any it doesn't name. */
function paramsFor(op: Operation): ZodType | undefined {
  const names = [...op.path.matchAll(/:(\w+)/g)].map((m) => m[1]!);
  if (names.length === 0) return undefined;
  const shape = (op.params as z.ZodObject | undefined)?.shape ?? {};
  return z.object(Object.fromEntries(names.map((n) => [n, shape[n] ?? z.string()])));
}

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'better-auth.session_token',
    description:
      'The Better Auth session cookie, set by POST /api/auth/sign-in/email. Over https its name has the __Secure- prefix.',
  });

  for (const op of OPERATIONS) {
    const success = op.status ?? 200;
    const content: Record<string, { schema: ZodType }> = {
      'application/json': { schema: op.list ? okList : ok },
    };
    if (op.csv) content['text/csv'] = { schema: z.string() };

    const responses: Record<number, unknown> = {
      [success]: { description: success === 201 ? 'Created' : 'OK', content },
    };
    if (op.body || op.query || op.params || op.upload) {
      responses[400] = error('Invalid body, query or path parameter');
    }
    if (op.access !== 'public') responses[401] = error('No session');
    if (op.access !== 'public' && op.access !== 'session') {
      responses[403] = error(
        'Role or account type not allowed, or a resource outside the caller’s reach',
      );
    }
    if (op.params) responses[404] = error('Not found (or not visible to the caller)');
    if (op.limited) responses[429] = error('Rate limited; see Retry-After');

    const params = paramsFor(op);
    registry.registerPath({
      method: op.method,
      path: toOpenApiPath(op.path),
      tags: [op.tag],
      summary: op.summary,
      description: [accessText(op.access), op.description].filter(Boolean).join(' '),
      security: op.access === 'public' ? [] : [{ cookieAuth: [] }],
      request: {
        ...(params ? { params: params as z.ZodObject } : {}),
        ...(op.query ? { query: op.query as z.ZodObject } : {}),
        ...(op.body
          ? { body: { required: true, content: { 'application/json': { schema: op.body } } } }
          : {}),
        ...(op.upload
          ? {
              body: {
                required: true,
                content: {
                  'multipart/form-data': {
                    schema: z.object({
                      [op.upload]: z.string().openapi({ type: 'string', format: 'binary' }),
                    }),
                  },
                },
              },
            }
          : {}),
      },
      responses: responses as never,
    });
  }

  for (const op of BETTER_AUTH) {
    registry.registerPath({
      method: op.method,
      path: op.path,
      tags: ['Auth'],
      summary: op.summary,
      security: op.session ? [{ cookieAuth: [] }] : [],
      request: {
        ...(op.query ? { query: op.query as z.ZodObject } : {}),
        ...(op.body
          ? { body: { required: true, content: { 'application/json': { schema: op.body } } } }
          : {}),
      },
      responses: {
        200: { description: 'OK (Better Auth body)' },
        400: { description: 'Invalid input' },
        ...(op.session ? { 401: { description: 'No session' } } : {}),
        429: { description: 'Rate limited' },
      },
    });
  }

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'UniConnect API',
      version: '1.0.0',
      description:
        'University club management. Every response is `{ success, data }` or `{ success: false, error }`; lists add `meta` (D9). Browsers call it through the Next.js app at /api, which carries the session cookie.',
    },
    servers: [{ url: '/' }],
  });
}
