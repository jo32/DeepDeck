import { createElement, type ButtonHTMLAttributes, type ReactNode } from "react";

export function Button({ children, icon, ...props }: {
  readonly children?: ReactNode;
  readonly icon?: ReactNode;
  readonly variant?: string;
  readonly size?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { variant: _variant, size: _size, ...buttonProps } = props;
  return createElement("button", buttonProps, icon, children);
}
