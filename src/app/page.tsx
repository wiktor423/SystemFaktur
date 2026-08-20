import { redirect } from "next/navigation";

/** Punktem wejścia jest rejestr dokumentów — centralny widok modułu. */
export default function Home() {
  redirect("/rejestr");
}
