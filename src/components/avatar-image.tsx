"use client";
import Image from "next/image";
import { useState } from "react";
import { initials } from "@/lib/format";
export function AvatarImage({
  name,
  url,
  small = false,
}: {
  name: string;
  url: string;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className={`avatar ${small ? "small" : ""}`}>{initials(name)}</span>
    );
  return (
    <Image
      src={url}
      alt=""
      width={small ? 32 : 43}
      height={small ? 32 : 43}
      unoptimized
      className={`avatar avatar-photo ${small ? "small" : ""}`}
      onError={() => setFailed(true)}
    />
  );
}
