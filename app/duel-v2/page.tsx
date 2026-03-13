"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { getSupabase } from "@/lib/supabase";

const supabase = getSupabase();

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
