/**
 * Acadia UI — the single source of visual truth for the platform.
 *
 * Rules (enforced by review, not by the compiler):
 *  - Never hardcode a hex. Use bg-surface / text-fg-muted / border-border-strong.
 *  - Status colour is semantic and fixed: paid/present = success, pending/late =
 *    warning, overdue/absent = error. Branding changes --primary only.
 *  - Compose, never fork. There is one <Button>, not a <StudentButton>.
 *  - Need something that doesn't exist? Add it here first, then use it.
 */

// primitives
export * from "./components/ui/button";
export * from "./components/ui/input";
export * from "./components/ui/textarea";
export * from "./components/ui/select";
export * from "./components/ui/combobox";
export * from "./components/ui/checkbox";
export * from "./components/ui/radio";
export * from "./components/ui/switch";
export * from "./components/ui/segmented";
export * from "./components/ui/badge";
export * from "./components/ui/avatar";
export * from "./components/ui/card";
export * from "./components/ui/tabs";
export * from "./components/ui/tooltip";
export * from "./components/ui/dropdown";
export * from "./components/ui/floating-menu";
export * from "./components/ui/dialog";
export * from "./components/ui/drawer";
export * from "./components/ui/form-modal";
export * from "./components/ui/toast";
export * from "./components/ui/alert";
export * from "./components/ui/progress";
export * from "./components/ui/skeleton";
export * from "./components/ui/empty-state";
export * from "./components/ui/error-state";
export * from "./components/ui/pagination";
export * from "./components/ui/file-upload";
export * from "./components/ui/date-range";

// forms
export * from "./components/forms/form";

// layout
export * from "./components/layout/sidebar";
export * from "./components/layout/page-header";
export * from "./components/layout/app-shell";

// data display
export * from "./components/data-display/data-table";
export * from "./components/data-display/cells";
export * from "./components/data-display/metric-card";
export * from "./components/data-display/status-badge";
export * from "./components/data-display/chart";

// icons
export * from "./components/icons";

// helpers
export * from "./lib/cn";
export * from "./lib/format";
