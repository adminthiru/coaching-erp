'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, CurrencyInput, FormModal, FormRow, FormSection, Input, Switch, useToast,
} from '@acadia/ui';
import { toMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';

/** Spec §67 — a vehicle and the driver who runs it. */
export function CreateVehicleDrawer({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { activeBranch, branches, scope: sessionScope } = useSession();
  const canShare = sessionScope?.canSelectAllBranches ?? false;

  const [shared, setShared] = React.useState(false);
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [registration, setRegistration] = React.useState('');
  const [model, setModel] = React.useState('');
  const [capacity, setCapacity] = React.useState('30');
  const [driverName, setDriverName] = React.useState('');
  const [driverPhone, setDriverPhone] = React.useState('');
  const [driverLicence, setDriverLicence] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setShared(false); setBranchId(activeBranch?.id ?? null);
    setRegistration(''); setModel(''); setCapacity('30');
    setDriverName(''); setDriverPhone(''); setDriverLicence('');
    setErrors({}); setFormError(null);
  }, [open, activeBranch]);

  const effectiveBranch = branchId ?? activeBranch?.id ?? null;
  const complete = registration.trim().length >= 4 && (shared || Boolean(effectiveBranch));

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api('/transport/vehicles', {
        method: 'POST',
        body: {
          branchId: shared ? null : effectiveBranch,
          registration: registration.trim().toUpperCase(),
          model: model.trim() || undefined,
          capacity: Number(capacity) || 30,
          driverName: driverName.trim() || undefined,
          driverPhone: driverPhone.trim() || undefined,
          driverLicence: driverLicence.trim() || undefined,
        },
      });
      toast({ kind: 'success', title: 'Vehicle added', description: registration.trim().toUpperCase() });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title="New vehicle"
      description="Drivers are recorded here rather than as staff accounts — they do not sign in."
      onSubmit={submit}
      submitLabel="Add vehicle"
      canSubmit={Boolean(complete)}
      busy={busy}
      banner={formError ? <Alert tone="error">{formError}</Alert> : undefined}
      steps={[
        {
          label: "Vehicle",
          hint: "Registration and seat count.",
          canContinue: Boolean(registration.trim().length >= 4),
          content: (
      <FormSection title="Vehicle">
        <FormRow>
          <Input label="Registration" required value={registration} onChange={(e) => setRegistration(e.target.value.toUpperCase())} error={errors.registration} placeholder="TN 09 AB 1234" />
          <Input label="Seats" type="number" min="1" max="120" required value={capacity} onChange={(e) => setCapacity(e.target.value)} error={errors.capacity} />
        </FormRow>
        <Input label="Model" value={model} onChange={(e) => setModel(e.target.value)} error={errors.model} placeholder="Tata Starbus" />
            </FormSection>
          ),
        },
        {
          label: "Driver",
          hint: "Who drives it, and how to reach them.",
          content: (
            <FormSection title="Driver">
        <FormRow>
          <Input label="Name" value={driverName} onChange={(e) => setDriverName(e.target.value)} error={errors.driverName} />
          <Input label="Phone" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} error={errors.driverPhone} />
        </FormRow>
        <Input label="Licence number" value={driverLicence} onChange={(e) => setDriverLicence(e.target.value)} error={errors.driverLicence} />
            </FormSection>
          ),
        },
        {
          label: "Ownership",
          hint: "A branch vehicle serves only that branch's routes.",
          content: (
            <FormSection title="Whose vehicle this is">
        {canShare && (
          <Switch label="Shared across branches" description="Available to every branch's routes." checked={shared} onChange={setShared} />
        )}
        {!shared && branches.length > 1 && (
          <Combobox
            label="Branch"
            required
            placeholder="Select a branch"
            options={branches.map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
            value={effectiveBranch}
            onChange={setBranchId}
            error={errors.branchId}
          />
        )}
            </FormSection>
          ),
        },
      ]}
    />
  );
}

interface Stop { name: string; landmark: string; pickupTime: string; dropTime: string }
interface VehicleOption { id: string; registration: string; capacity: number; status: string }

