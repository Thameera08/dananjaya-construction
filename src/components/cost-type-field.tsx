"use client";

import { useId, useState } from "react";
import type { CostType } from "@/db/schema";
import { COST_TYPE_HELP, COST_TYPE_LABELS } from "@/lib/constants";
import { Field, Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const BASES = Object.keys(COST_TYPE_LABELS) as CostType[];

/**
 * Cost type: pick a base type or an existing custom one, or type a new name. A new name
 * asks what it counts as (project cost, personal, company asset) and is saved for reuse.
 */
export function CostTypeField({
  types,
  defaultName = "Supplier",
  defaultBase = "SUPPLIER",
}: {
  types: { name: string; baseType: CostType }[];
  defaultName?: string;
  defaultBase?: CostType;
}) {
  const listId = useId();
  const [name, setName] = useState(defaultName);
  const [base, setBase] = useState<CostType>(defaultBase);

  const n = name.trim().toLowerCase();
  const baseHit = BASES.find((b) => COST_TYPE_LABELS[b].toLowerCase() === n);
  const customHit = types.find((t) => t.name.toLowerCase() === n);
  const effective: CostType = baseHit ?? customHit?.baseType ?? base;
  const isNew = !!n && !baseHit && !customHit;
  const special = effective === "PERSONAL" || effective === "ASSET";

  return (
    <>
      <Field label="Cost type" hint={isNew ? "New type: it will be saved for next time" : "Pick one, or type a new type"}>
        <Input
          name="costTypeName"
          list={listId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Supplier, Personal, Machinery hire"
          autoComplete="off"
          required
        />
        <datalist id={listId}>
          {BASES.map((b) => (
            <option key={b} value={COST_TYPE_LABELS[b]} />
          ))}
          {types.map((t) => (
            <option key={t.name} value={t.name} />
          ))}
        </datalist>
      </Field>
      <Field
        label="Counts as"
        hint={
          <span className={cn(special && "font-medium text-[#92400e]")}>
            {COST_TYPE_HELP[effective]}
            {special ? ". Can't be linked to a BOQ item." : ""}
          </span>
        }
      >
        {/* Only needed for a NEW type; known types keep their own behaviour. */}
        <Select name="costBase" value={effective} onChange={(e) => setBase(e.target.value as CostType)} disabled={!isNew}>
          {BASES.map((b) => (
            <option key={b} value={b}>
              {COST_TYPE_LABELS[b]}: {COST_TYPE_HELP[b].toLowerCase()}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
