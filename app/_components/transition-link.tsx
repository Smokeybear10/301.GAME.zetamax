"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, type AnchorHTMLAttributes, type MouseEvent } from "react";

type Props = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children?: React.ReactNode;
  };

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => {
    finished: Promise<void>;
    ready: Promise<void>;
  };
};

export function TransitionLink({ href, children, onClick, ...rest }: Props) {
  const router = useRouter();

  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.button !== 0) return;
      if (typeof href !== "string") return;
      if (typeof document === "undefined") return;
      const doc = document as DocWithVT;
      if (typeof doc.startViewTransition !== "function") return;
      e.preventDefault();
      doc.startViewTransition(() => {
        router.push(href);
      });
    },
    [href, onClick, router],
  );

  return (
    <Link href={href} {...rest} onClick={handleClick}>
      {children}
    </Link>
  );
}
