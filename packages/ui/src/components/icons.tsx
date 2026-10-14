"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Analytics01Icon,
  Book02Icon,
  BookOpen01Icon,
  Building01Icon,
  Bus01Icon,
  Calendar01Icon,
  CalendarRemove01Icon,
  CheckmarkSquare01Icon,
  CreditCardIcon,
  CustomerSupportIcon,
  DashboardSquare01Icon,
  File01Icon,
  Flag01Icon,
  Invoice01Icon,
  Layers01Icon,
  Megaphone01Icon,
  Money01Icon,
  Note01Icon,
  Quiz01Icon,
  Restaurant01Icon,
  Settings01Icon,
  Shield01Icon,
  Tag01Icon,
  TaskDaily01Icon,
  UserAdd01Icon,
  UserGroupIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";

/**
 * The application icon set — HugeIcons (free set, MIT), stroke style.
 *
 * These were hand-drawn inline SVGs on a 16px grid. Swapping the *bodies* while
 * keeping every exported name means the whole app changed icon library without
 * a single call site changing: `<UsersIcon />` still works everywhere.
 *
 * Colour still comes from `currentColor`, so an icon tints with its nav item
 * (including the primary tint when active) exactly as before.
 */
type IconProps = { size?: number; className?: string; strokeWidth?: number };

/** Wraps one HugeIcons glyph as a named component with our defaults. */
function icon(glyph: Parameters<typeof HugeiconsIcon>[0]["icon"]) {
  return function Icon({ size = 18, className, strokeWidth = 1.8 }: IconProps) {
    return (
      <HugeiconsIcon
        icon={glyph}
        size={size}
        className={className}
        color="currentColor"
        strokeWidth={strokeWidth}
        aria-hidden
      />
    );
  };
}

/* ── Names carried over from the previous set ───────────────────────────── */

export const DashboardIcon = icon(DashboardSquare01Icon);
export const BuildingIcon = icon(Building01Icon);
export const UsersIcon = icon(UserGroupIcon);
export const LayersIcon = icon(Layers01Icon);
export const CardIcon = icon(CreditCardIcon);
export const TagIcon = icon(Tag01Icon);
export const ChartIcon = icon(Analytics01Icon);
export const FlagIcon = icon(Flag01Icon);
export const LifebuoyIcon = icon(CustomerSupportIcon);
export const ShieldIcon = icon(Shield01Icon);
export const SettingsIcon = icon(Settings01Icon);
export const CalendarIcon = icon(Calendar01Icon);
export const CheckSquareIcon = icon(CheckmarkSquare01Icon);
export const FileIcon = icon(File01Icon);
export const WalletIcon = icon(Wallet01Icon);
export const ReceiptIcon = icon(Invoice01Icon);

/* ── Module-specific icons, so navigation is scannable by shape ─────────── */

export const AdmissionsIcon = icon(UserAdd01Icon);
export const SyllabusIcon = icon(BookOpen01Icon);
export const AttendanceIcon = icon(TaskDaily01Icon);
export const QuestionBankIcon = icon(Quiz01Icon);
export const HomeworkIcon = icon(Note01Icon);
export const MaterialsIcon = icon(Book02Icon);
export const DoubtsIcon = icon(CustomerSupportIcon);
export const FeesIcon = icon(Money01Icon);
export const TransportIcon = icon(Bus01Icon);
export const MessIcon = icon(Restaurant01Icon);
export const LeaveIcon = icon(CalendarRemove01Icon);
export const AnnouncementIcon = icon(Megaphone01Icon);