/** Spec §67 — a route and the stops along it. */
export function CreateRouteDrawer({
  open, vehicles, onClose, onCreated,
}: {
  open: boolean;
  vehicles: VehicleOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { activeBranch, branches, scope: sessionScope } = useSession();
  const canShare = sessionScope?.canSelectAllBranches ?? false;

  const [shared, setShared] = React.useState(false);
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [vehicleId, setVehicleId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [fare, setFare] = React.useState('');
  const [stops, setStops] = React.useState<Stop[]>([{ name: '', landmark: '', pickupTime: '07:30', dropTime: '' }]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setShared(false); setBranchId(activeBranch?.id ?? null); setVehicleId(null);
    setName(''); setCode(''); setFare('');
    setStops([{ name: '', landmark: '', pickupTime: '07:30', dropTime: '' }]);
    setErrors({}); setFormError(null);
  }, [open, activeBranch]);

  const effectiveBranch = branchId ?? activeBranch?.id ?? null;
  const filled = stops.filter((s) => s.name.trim() && s.pickupTime);
  const complete = name.trim().length >= 2 && code.trim().length >= 2 && filled.length > 0 && (shared || Boolean(effectiveBranch));

  function update(i: number, patch: Partial<Stop>) {
    setStops((prev) => prev.map((s, si) => (si === i ? { ...s, ...patch } : s)));
  }

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api('/transport/routes', {
        method: 'POST',
        body: {
          branchId: shared ? null : effectiveBranch,
          vehicleId: vehicleId ?? undefined,
          name: name.trim(),
          code: code.trim().toUpperCase(),
          fareMinor: fare ? toMinor(Number(fare)) : 0,
          stops: filled.map((s) => ({
            name: s.name.trim(),
            landmark: s.landmark.trim() || undefined,
            pickupTime: s.pickupTime,
            dropTime: s.dropTime || undefined,
          })),
        },
      });
      toast({ kind: 'success', title: 'Route created', description: `${name.trim()} · ${filled.length} stop${filled.length === 1 ? '' : 's'}.` });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title="New route"
      description="Stops are listed in pickup order. Seats come from the assigned vehicle."
      onSubmit={submit}
      submitLabel="Create route"
      canSubmit={Boolean(complete)}
      busy={busy}
      banner={formError ? <Alert tone="error">{formError}</Alert> : undefined}
      steps={[
        {
          label: "Route",
          hint: "Name it, price it, and give it a vehicle.",
          canContinue: Boolean(name.trim().length >= 2 && code.trim().length >= 2),
          content: (
      <FormSection title="Route">
        <FormRow>
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Velachery — Adyar" />
          <Input label="Code" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} error={errors.code} />
        </FormRow>
        <FormRow>
          <Combobox
            label="Vehicle"
            placeholder="Assign later"
            options={vehicles.filter((v) => v.status === 'ACTIVE').map((v) => ({ value: v.id, label: v.registration, meta: `${v.capacity} seats` }))}
            value={vehicleId}
            onChange={setVehicleId}
            error={errors.vehicleId}
            helperText="Without a vehicle the route has no seat limit."
          />
          <CurrencyInput label="Fare per term" value={fare} onChange={(e) => setFare(e.target.value)} error={errors.fareMinor} />
        </FormRow>
        {canShare && (
          <Switch label="Shared across branches" checked={shared} onChange={setShared} />
        )}
        {!shared && branches.length > 1 && (
          <Combobox
            label="Branch"
            required
            placeholder="Select a branch"
            options={branches.map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
            value={effectiveBranch}
            onChange={setBranchId}
            error={errors.branchId}
          />
        )}
            </FormSection>
          ),
        },
        {
          label: "Stops",
          hint: "In the order the vehicle reaches them.",
          content: (
            <FormSection title="Stops" description="In the order the vehicle reaches them.">
        <div className="flex flex-col gap-2">
          {stops.map((s, i) => (
            <div key={i} className="flex items-end gap-2">
              <span className="pb-2.5 font-mono text-caption text-fg-muted">{i + 1}</span>
              <Input aria-label="Stop name" className="flex-1" placeholder="Velachery signal" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
              <Input aria-label="Pickup time" type="time" className="w-[120px]" value={s.pickupTime} onChange={(e) => update(i, { pickupTime: e.target.value })} />
              {stops.length > 1 && (
                <Button size="sm" variant="ghost" onClick={() => setStops((prev) => prev.filter((_, si) => si !== i))}>Remove</Button>
              )}
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setStops((prev) => [...prev, { name: '', landmark: '', pickupTime: '', dropTime: '' }])}>
          Add stop
        </Button>
        {errors.stops && <span className="text-caption text-error">{errors.stops}</span>}
            </FormSection>
          ),
        },
      ]}
    />
  );
}

/** Spec §68 — a mess plan, priced per month. */
export function CreateMessPlanDrawer({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { activeBranch, branches, scope: sessionScope } = useSession();
  const canCentralize = sessionScope?.canSelectAllBranches ?? false;

  const [central, setCentral] = React.useState(false);
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [fare, setFare] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCentral(false); setBranchId(activeBranch?.id ?? null);
    setName(''); setDescription(''); setFare('');
    setErrors({}); setFormError(null);
  }, [open, activeBranch]);

  const effectiveBranch = branchId ?? activeBranch?.id ?? null;
  const complete = name.trim().length >= 2 && (central || Boolean(effectiveBranch));

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api('/mess/plans', {
        method: 'POST',
        body: {
          branchId: central ? null : effectiveBranch,
          name: name.trim(),
          description: description.trim() || undefined,
          monthlyFareMinor: fare ? toMinor(Number(fare)) : 0,
        },
      });
      toast({ kind: 'success', title: 'Mess plan created', description: name.trim() });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="md"
      title="New mess plan"
      description="Students subscribe to one plan at a time."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Create plan</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <FormSection title="Plan">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Full board — vegetarian" />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} placeholder="Breakfast, lunch and dinner" />
        <CurrencyInput label="Monthly fare" value={fare} onChange={(e) => setFare(e.target.value)} error={errors.monthlyFareMinor} />
        {canCentralize && (
          <Switch label="Centralised" description="Available at every branch." checked={central} onChange={setCentral} />
        )}
        {!central && branches.length > 1 && (
          <Combobox
            label="Branch"
            required
            placeholder="Select a branch"
            options={branches.map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
            value={effectiveBranch}
            onChange={setBranchId}
            error={errors.branchId}
          />
        )}
      </FormSection>
    </FormModal>
  );
}
