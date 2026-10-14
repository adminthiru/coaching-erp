"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { DataTable, type Column } from "@/components/data-display/data-table";
import { PersonCell, CurrencyCell, DateCell, AttendanceCell } from "@/components/data-display/cells";
import { StatusBadge, type StatusKey } from "@/components/data-display/status-badge";
import { MetricCard } from "@/components/data-display/metric-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface Student {
  id: string;
  name: string;
  batch: string;
  status: StatusKey;
  due: number;
  attendance: number;
  lastPaid: string;
}

const STUDENTS: Student[] = [
  { id: "STU-01842", name: "Riya Sharma", batch: "XII-A · JEE", status: "paid", due: 0, attendance: 96, lastPaid: "2026-08-18" },
  { id: "STU-01790", name: "Arjun Mehta", batch: "XI-B · NEET", status: "overdue", due: 9000, attendance: 74, lastPaid: "2026-06-02" },
  { id: "STU-01755", name: "Kavya Iyer", batch: "X-C · Foundation", status: "pending", due: 4500, attendance: 88, lastPaid: "2026-07-11" },
];

/** Reference page: how a module is assembled. No one-off UI anywhere in it. */
export default function StudentsPage() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState("overview");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>({ key: "name", dir: "asc" });
  const [confirming, setConfirming] = React.useState(false);

  const data = STUDENTS.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

  const columns: Column<Student>[] = [
    { key: "name", header: "Student", sortable: true, mobile: "primary", cell: (r) => <PersonCell name={r.name} meta={r.id} /> },
    { key: "batch", header: "Batch", cell: (r) => <span className="text-fg-secondary">{r.batch}</span> },
    { key: "status", header: "Fee status", mobile: "secondary", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "due", header: "Amount due", align: "right", sortable: true, mobile: "secondary", cell: (r) => <CurrencyCell value={r.due} tone="plain" /> },
    { key: "attendance", header: "Attendance", align: "right", mobile: "meta", cell: (r) => <AttendanceCell percent={r.attendance} /> },
    { key: "lastPaid", header: "Last paid", cell: (r) => <DateCell value={r.lastPaid} /> },
  ];

  return (
    <AppShell activeHref="/students">
      <PageHeader
        breadcrumbs={[{ label: "Academic" }, { label: "Students" }]}
        title="Students"
        description="Manage students enrolled in your coaching center."
        actions={
          <>
            <Button variant="outline">Export</Button>
            <Button onClick={() => toast({ kind: "success", title: "Student added", description: "Riya Sharma was enrolled in XII-A." })}>
              Add Student
            </Button>
          </>
        }
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "attendance", label: "Attendance" },
              { value: "fees", label: "Fees", count: 12 },
              { value: "documents", label: "Documents" },
            ]}
          />
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Total Students" value="1,248" delta={8.4} description="vs last month" trend={[4, 6, 5, 9, 8, 12, 14, 17]} />
          <MetricCard title="Fees Collected" value="₹12.5L" delta={3.1} description="₹12,52,400 collected" trend={[8, 6, 12, 10, 14, 13, 17, 18]} />
          <MetricCard title="Pending Fees" value="₹1,86,000" delta={12} deltaLabel="12 overdue" invertDelta description="of 74 invoices" trend={[10, 9, 13, 8, 12, 9, 14, 16]} />
          <MetricCard title="Avg. Attendance" value="92.4%" delta={0} description="last 30 days" trend={[11, 12, 10, 13, 10, 12, 11, 12]} />
        </div>

        <DataTable
          columns={columns}
          data={data}
          getRowId={(r) => r.id}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          sort={sort}
          onSortChange={setSort}
          toolbar={<div className="w-full max-w-[260px]"><SearchInput value={query} onChange={(e) => setQuery(e.target.value)} /></div>}
          bulkActions={() => (
            <>
              <Button size="sm" variant="outline">Send reminder</Button>
              <Button size="sm" variant="outline" className="border-error text-error hover:bg-error-soft" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            </>
          )}
          rowActions={(row) => (
            <Dropdown
              heading={row.name}
              trigger={<Button size="sm" variant="ghost" iconOnly aria-label={`Actions for ${row.name}`}>⋯</Button>}
              items={[
                { label: "View details", onSelect: () => {} },
                { label: "Record payment", onSelect: () => {} },
                { label: "Edit student", onSelect: () => {} },
                "separator",
                { label: "Delete student", destructive: true, onSelect: () => setConfirming(true) },
              ]}
            />
          )}
          empty={
            <EmptyState
              title="No students found"
              description="Add your first student to start managing your coaching center."
              action={<Button>Add Student</Button>}
              secondaryAction={<Button variant="outline">Import CSV</Button>}
            />
          }
          pagination={{ page: 1, pageCount: 3, onChange: () => {}, summary: `Showing ${data.length} of 1,248 students` }}
        />
      </div>

      <ConfirmDialog
        open={confirming}
        destructive
        onClose={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); toast({ kind: "error", title: "Students deleted", description: "3 records were removed." }); }}
        title={`Delete ${selected.size || 1} students?`}
        description="Their attendance history, fee records and exam results will be permanently removed. This action cannot be undone."
        confirmLabel="Delete students"
      />
    </AppShell>
  );
}
