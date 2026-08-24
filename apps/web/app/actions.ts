"use server";

import { cookies } from "next/headers";
import { localeCookieName } from "../lib/locale";

export async function setSiteLocale(formData: FormData) {
  const locale = formData.get("locale");

  if (locale !== "zh" && locale !== "en") {
    return;
  }

  (await cookies()).set(localeCookieName, locale, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
