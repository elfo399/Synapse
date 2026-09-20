"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import "./select.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface AppSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  "aria-label": string;
  "aria-describedby"?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

// Radix reserves an empty value for its placeholder. Prefix every value so that
// the application's "all items" option can still use an ordinary empty string.
const encodeValue = (value: string) => `option:${value}`;

export function AppSelect({
  value,
  onValueChange,
  options,
  className = "",
  disabled,
  ...labelProps
}: AppSelectProps) {
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? value;
  return (
    <Select.Root
      value={encodeValue(value)}
      onValueChange={(encoded) => onValueChange(encoded.slice(7))}
      disabled={disabled}
    >
      <Select.Trigger {...labelProps} className={`select-trigger ${className}`}>
        <span className="select-value">
          <Select.Value>{selectedLabel}</Select.Value>
        </span>
        <Select.Icon className="select-chevron">
          <ChevronDown size={15} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="select-content"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <Select.ScrollUpButton className="select-scroll">
            <ChevronUp size={15} aria-hidden="true" />
          </Select.ScrollUpButton>
          <Select.Viewport className="select-viewport">
            {options.map((option) => (
              <Select.Item
                className="select-option"
                value={encodeValue(option.value)}
                key={option.value}
                disabled={option.disabled}
                textValue={option.label}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="select-check">
                  <Check size={14} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="select-scroll">
            <ChevronDown size={15} aria-hidden="true" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
