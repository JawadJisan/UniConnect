import { z } from 'zod';
import {
  BLOOD_GROUPS,
  BLOOD_REQUEST_STATUSES,
  EVENT_REGISTRATION_STATUSES,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_TYPES,
  PAYMENT_STATUSES,
  ROLES,
  USER_TYPES,
} from '../constants/index.js';

export const userTypeSchema = z.enum(USER_TYPES);
export const roleSchema = z.enum(ROLES);
export const bloodGroupSchema = z.enum(BLOOD_GROUPS);
export const membershipTypeSchema = z.enum(MEMBERSHIP_TYPES);
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const eventVisibilitySchema = z.enum(EVENT_VISIBILITIES);
export const eventStatusSchema = z.enum(EVENT_STATUSES);
export const eventRegistrationStatusSchema = z.enum(EVENT_REGISTRATION_STATUSES);
export const bloodRequestStatusSchema = z.enum(BLOOD_REQUEST_STATUSES);

export type UserType = z.infer<typeof userTypeSchema>;
export type Role = z.infer<typeof roleSchema>;
export type BloodGroup = z.infer<typeof bloodGroupSchema>;
export type MembershipType = z.infer<typeof membershipTypeSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type EventVisibility = z.infer<typeof eventVisibilitySchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type EventRegistrationStatus = z.infer<typeof eventRegistrationStatusSchema>;
export type BloodRequestStatus = z.infer<typeof bloodRequestStatusSchema>;
