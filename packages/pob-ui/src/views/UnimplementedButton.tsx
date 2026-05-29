import {
  buildPobUnimplementedClassName,
  getPobUnimplementedControlAttributes,
  type PobUnimplementedControlId,
} from "./unimplementedControls";

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";

interface PobUnimplementedButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "onClick"
> {
  controlId: PobUnimplementedControlId;
  notice: string;
  onNotice: (notice: string) => void;
  children: ReactNode;
}

export function PobUnimplementedButton({
  controlId,
  notice,
  onNotice,
  className,
  title,
  type = "button",
  children,
  ...props
}: PobUnimplementedButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onNotice(notice);
  };

  return (
    <button
      {...props}
      {...getPobUnimplementedControlAttributes(controlId)}
      type={type}
      className={buildPobUnimplementedClassName(className)}
      title={title ?? notice}
      onClick={handleClick}
    >
      {children}
    </button>
  );
}
