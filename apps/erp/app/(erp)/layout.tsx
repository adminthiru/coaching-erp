'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AppShell, Button, type NavGroup,
  AdmissionsIcon, AnnouncementIcon, AttendanceIcon, BuildingIcon, CalendarIcon, ChartIcon,
  CheckSquareIcon, DashboardIcon, DoubtsIcon, FeesIcon, HomeworkIcon, LayersIcon, LeaveIcon,
  MaterialsIcon, MessIcon, QuestionBankIcon, ReceiptIcon, SettingsIcon, SyllabusIcon,
  TransportIcon, UsersIcon, WalletIcon,
} from '@acadia/ui';
import { useSession } from '@/lib/session';
import { BranchSwitcher } from '@/components/branch-switcher';

const ROLE_LABEL: Record<string, string> = {
  ORG_OWNER: 'Organization Owner',
  ORG_ADMIN: 'Organization Admin',
  BRANCH_ADMIN: 'Branch Admin',
  FACULTY: 'Faculty',
  COUNSELLOR: 'Counsellor',
  ACCOUNTANT: 'Accountant',
};

/**
 * Navigation reflects what Phase 1 actually ships. Academic and finance modules
 * appear as their phases land, rather than as links into nothing.
 */
function navFor(role: string): NavGroup[] {
  const orgLevel = role === 'ORG_OWNER' || role === 'ORG_ADMIN';
  return [
    { items: [{ label: 'Dashboard', href: '/dashboard', icon: <DashboardIcon /> }] },
    {
      label: 'Academic',
      items: [
        { label: 'Admissions', href: '/admissions', icon: <AdmissionsIcon /> },
        { label: 'Students', href: '/students', icon: <UsersIcon /> },
        { label: 'Batches', href: '/batches', icon: <LayersIcon /> },
        { label: 'Timetable', href: '/timetable', icon: <CalendarIcon /> },
        { label: 'Syllabus', href: '/syllabus', icon: <SyllabusIcon /> },
        { label: 'Attendance', href: '/attendance', icon: <AttendanceIcon /> },
      ],
    },
    {
      label: 'Assessment',
      items: [
        { label: 'Question Bank', href: '/questions', icon: <QuestionBankIcon /> },
        { label: 'Tests', href: '/tests', icon: <CheckSquareIcon /> },
        { label: 'Reports', href: '/reports', icon: <ChartIcon /> },
      ],
    },
    {
      label: 'Learning',
      items: [
        { label: 'Homework', href: '/homework', icon: <HomeworkIcon /> },
        { label: 'Study Materials', href: '/materials', icon: <MaterialsIcon /> },
        { label: 'Doubts', href: '/doubts', icon: <DoubtsIcon /> },
      ],
    },
    {
      label: 'Finance',
      items: [
        { label: 'Fees', href: '/fees', icon: <FeesIcon /> },
        { label: 'Payments', href: '/payments', icon: <ReceiptIcon /> },
        { label: 'Expenses', href: '/expenses', icon: <WalletIcon /> },
      ],
    },
    {
      label: 'Facilities',
      items: [
        { label: 'Hostel', href: '/hostels', icon: <BuildingIcon /> },
        { label: 'Transport', href: '/transport', icon: <TransportIcon /> },
        { label: 'Mess', href: '/mess', icon: <MessIcon /> },
      ],
    },
    {
      label: 'Operations',
      items: [
        { label: 'Leave', href: '/leave', icon: <LeaveIcon /> },
        { label: 'Announcements', href: '/announcements', icon: <AnnouncementIcon /> },
      ],
    },
    {
      label: 'Organization',
      items: [
        { label: 'Branches', href: '/branches', icon: <BuildingIcon /> },
        { label: 'Staff', href: '/staff', icon: <UsersIcon /> },
        ...(orgLevel ? [{ label: 'Settings', href: '/settings', icon: <SettingsIcon /> }] : []),
      ],
    },
  ];
}

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, organization, status, signOut } = useSession();

  if (status !== 'authenticated' || !user || !organization) {
    return <div className="grid min-h-screen place-items-center text-body-sm text-fg-muted">Loading…</div>;
  }

  return (
    <AppShell
      groups={navFor(user.role)}
      activeHref={pathname}
      workspace={{ name: organization.name, subtitle: '', initial: organization.name.charAt(0).toUpperCase() }}
      user={{ name: user.name, role: ROLE_LABEL[user.role] ?? user.role }}
      workspaceSlot={<BranchSwitcher />}
      renderLink={({ href, children: linkChildren, ...rest }) => (
        <Link href={href} {...rest}>{linkChildren}</Link>
      )}
      footerSlot={
        <Button variant="ghost" size="sm" fullWidth onClick={() => void signOut()}>
          Sign out
        </Button>
      }
    >
      {children}
    </AppShell>
  );
}
