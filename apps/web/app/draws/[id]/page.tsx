"use client";

import { useParams } from "next/navigation";
import { DrawDetail } from "@/components/DrawDetail";

export default function DrawPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return null;
  return <DrawDetail id={params.id} />;
}
