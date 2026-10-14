'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, FormModal, FormRow, FormSection, Input, Select, Switch, useToast,
} from '@acadia/ui';
import { HOSTEL_OCCUPANCY_LABEL, HostelOccupancy, type HostelOccupancy as Occupancy } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Room { roomNumber: string; floor: string; capacity: string }

/** Spec §66 — a hostel, branch-specific or centralised. */
export function CreateHostelDrawer({
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
  const [code, setCode] = React.useState('');
  const [occupancy, setOccupancy] = React.useState<Occupancy>(HostelOccupancy.MIXED);
  const [wardenName, setWardenName] = React.useState('');
  const [wardenPhone, setWardenPhone] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [rooms, setRooms] = React.useState<Room[]>([{ roomNumber: '101', floor: '', capacity: '2' }]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCentral(false);
    setBranchId(activeBranch?.id ?? null);
    setName(''); setCode(''); setOccupancy(HostelOccupancy.MIXED);
    setWardenName(''); setWardenPhone(''); setAddress('');
    setRooms([{ roomNumber: '101', floor: '', capacity: '2' }]);
    setErrors({}); setFormError(null);
  }, [open, activeBranch]);

  const effectiveBranch = branchId ?? activeBranch?.id ?? null;
  const beds = rooms.reduce((sum, r) => sum + (Number(r.capacity) || 0), 0);
  const complete = name.trim().length >= 2 && code.trim().length >= 2 && (central || Boolean(effectiveBranch));

  function update(i: number, patch: Partial<Room>) {
    setRooms((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
  }

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api('/hostels', {
        method: 'POST',
        body: {
          branchId: central ? null : effectiveBranch,
          name: name.trim(),
          code: code.trim().toUpperCase(),
          occupancy,
          address: address.trim() || undefined,
          wardenName: wardenName.trim() || undefined,
          wardenPhone: wardenPhone.trim() || undefined,
          rooms: rooms
            .filter((r) => r.roomNumber.trim())
            .map((r) => ({ roomNumber: r.roomNumber.trim(), floor: r.floor.trim() || undefined, capacity: Number(r.capacity) || 2 })),
        },
      });
      toast({ kind: 'success', title: 'Hostel created', description: `${name.trim()} — ${beds} bed${beds === 1 ? '' : 's'}.` });
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
      title="New hostel"
      description="Add rooms now or later — a hostel with no rooms simply has no beds to allocate."
      onSubmit={submit}
      submitLabel="Create hostel"
      canSubmit={Boolean(complete)}
      busy={busy}
      banner={formError ? <Alert tone="error">{formError}</Alert> : undefined}
      steps={[

        {
          label: "Details",
          hint: "Name it and record the warden.",
          canContinue: Boolean(name.trim().length >= 2 && code.trim().length >= 2),
          content: (
            <FormSection title="Hostel">
        <FormRow>
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Ganga Boys Hostel" />
          <Input
            label="Code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={errors.code}
            helperText="Unique within your organization."
          />
        </FormRow>
        <FormRow>
          <Select
            label="Occupancy"
            options={(Object.keys(HOSTEL_OCCUPANCY_LABEL) as Occupancy[]).map((o) => ({ value: o, label: HOSTEL_OCCUPANCY_LABEL[o] }))}
            value={occupancy}
            onChange={(v) => setOccupancy(v as Occupancy)}
          />
          <Input label="Warden" value={wardenName} onChange={(e) => setWardenName(e.target.value)} error={errors.wardenName} />
        </FormRow>
        <FormRow>
          <Input label="Warden phone" value={wardenPhone} onChange={(e) => setWardenPhone(e.target.value)} error={errors.wardenPhone} />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} />
        </FormRow>
            </FormSection>
          ),
        },

        {
          label: "Ownership",
          hint: "A branch hostel takes only that branch.",
          canContinue: Boolean(central || effectiveBranch),
          content: (
            <FormSection title="Whose hostel this is">
        {canCentralize && (
          <Switch
            label="Centralised"
            description="Serves every branch. Turn off to keep it to one branch's students."
            checked={central}
            onChange={setCentral}
          />
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
          ),
        },

        {
          label: "Rooms",
          hint: "Rooms can be added later too.",
          content: (
            <FormSection title="Rooms" description={`${beds} bed${beds === 1 ? '' : 's'} in total.`}>
        <div className="flex flex-col gap-2">
          {rooms.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <Input aria-label="Room number" className="flex-1" placeholder="101" value={r.roomNumber} onChange={(e) => update(i, { roomNumber: e.target.value })} />
              <Input aria-label="Floor" className="w-[100px]" placeholder="Ground" value={r.floor} onChange={(e) => update(i, { floor: e.target.value })} />
              <Input aria-label="Beds" type="number" min="1" max="20" className="w-[80px]" value={r.capacity} onChange={(e) => update(i, { capacity: e.target.value })} />
              {rooms.length > 1 && (
                <Button size="sm" variant="ghost" onClick={() => setRooms((prev) => prev.filter((_, ri) => ri !== i))}>Remove</Button>
              )}
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setRooms((prev) => [...prev, { roomNumber: '', floor: '', capacity: '2' }])}>
          Add room
        </Button>
            </FormSection>
          ),
        },
      ]}
    />
  );
}
