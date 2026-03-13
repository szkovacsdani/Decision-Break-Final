"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { getSupabase } from "@/lib/supabase";

const supabase = getSupabase();
