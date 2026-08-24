import {
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export function Button({ children, icon, ...props }: {
  readonly children?: ReactNode;
  readonly icon?: ReactNode;
  readonly variant?: string;
  readonly size?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { variant: _variant, size: _size, ...buttonProps } = props;
  return createElement("button", buttonProps, icon, children);
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return createElement("input", props);
}

export function IconPlusOutline16() {
  return createElement("svg", { "aria-hidden": true });
}

export function Modal({ open, children, footer, title }: {
  readonly open: boolean;
  readonly children?: ReactNode;
  readonly footer?: ReactNode;
  readonly title: string;
  readonly onClose: () => void;
  readonly closeLabel?: string;
  readonly description?: string;
}) {
  if (!open) return null;
  return createElement("div", { role: "dialog", "aria-label": title }, children, footer);
}
